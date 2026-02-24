---
id: SCN-014
title: "Element version history"
type: scenario
status: active
created: 2026-02-24
updated: 2026-02-24
source: "convex/elements.ts"
tags: [element, history]
links:
  - rel: describes
    target: "[[WI-007-element-lifecycle]]"
---

# Scenario: Element version history

```gherkin
Feature: Element version history

  Scenario: View element version history
    Given an element has been approved 3 times
    When the user views the element's version history
    Then 3 elementVersion records are shown, ordered by versionNumber
    And each version shows its snapshot, approval date, and approver
    And the latest version is marked as the current approved version
```

## Related

- Describes [[WI-007-element-lifecycle]]
