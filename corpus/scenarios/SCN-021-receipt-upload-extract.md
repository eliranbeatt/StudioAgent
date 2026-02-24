---
id: SCN-021
title: "Receipt upload and extraction"
type: scenario
status: active
created: 2026-02-24
updated: 2026-02-24
source: "convex/receiptsActions.ts"
tags: [receipt, extraction]
links:
  - rel: describes
    target: "[[WI-011-receipt-processing]]"
---

# Scenario: Receipt upload and extraction

```gherkin
Feature: Receipt processing

  Scenario: Upload receipt and extract data
    Given a project exists with accounting lines
    When the user uploads a receipt image
    Then a projectFile is created for the upload
    And a receipt record is created with status "uploaded"
    And AI extraction runs to parse vendor, items, and total
    And the receipt status transitions to "extracted"
```

## Related

- Describes [[WI-011-receipt-processing]]
