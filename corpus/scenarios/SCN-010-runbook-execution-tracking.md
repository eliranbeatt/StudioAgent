---
id: SCN-010
title: "Runbook execution tracking"
type: scenario
status: active
created: 2026-02-24
updated: 2026-02-24
source: "convex/runbooks.ts"
tags: [runbook, execution]
links:
  - rel: describes
    target: "[[WI-005-runbook-system]]"
---

# Scenario: Runbook execution tracking

```gherkin
Feature: Runbook execution

  Scenario: Track runbook item completion on install day
    Given a runbook exists with status "active" and execution started
    And a runbook item has kind "step" and status "todo"
    When the crew marks the item as done
    Then the item status changes to "done"
    And doneAt and doneBy fields are recorded
    And the next item in the phase becomes actionable
```

## Related

- Describes [[WI-005-runbook-system]]
