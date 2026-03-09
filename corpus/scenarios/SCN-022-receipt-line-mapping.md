---
id: SCN-022
title: "Receipt line mapping"
type: scenario
status: active
created: 2026-02-24
updated: 2026-02-24
source: "convex/reconciliation.ts"
tags: [receipt, reconciliation]
links:
  - rel: describes
    target: "[[WI-011-receipt-processing]]"
---

# Scenario: Receipt line mapping

```gherkin
Feature: Receipt reconciliation

  Scenario: Map receipt items to material lines
    Given a receipt has been extracted with 3 line items
    And the project has matching material lines
    When the user maps receipt items to material lines
    Then receiptItem.mappedMaterialLineId is set for each item
    And the material line's actualTotalCost is updated
    And receiptItemIds are added to the material line
```

## Related

- Describes [[WI-011-receipt-processing]]
