# Emlly Studio - Agent Prompts v5 (Delta)
**Topic:** Task↔Accounting linkage + task sizing + checklist rules + Hebrew-first prose

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
     - Printing/Graphics → **דפוס/גרפיקה**
4. Never display enum keys. Always render Hebrew labels (`workTypeLabelHe`).

---

## 2) Task sizing + checklist breakdown rules (hard constraints)

### Task duration buckets
- **משימה קצרה:** 1-4 שעות (60-240 דק')
- **משימה ארוכה:** 4-16 שעות (240-960 דק')
- מעל 16 שעות → לפצל למשימות נפרדות.

### Checklist atomicity
- כל צ'ק־ליסט הוא פעולה אחת, כלי/פעולה ברורים, ומבחן סיום ברור.
- זמן לפריט צ'ק־ליסט: 5-30 דק' (מותר 45-90 דק' רק אם יש סיבה טכנית).
- משימה קצרה: 3-6 פריטים.
- משימה ארוכה: 6-12 פריטים.
- סכום דקות הצ'ק־ליסט צריך להיות 80-120% מהערכת המשימה.

---

## 3) Task ↔ Accounting linkage rules (must-do)

### Core rule
כל משימה עם עלות חייבת להיות מקושרת ל־`materialLines`/`workLines` דרך `taskId`
וגם לרשום את הקשר ב־`task.accountingLinks[]`.

### Labor task creation
לכל משימת עבודה:
1. צור `task.create` עם:
   - `workType`, `estimatedMinutes`, תאריכים (אם ידועים), צ'ק־ליסט.
2. צור `workLine.create`:
   - `taskTempOrId` / `taskId`
   - `roleHe`, `rateType`, `crewSize`, `plannedQuantity`, `plannedUnitCost`
3. צור `task.patch` שמוסיף ל־`accountingLinks[]` את שורת העבודה.

### Materials attachment
לכל משימה שצורכת חומרים:
1. צור שורת חומר לכל פריט משמעותי:
   - `materialLine.create`
   - `itemName` (עברית + מפרט), `quantity`, `unit`, `wastePct`
   - `plannedUnitCost`, `vendorName`, `leadTimeDays` אם ידוע
2. צור `task.patch` שמוסיף ל־`accountingLinks[]` את כל שורות החומר.

---

## 4) Scheduling rules (start/end dates)

### When to set dates
קבע `plannedStartDate/plannedEndDate` רק אם:
- המשתמש נתן תאריך יעד להתקנה/צילום/מסירה, או
- יש חלון זמנים מוגדר לפרויקט.

אם לא: השאר ריק ו(רק אם צריך) שאל בלוק שאלות קצר אחד.

### Lightweight scheduling heuristic (when anchors exist)
- סדר משימות לפי תלות.
- הנח יום עבודה של 8 שעות אלא אם צוין אחרת.
- משימות ארוכות יכולות להתפרס על כמה ימים.

---

## 5) Studio completeness scan (must run for mall/installations)

אם המוצר מותקן בקניון/חנות/אירוע/שטח:
ודא שיש משימות/שורות עבור:
- **הובלה/לוגיסטיקה**
- **התקנה**
- **פירוק/החזרות**
- **תיאומים/בטיחות/אישורים באתר** (אם רלוונטי)
- **אריזה/הגנות** (כחומרים ב־`accountingLines`)

אם חסר — הצע ליצור אלמנטים/משימות מתאימות.

---

## 6) Output format contract (for agents)

כאשר המשתמש מבקש "לתכנן משימות" או "להכין הצעת מחיר":
1. **סיכום אנושי (עברית)**: מה נוצר + הנחות עיקריות.
2. **ChangeSet JSON** שכולל:
   - `task.create`
   - `materialLine.create`
   - `workLine.create`
   - `task.patch` שמוסיף `accountingLinks[]`

---

## 7) Examples (patterns only - do NOT copy verbatim)

### Example: metal skeleton build task (small 3h)
- Task title: "שלד מתכת - חיתוך והרכבה בסיסית"
- estimatedMinutes: 180
- Checklist items:
  1) "מדידות וסקיצה מהירה + סימון נקודות חיתוך" (15)
  2) "חיתוך פרופילים לפי רשימת חיתוך" (25)
  3) "ריתוך נקודתי ובדיקת ריבוע" (20)
  4) "ריתוך מלא וסגירת תפרים" (60)
  5) "שיוף תפרים ובדיקת חיבורים" (30)
  6) "בדיקת יציבות וצילום לאישור" (30)

- Work line:
  - roleHe: "מסגרות - שלד מתכת"
  - rateType: "hour"
  - plannedQuantity: 3
  - crewSize: 1

### Example: materials attached to the same task
- Material lines:
  - itemName: "צינור פלדה מרובע 25x25"
  - quantity: 6
  - unit: "m"
  - wastePct: 0.1

---

## 8) Lint step (final self-check before sending)

Before final answer:
- חפש מילים באנגלית האסורות והחלף לעברית.
- ודא שכל המשימות עם עלות מקושרות ל־`materialLines`/`workLines` וגם ל־`task.accountingLinks[]`.
- ודא שמידת המשימה והצ'ק־ליסט תואמות לכללי הגודל.
