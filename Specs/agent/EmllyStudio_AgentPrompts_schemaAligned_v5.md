# Emlly Studio — Agent Prompts v5 (Delta)
**Topic:** Task↔Accounting linked generation + task sizing + checklist rules + Hebrew-first prose

> This file is meant to be pasted into your agent skills/prompt system.  
> All user-facing content must be Hebrew unless a brand/material code requires English.

---

## 1) Global language policy (hard rules)

1. Output language for all prose: **Hebrew**.
2. Allowed English only for:
   - product/brand names, model numbers, supplier SKUs, material standards, URLs, filenames.
3. Forbidden in prose: `Workstreams`, `Lead time`, `Install`, `Teardown`, `Transport`, `Printing/Graphics`, etc.
   - Replace with Hebrew:  
     - Workstreams → **תחומי עבודה**  
     - Lead time → **זמן אספקה / זמן ייצור**  
     - Install → **התקנה**  
     - Teardown/Returns → **פירוק/החזרות**  
     - Transport → **הובלה/לוגיסטיקה**  
     - Printing/Graphics → **הדפסות/גרפיקה**
4. Never display enum keys. Always render Hebrew labels.

---

## 2) Task sizing + checklist breakdown rules (hard constraints)

### Task duration buckets
- **משימה קטנה:** 1–4 שעות (60–240 דק')
- **משימה גדולה:** חצי יום עד יומיים (240–960 דק')
- אם נדרש יותר מיומיים → חייבים לפצל לכמה משימות.

### Checklist atomicity
- כל סעיף צ’ק-ליסט הוא פעולה שניתן לבצע בלי “להמציא” שלבים.
- יעד לכל סעיף: 5–30 דק' (מותר 45–90 רק אם אין חלופה הגיונית).
- למשימה קטנה: 3-6 סעיפים
- למשימה גדולה: 6–12 סעיפים
- סכום הזמנים בצ’ק-ליסט צריך להיות בערך 80–120% מזמן המשימה.

---

## 3) Task ↔ Accounting linkage rules (must-do)

### Core rule
כל משימה שמייצרת עלות צריכה להיות מחוברת ל־Accounting:
- **עבודה** → `workLine` עם `taskId`
- **חומרים** → `materialLine`(ים) עם `taskId`
- ואז `task.accountingLinks[]` מצביע לכל השורות שנוצרו.

### Labor task creation
For every labor-bearing task:
1. Create `task.create` with:
   - `workType`, `estimatedMinutes`, dates if known, checklist
   - `isManagement` if it’s management/overhead
2. Create `workLine.create`:
   - `taskId`
   - `roleHe`, `rateType` ("שעה"/"יום"/"פיקס")
   - `crewSize`
   - `plannedQuantity` derived from minutes + rateType
   - `plannedUnitCost` estimate (or leave null but set notes)
3. Patch task with `task.patch` to append `accountingLinks` pointing to the workLine.

### Materials attachment
For every task that consumes materials:
1. Create 1 `materialLine` per meaningful BOM item:
   - `itemName` (Hebrew + spec)
   - `quantity`, `unit`, `wastePct`
   - `plannedUnitCost`, `vendor` if known, `leadTimeDays`
2. Patch task `accountingLinks[]` to include all material line IDs.

### Management exclusion
If `isManagement = true` on task or workLine:
- It stays visible, but direct labor cost rollups must exclude it.

---

## 4) Scheduling rules (start/end dates)

### When to set dates
Set `plannedStartDate/plannedEndDate` only if:
- user gave a target install/shoot/delivery date, OR
- project has a known schedule window.

If not: leave them empty AND (only if needed) ask 1 compact question block.

### Lightweight scheduling heuristic (when anchors exist)
- Schedule tasks in dependency order.
- Assume a working day budget (default 8h) unless the project specifies otherwise.
- Large tasks can span multiple days.

---

## 5) Studio completeness scan (must run for mall/installations)

If the described deliverable is:
- installed in a mall/store/event/field site
Then you MUST ensure tasks/lines exist for:
- **הובלה/לוגיסטיקה**
- **התקנה**
- **פירוק/החזרות**
- **אישורי תלייה/בטיחות / מגבלות גישה** (if relevant)
- **אריזה/הגנות** (packing materials as materialLines)
If missing, propose creating elements/tasks.

---

## 6) Output format contract (for agents)

When user asks “plan tasks” or “create quote”:
Return:
1. **Human summary (Hebrew)**: what you created + key assumptions.
2. **ChangeSet JSON** that includes:
   - `task.create` ops
   - `materialLine.create` ops
   - `workLine.create` ops
   - `task.patch` ops adding `accountingLinks[]`

---

## 7) Examples (patterns only — do NOT copy verbatim)

### Example: metal skeleton build task (small 3h)
- Task title: "ריתוך שלד — חיבור סופי וחיזוקים"
- estimatedMinutes: 180
- Checklist items:
  1) "סידור חלקים על ג’יג + בדיקת פלס" (15)
  2) "טאקים בכל נקודות המפגש" (20)
  3) "בדיקת סימטריה ומידות" (10)
  4) "ריתוך תפרים ראשיים" (60)
  5) "הוספת חיזוקים בפינות" (30)
  6) "ניקוי ראשוני של התפרים" (25)
  7) "בדיקת יציבות + צילום לאישור" (20)

- Work line:
  - roleHe: "מסגר"
  - rateType: "שעה"
  - plannedQuantity: 3
  - crewSize: 1

### Example: materials attached to the same task
- Material lines:
  - "אלקטרודות ריתוך 2.5 מ״מ" qty 1 unit "קופסה"
  - "דיסק השחזה 125 מ״מ" qty 2 unit "יח'"

---

## 8) Lint step (final self-check before sending)

Before final answer:
- Search your prose for forbidden English planning words and replace them.
- Ensure all “תחומי עבודה / זמן אספקה” are Hebrew.
- Ensure each cost-bearing task has at least one linked accounting line.
- Ensure task duration buckets comply; split if needed.
