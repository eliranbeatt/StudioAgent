---
id: WI-009
title: "Accounting and Budget"
type: work-item
item_type: feature
status: active
created: 2026-02-24
updated: 2026-02-24
source: "convex/accountingStudio.ts"
tags: [core-feature, financial]
links:
  - rel: is part of
    target: "[[TERM-001-studio-agent]]"
  - rel: uses
    target: "[[TERM-012-material-catalog]]"
  - rel: includes scenario
    target: "[[SCN-017-bom-generation]]"
  - rel: includes scenario
    target: "[[SCN-018-budget-baseline]]"
---

# Feature: Accounting and Budget

Comprehensive cost management with material lines (BOM), work lines (labor), accounting sections, budget baselines, and change orders.

## Behavior

- **Material Lines**: track materials with quantity, UOM, vendor, procurement status, pricing
- **Work Lines**: track labor with work type, role, rate, crew size, hours
- **Accounting Sections**: organize lines by category with Hebrew labels
- **Print Parts**: specialized material tracking for printed items with QA status
- **Budget Baselines**: snapshot planned costs from approved elements and quotes
- **Change Orders**: track budget modifications with approval flow
- **Budget Adjustments**: delta records against baselines
- Lines link to the [[TERM-012-material-catalog]] for pricing and variants

## Scenarios

- [[SCN-017-bom-generation]]
- [[SCN-018-budget-baseline]]

## Related

- Part of [[TERM-001-studio-agent]]
- Uses [[TERM-012-material-catalog]]
