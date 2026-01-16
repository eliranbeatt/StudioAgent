# Emlly Studio — Schema Enhancements v3
**Topic:** Strong task↔accounting connections + task sizing rules (1–4h / ½–2 days) + checklist breakdown support  
**Applies to:** Convex tables `tasks`, `materialLines`, `workLines`, `accountingSections` (unchanged), `changeSets` ops

> **Language/UI rule (critical):** enum keys may be English, but **all user-facing labels must be Hebrew**.  
> UI must never render enum keys directly (e.g., never show `printing_graphics`). Always map to Hebrew labels.

---

## 0) Design goals (what this enables)

1. **Bidirectional links**
   - From **Task → Accounting**: a task can point to **many** material/work lines (not just one).
   - From **Accounting → Task**: each material/work line has `taskId` (already in your description).

2. **Task cost rollups**
   - In Tasks UI you can show:  
     **עלות חומרים משוערת**, **עלות עבודה ישירה**, **עלות כוללת** per task.

3. **Scheduling**
   - Tasks store **start/end dates** (already requested) and duration.  
   - Agent produces tasks sized to realistic chunks.

4. **Atomic execution**
   - Tasks are “work packages” (1–4 hours OR ½–2 days).
   - Checklists break into **atomic** steps.

5. **Management/overhead safety**
   - `isManagement` remains authoritative: visible but excluded from direct labor totals.

---

## 1) Updated entities

### 1.1 `tasks` table — new/updated fields

**Existing (keep):**
- `isManagement?: boolean`

**Add:**
- `description?: string`  
  Practical execution notes (Hebrew). Should include safety/QA notes where relevant.
- `workType?: StudioWorkType`  
  Stored as enum key (English). **UI renders Hebrew label.**
- `workTypeLabelHe?: string`  
  Optional override for display (Hebrew).
- `plannedStartDate?: string` (YYYY-MM-DD)
- `plannedEndDate?: string` (YYYY-MM-DD)
- `estimatedHours?: number`  
  Total planned hours for this task.

**NEW: accounting linkage (multi-line)**
- `accountingLinks?: AccountingLink[]`

Where:
```ts
type AccountingLink = {
  lineType: "material" | "work";     // which table
  lineId: Id<"materialLines"> | Id<"workLines">;
  relation?: "primary" | "supporting"; // optional
  note?: string; // Hebrew note (optional)
};
```

**Why this structure:**  
Your current `accountingLineType + accountingLineId` supports only **one** line per task. Real tasks often require **many materials** plus **labor**. `accountingLinks[]` solves that while still being simple.

**Compatibility:**
- Keep old fields if they exist (`accountingLineType/accountingLineId`) but treat them as legacy.  
- Migration can append them into `accountingLinks[]` lazily.

---

### 1.2 `materialLines` table — reinforce task connection + BOM detail

**Keep:**
- `taskId?: Id<"tasks">`  ✅ (your description already uses this)

**Add (optional but recommended for BOM quality):**
- `workType?: StudioWorkType` (usually aligns with task)
- `workTypeLabelHe?: string`
- `itemName?: string` (Hebrew + brand/spec in English if needed)
- `spec?: string` (free text; sizes, thickness, finish)
- `quantity?: number`
- `unit?: "יח'" | "מטר" | "מ״ר" | "ק״ג" | "ליטר" | "סט" | "שעה" | "יום"`  // keep Hebrew units
- `wastePct?: number` (0–30 typical)
- `plannedUnitCost?: number` (ILS)
- `plannedTotalCost?: number` (optional; can be derived)
- `vendorId?: Id<"vendors">`
- `vendorName?: string` (fallback)
- `leadTimeDays?: number`
- `procurement?: "מלאי" | "קנייה מקומית" | "יבוא" | "השכרה"`
- `notes?: string`
- `source?: "אומדן סוכן" | "הצעת ספק" | "חשבונית" | "ידני"`
- `confidence?: number` (0–1)

**Optional (nice-to-have): connect to checklist step**
- `checklistItemId?: string`  
  Lets you tie a purchase to a specific atomic step.

---

### 1.3 `workLines` table — labor representation aligned to tasks

**Keep:**
- `taskId?: Id<"tasks">` ✅
- `isManagement?: boolean` ✅

**Add / standardize:**
- `workType?: StudioWorkType`
- `workTypeLabelHe?: string`
- `roleHe?: string` (e.g., "נגר", "מסגר", "עוזר סטודיו", "התקנה")
- `rateType?: "שעה" | "יום" | "פיקס"`
- `crewSize?: number` (default 1)
- `plannedQuantity?: number` (hours or days, depends on `rateType`)
- `plannedUnitCost?: number` (ILS per hour/day/flat)
- `plannedTotalCost?: number` (optional derived)
- `notes?: string`
- `source?: "אומדן סוכן" | "הצעת ספק" | "ידני"`
- `confidence?: number` (0–1)

---

## 2) StudioWorkType — enum keys + Hebrew mapping

**Enum keys (stored):**
- `carpentry`
- `metal_fab`
- `paint_finish`
- `printing_graphics`
- `props_sculpt`
- `rigging_install`
- `transport_logistics`
- `purchasing`
- `management`

