# Emlly Studio - Canonical Contract (Schema + ChangeSet + Agent)
**Non-negotiables**
- JSON keys (field names, op names) MUST be English ASCII.
- User-facing text VALUES MUST be Hebrew (unless brand/spec/SKU/URL).
- ChangeSet layer MUST normalize Hebrew labels to canonical codes before routing.

---

## 1) Canonical line types (routing codes)

### lineType (canonical in JSON)
- "material"
- "work"

### Accepted synonyms (input -> canonical)
**material**
- "material", "materials", "חומרים", "חומר", "חומרי גלם"

**work**
- "work", "labor", "עבודה", "עבודת", "כח אדם"

---

## 2) Canonical accounting sections
Agent should send `sectionKey` (English) + `sectionLabelHe` (Hebrew).  
Backend resolves/creates sectionId by key.

Common sectionKey values:
- materials
- labor_direct
- labor_install
- transport
- install
- teardown_returns
- rental
- printing_graphics
- hardware_consumables
- meals
- management_overhead
- misc

Backend rule:
- If sectionId is missing but sectionKey exists -> resolve/create.
- If neither exists -> use "misc".

---

## 3) Task <-> accounting connection (required)
Minimum viable:
- Every cost line includes `taskId` when it belongs to a task.
- Tasks UI can query lines by `taskId`.

Optional enhancement:
- task.accountingLinks[] contains line references (lineType + lineId).

---

## 4) Management rule (do not break)
- Work line with isManagement=true is visible but excluded from direct labor sums.
- Same for task.isManagement if present.

---

## 5) Scheduling rule
- Keys are English: plannedStartDate / plannedEndDate.
- Values are ISO "YYYY-MM-DD".
- Agent sets dates only if an anchor exists (install / delivery / shoot date).

---

## 6) Task sizing contract
- Small tasks: 1-4 hours
- Large tasks: ~1-2 days
- Checklist items should be atomic and executable.
