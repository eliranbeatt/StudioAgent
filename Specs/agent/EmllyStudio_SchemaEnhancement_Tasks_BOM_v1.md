# Emlly Studio — Schema Enhancements (Tasks + Checklist + Dates + BOM detail)
Generated: 2026-01-08

This document proposes **non-breaking** schema upgrades for your Convex DB so the agents can produce **practical, executable studio plans**:
- Tasks have **start/end dates**, **rich descriptions**, and **checklists** (atomic steps).
- Each task/labor line is tagged with a **Studio Work Type** aligned to your playbooks (Emlly Studio reality).
- BOM becomes **structured** (qty/unit/spec/vendor/lead time/waste) via enriched `accountingLines` (estimate side) so it can drive quote + purchasing.

Sources: StudioOps + Studio Task & Pricing playbooks. (Language rules: keys English; content Hebrew)

---

## 1) New enums

### 1.1 `StudioWorkType` (task specialization)
Use this for routing, labor rates, and “are we missing workstreams?” auditing.

**Enum values (key → Hebrew label):**
- `planning_production` → תכנון/הפקה
- `design_art_direction` → ארט/עיצוב
- `procurement_pickups` → קניות/איסופים
- `vendor_management` → ספקים/הזמנות
- `fabrication_metal` → מסגרות/ריתוך
- `fabrication_carpentry` → נגרות/עץ
- `fabrication_foam` → פוליאוריתן/קצף/פיסול
- `fabrication_paint_finish` → צביעה/גימור
- `fabrication_sewing_softgoods` → תפירה/ריפוד/טקסטיל
- `fabrication_assembly` → הרכבה/חיבורים
- `printing_graphics` → הדפסות/גרפיקה
- `electrical_lighting` → חשמל/תאורה
- `rigging_hanging` → תלייה/ריגינג
- `qa_safety` → QA/בטיחות
- `packing_crating` → אריזה/קרייטינג
- `transport_logistics` → הובלה/לוגיסטיקה
- `install_on_site` → התקנה בשטח
- `teardown_returns` → פירוק/החזרות
- `accounting_admin` → אדמין/חשבונאות

> Notes:
> - Stage = lifecycle bucket (Clarification/Quote/Procurement/Build/Install/Teardown/Accounting).
> - WorkType = craft / responsibility domain (welding, paint, transport, etc.).
> - A task can be stage=Build but workType=printing_graphics (e.g., “apply vinyl on foamboard”).

---

## 2) Tasks table upgrades

### 2.1 Why
Your current task outputs are too shallow because the model isn’t forced to produce:
- executable instructions
- schedule anchors
- atomic steps
- craft ownership

### 2.2 Add fields (recommended)
Add these fields to `tasks` (all **optional** to keep backwards compatibility, but agents must fill them when possible):

- `description` (string): **required by agent**; Hebrew practical description.
- `stage` (union): `"clarification"|"quote"|"procurement"|"build"|"install"|"teardown"|"accounting"`
- `workType` (`StudioWorkType`)
- `plannedStartDate` (string, `YYYY-MM-DD`) — date-only
- `plannedEndDate` (string, `YYYY-MM-DD`)
- `estimatedHours` (number) — quick rollup for gantt and crew planning
- `checklist` (array of checklist items) — the *atomic particles*

### 2.3 Checklist item shape (`TaskChecklistItem`)
- `id` (string) — stable within the task
- `title` (string) — Hebrew action (“לחתוך צינורות לפי מידות”)
- `description` (string, optional) — brief practical note
- `workType` (`StudioWorkType`, optional)
- `estimatedHours` (number, optional)
- `order` (number)
- `done` (boolean)
- `dependsOnItemIds` (string[], optional)

### 2.4 Convex `schema.ts` patch (illustrative)
```ts
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const StudioWorkType = v.union(
  v.literal("planning_production"), v.literal("design_art_direction"), v.literal("procurement_pickups"), v.literal("vendor_management"), v.literal("fabrication_metal"), v.literal("fabrication_carpentry"), v.literal("fabrication_foam"), v.literal("fabrication_paint_finish"), v.literal("fabrication_sewing_softgoods"), v.literal("fabrication_assembly"), v.literal("printing_graphics"), v.literal("electrical_lighting"), v.literal("rigging_hanging"), v.literal("qa_safety"), v.literal("packing_crating"), v.literal("transport_logistics"), v.literal("install_on_site"), v.literal("teardown_returns"), v.literal("accounting_admin")
);

const TaskChecklistItem = v.object({
  id: v.string(),
  title: v.string(),
  description: v.optional(v.string()),
  workType: v.optional(StudioWorkType),
  estimatedHours: v.optional(v.number()),
  order: v.number(),
  done: v.boolean(),
  dependsOnItemIds: v.optional(v.array(v.string())),
});

export default defineSchema({
  // ...
  tasks: defineTable({
    projectId: v.id("projects"),
    title: v.string(),
    description: v.optional(v.string()),

    // existing fields...
    status: v.optional(v.string()),
    priority: v.optional(v.string()),
    category: v.optional(v.string()),
    parentTaskId: v.optional(v.id("tasks")),
    sortKey: v.optional(v.string()),
    dependencies: v.optional(v.array(v.id("tasks"))),

    // NEW:
    stage: v.optional(v.union(
      v.literal("clarification"),
      v.literal("quote"),
      v.literal("procurement"),
      v.literal("build"),
      v.literal("install"),
      v.literal("teardown"),
      v.literal("accounting")
    )),
    workType: v.optional(StudioWorkType),
    plannedStartDate: v.optional(v.string()), // "YYYY-MM-DD"
    plannedEndDate: v.optional(v.string()),
    estimatedHours: v.optional(v.number()),
    checklist: v.optional(v.array(TaskChecklistItem)),
  })
    .index("by_project", ["projectId"])
    .index("by_project_stage", ["projectId", "stage"])
    .index("by_project_workType", ["projectId", "workType"])
    .index("by_project_plannedStart", ["projectId", "plannedStartDate"]),
});
```