**Hebrew label mapping (UI):**
- `carpentry` → "נגרות"
- `metal_fab` → "מסגרות/מתכת"
- `paint_finish` → "צבע וגימור"
- `printing_graphics` → "הדפסות/גרפיקה"
- `props_sculpt` → "פרופים/פיסול"
- `rigging_install` → "תלייה/התקנה"
- `transport_logistics` → "הובלה/לוגיסטיקה"
- `purchasing` → "קניות/רכש"
- `management` → "ניהול"

> **Hard rule:** In prose, always print the Hebrew label.  
> Enum key appears only inside JSON/data.

---

## 3) Task sizing rules (enforced by agent + validated lightly in UI)

### 3.1 Task duration targets
**Small task:** 1�4 hours  
**Large task:** 4�16 hours (1/2 day to 2 days)  
**Hard cap:** if > 16 hours → split into multiple tasks.

### 3.2 Checklist sizing rules
Checklist item target: **0.1�0.5 hours** each.

- For **small tasks (1�4h)**: typically **6�18** checklist items
- For **large tasks (1/2�2 days)**: typically **12�40** checklist items  
  (some items can be 0.75�1.5h if unavoidable, but prefer splitting)

### 3.3 Consistency rule
`sum(checklist.estimatedHours)` should be **~80–120%** of task `estimatedHours`.  
(agents should keep it tighter, but allow reality)

---

## 4) ChangeSet ops (so agents can create linked tasks + lines)

### 4.1 New / updated operation shapes

#### `task.create`
Must support:
- `description`, `workType`, `workTypeLabelHe`
- dates + estimates
- checklist array
- `accountingLinks[]` (may be empty initially; can patch later)

#### `materialLine.create`
Must support:
- `taskId`
- BOM fields (itemName/spec/qty/unit/cost/vendor/etc.)

#### `workLine.create`
Must support:
- `taskId`
- role/rateType/quantity/unit cost/crewSize/workType/isManagement

#### `task.patch`
Used for:
- appending `accountingLinks[]` after line creation (since IDs exist only after create)

> **Implementation tip:** in one ChangeSet, create tasks first, then create lines with `taskId`, then patch tasks to append `accountingLinks[]` with the created line IDs.

---

## 5) Migration plan (safe + incremental)

1. **Add fields as optional** (no breaking).
2. **Backfill mapping**:
   - If a task has legacy `accountingLineType/accountingLineId` → convert to `accountingLinks[0]`.
3. UI: show linked lines by:
   - Primary: `task.accountingLinks[]`
   - Secondary fallback: query `materialLines`/`workLines` where `taskId == task._id`
4. Once stable, deprecate legacy single-link fields.

---

## 6) UI/Logic updates (minimal but important)

### 6.1 Task view
- Show:
  - תאריך התחלה/סיום (plannedStartDate/plannedEndDate)
  - “תחום עבודה” badge (Hebrew)
  - Checklist progress
  - “עלות עבודה ישירה” (sum workLines where !isManagement)
  - “עלות חומרים” (sum materialLines)
  - Total

### 6.2 Accounting view
- For each line, show linked task title (via `taskId`)
- Allow filtering/grouping “לפי משימה”

### 6.3 Management exclusion (already your logic)
- If `workLine.isManagement` OR `task.isManagement`: exclude from direct labor total, but keep visible.

---

## 7) Convex schema patch (illustrative)

> Adjust names to your actual code conventions.

```ts
// tasks
accountingLinks: v.optional(v.array(v.object({
  lineType: v.union(v.literal("material"), v.literal("work")),
  lineId: v.id("materialLines") /* or v.id("workLines") via union in code */,
  relation: v.optional(v.union(v.literal("primary"), v.literal("supporting"))),
  note: v.optional(v.string()),
}))),
plannedStartDate: v.optional(v.string()),
plannedEndDate: v.optional(v.string()),
estimatedHours: v.optional(v.number()),
workType: v.optional(v.string()),
workTypeLabelHe: v.optional(v.string()),
description: v.optional(v.string()),
```

---

## 8) Agent contract (what agents must produce)

When the agent creates **labor tasks**:
- Create the task with `workType` + dates/estimate + checklist.
- Create at least one **workLine** linked with `taskId`.
- Patch task to include `accountingLinks[]` pointing to that workLine.

When the agent creates **material-heavy tasks**:
- Task created with checklist + estimates.
- Create one **materialLine per BOM item** with `taskId`.
- Patch task to include `accountingLinks[]` for all material lines.

When task is “mixed” (labor + materials):
- You can link **both** workLine + materialLines to the same task.

---

## 9) Notes on realism (studio-first)
- Purchases are often their own tasks (רכש/איסוף) but still can have materialLines attached.
- Installation tasks must attach:
  - `workLine` (crew/time)
  - sometimes `materialLines` (ברגים/דיבלים/כבלים/חומרי גיבוי)
- Transport tasks often attach:
  - `workLine` (loading/unloading)
  - `materialLine` for packaging (קרטונים/ספוגים/ניילון נצמד)

---



