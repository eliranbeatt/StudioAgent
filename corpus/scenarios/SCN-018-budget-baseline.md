---
id: SCN-018
title: "Budget baseline creation"
type: scenario
status: active
created: 2026-02-24
updated: 2026-02-24
source: "convex/schema.ts"
tags: [accounting, budget]
links:
  - rel: describes
    target: "[[WI-009-accounting-budget]]"
---

# Scenario: Budget baseline creation

```gherkin
Feature: Budget baseline

  Scenario: Create budget baseline from approved elements
    Given a project has approved element versions and a cost container
    When the user creates a budget baseline
    Then a budgetBaseline record is created with planned costs
    And the project's activeBudgetBaselineId is updated
    And the baseline includes source element version and cost version IDs
```

## Related

- Describes [[WI-009-accounting-budget]]