### 2.5 Migration/backfill plan
1. **Keep old fields** (e.g., `subtasks`) during transition.
2. One-time script:
   - If `subtasks[]` exists and `checklist` is empty → convert:
     - `checklist[i] = { id: "st_" + i, title: subtasks[i].title, done: subtasks[i].done, order: i }`
3. Gradually update UI to render `checklist` first, fallback to `subtasks`.

---

## 3) AccountingLines upgrades (BOM detail)

### 3.1 Goal
Turn `accountingLines` into a **BOM-capable estimate ledger**:
- exact materials list (qty/unit/spec)
- price assumptions (unit price + source)
- vendor + lead time
- waste factor / contingency notes

### 3.2 Add fields (all optional)
Add to `accountingLines`:

**Common**
- `workType` (`StudioWorkType`, optional) — for labor lines
- `source` (string, optional) — “vendor quote”, “last job”, “estimate”
- `confidence` (number 0–1, optional)
- `notes` (string, optional)

**Material/BOM**
- `itemName` (string, optional) — short (“צינור ברזל 25x25”)
- `spec` (string, optional) — thickness, grade, finish
- `qty` (number, optional)
- `unit` (string, optional) — `"pcs"|"m"|"m2"|"kg"|...`
- `unitCostEstimate` (number, optional)
- `wastePct` (number, optional) — 0.1 = 10%
- `vendorId` (id, optional)
- `vendorSku` (string, optional)
- `vendorUrl` (string, optional)
- `leadTimeDays` (number, optional)

**Labor**
- `hours` (number, optional)
- `crewSize` (number, optional)
- `ratePerHour` (number, optional) // if you store rates inline; otherwise from rates table

### 3.3 Convex patch (illustrative)
```ts
accountingLines: defineTable({
  projectId: v.id("projects"),
  sectionId: v.optional(v.id("accountingSections")),
  elementId: v.optional(v.id("elements")),
  title: v.string(),

  // existing money fields...
  estimateAmount: v.optional(v.number()),
  currency: v.optional(v.string()),

  // NEW – BOM detail:
  itemName: v.optional(v.string()),
  spec: v.optional(v.string()),
  qty: v.optional(v.number()),
  unit: v.optional(v.string()),
  unitCostEstimate: v.optional(v.number()),
  wastePct: v.optional(v.number()),
  vendorId: v.optional(v.id("vendors")),
  vendorSku: v.optional(v.string()),
  vendorUrl: v.optional(v.string()),
  leadTimeDays: v.optional(v.number()),

  // NEW – labor metadata:
  workType: v.optional(StudioWorkType),
  hours: v.optional(v.number()),
  crewSize: v.optional(v.number()),
  ratePerHour: v.optional(v.number()),

  // provenance:
  source: v.optional(v.string()),
  confidence: v.optional(v.number()),
  notes: v.optional(v.string()),
})
.index("by_project", ["projectId"])
.index("by_project_element", ["projectId", "elementId"]);
```

---

## 4) ChangeSets support (so agents can write these fields)

### 4.1 Principle
ChangeSets remain `{ kind: string, payload: object }` but you must update your **validator + applier** to accept the new fields.

### 4.2 Update/extend op kinds
Recommended additions:
- `task.create` (support checklist + dates + workType + description)
- `task.patch` (partial updates)
- `accountingLine.create` / `accountingLine.patch` (support BOM fields)
- *(optional)* `task.checklist.patch` if you want fine-grained checklist diffs (not required; can patch full array)

### 4.3 Minimum payload requirements for `task.create`
```json
{
  "projectId": "…",
  "elementId": "… (optional)",
  "fields": {
    "title": "… (he)",
    "description": "… (he, practical)",
    "stage": "build",
    "workType": "fabrication_metal",
    "plannedStartDate": "2026-01-10",
    "plannedEndDate": "2026-01-11",
    "estimatedHours": 3,
    "dependencies": ["taskId1", "taskId2"],
    "checklist": [
      { "id":"c1","title":"…","order":0,"done":false,"estimatedHours": 0.5 }
    ]
  }
}
```

---

## 5) Agent rules enabled by this schema (the practical part)

### 5.1 “Big tasks with atomic checklists”
- Parent task = 1–4 hours, named as a meaningful studio chunk.
- Checklist items = 0.1�0.5 hours each, actionable, tool-aware, finish-defined.
- Every parent task must have **≥6** checklist items unless truly trivial.

### 5.2 Dates rule
Agents must:
1. Use known anchors: install date / shoot date / delivery window.
2. If anchors missing: ask **one** compact question block (“What is install date? any studio days blocked?”) OR leave dates null.
3. Never invent a date while pretending certainty.

### 5.3 BOM rule
For any build element:
- Generate material lines with **qty + unit + spec + wastePct**.
- Prices must be **explicitly marked** as estimate + source.
- Add transport/installation/teardown elements and tasks when the deliverable leaves the studio.

---

## 6) Recommended next implementation steps
1. Patch `schema.ts` (add optional fields).
2. Update ChangeSet applier to allow new fields and to validate enums.
3. Update Tasks UI:
   - show workType badge
   - date chips
   - checklist with progress bar
4. Update Planning/Accounting agents prompts (see Prompt Pack V3).



