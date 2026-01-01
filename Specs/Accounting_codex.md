# Accounting Tab _codex Plan

## Sources and precedence
- Specs/Accounting.md (tab structure and UI expectations)
- Specs/gpt spec.txt and Specs/gpt spec v2.txt (override conflicts)
- Specs/Management Hub.txt (catalog and vendor integration)
- Current code: src/app/projects/[id]/accounting/page.tsx, convex/financials.ts, convex/drafts.ts, convex/reconciliation.ts, convex/schema.ts, convex/management.ts

## Current state
- UI: simple summary cards and three tabs (total/materials/labor), read-only.
- Data: financials.getFinancialSummary and financials.getAccountingView (derived from elementDraft snapshots).
- No accounting sections/material/work tables; accounting is a projection of element drafts and project cost drafts.

## Spec decisions (conflict resolution)
- Use snapshot-based accounting (gpt spec: tasks/accounting are projections of element snapshots). Do not add a separate accounting domain that can drift.
- Keep baseline, approved CO, effective budget, forecast, and variance layers (gpt spec v1/v2).
- Deep Research tab is in Accounting.md but not in gpt specs; treat as optional phase 2 and call out dependencies.

## Plan
1. Snapshot contract alignment
   - Document and enforce ElementSnapshot and ProjectCostSnapshot shapes for materials/labor/subcontract and links.taskIds/procurement.
   - Ensure new element drafts and project cost drafts initialize required fields and stable IDs.

2. Backend read models
   - Extend financials.getAccountingView (or add accounting.getView) to return:
     - per-element materials/labor/subcontract with task links
     - project cost container lines
     - draftId and revisionNumber for each editable draft
     - per-element totals and project totals
   - Add query for baseline breakdown by element (from budgetBaselines.planned.byElement) and approved CO adjustments.

3. Backend write path (ChangeSets)
   - Use drafts.applyChangeSet as the only write API from Accounting UI.
   - Add helper mutation (optional) to build patch ops for line add/update/remove so the UI stays thin.
   - Ensure reconciliation outputs and graveyard items are surfaced (already created by applyChangeSet).

4. Accounting page and tab layout
   - Implement tab strip with Summary, Materials, Labor, Deep Research per Accounting.md.
   - Add ChangeSet or Graveyard banner when applyChangeSet returns reviewRequired.

5. Summary tab
   - Show baseline, approved CO adjustments, effective budget, current forecast, and variance (financials.getFinancialSummary).
   - Show per-element and project-level rollups; allow filters like exclude management labor and include optional lines (match project defaults).

6. Materials tab
   - Table grouped by element and project-level costs.
   - Inline editing for label, qty, unitCost, procurement mode, vendor, inventory link.
   - Link/unlink tasks using patch ops on materials.byId.<id>.links.taskIds.
   - Integrate Management Hub: searchCatalog, searchVendors, getBestPrice; add createPriceObservation on confirmed edits.

7. Labor tab
   - Table grouped by element and project-level costs.
   - Inline editing for role, rate, qty, rateType, task links.
   - Use patch ops; rely on reconciliation for orphan checks.

8. Deep Research tab (optional)
   - Requires new Convex actions and storage (deep research runs, report markdown).
   - If out of scope per gpt spec non-goals, defer and hide behind a feature flag.

9. Testing and validation
   - Manual: edit line, verify ChangeSet created, check reconciliation warnings and graveyard, ensure totals and variance update.
