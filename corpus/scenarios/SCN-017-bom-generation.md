---
id: SCN-017
title: "BOM generation by skill"
type: scenario
status: active
created: 2026-02-24
updated: 2026-02-24
source: "convex/accountingStudio.ts"
tags: [accounting, bom]
links:
  - rel: describes
    target: "[[WI-009-accounting-budget]]"
---

# Scenario: BOM generation by skill

```gherkin
Feature: BOM generation

  Scenario: ACCOUNTING_BUILDER_FULL creates material and work lines
    Given a project has elements and tasks defined
    When ACCOUNTING_BUILDER_FULL skill runs
    Then material lines are created for each element's materials
    And work lines are created for labor by work type
    And accounting sections organize the lines
    And a ChangeSet with scope "accounting" is proposed
```

## Related

- Describes [[WI-009-accounting-budget]]
