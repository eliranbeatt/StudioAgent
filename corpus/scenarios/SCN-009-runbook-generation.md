---
id: SCN-009
title: "Runbook generation from tasks"
type: scenario
status: active
created: 2026-02-24
updated: 2026-02-24
source: "convex/runbooks.ts"
tags: [runbook, planning]
links:
  - rel: describes
    target: "[[WI-005-runbook-system]]"
---

# Scenario: Runbook generation from tasks

```gherkin
Feature: Runbook generation

  Scenario: Generate install-day runbook from project tasks
    Given a project has tasks with stage "install" and work types assigned
    When the INSTALL_RUNBOOK_BUILDER skill is invoked
    Then a runbook is created with scope "project" and status "draft"
    And runbook items are organized into phases (setup, install, QA, teardown)
    And each item links to the originating task
    And a bring-list is generated from material lines
```

## Related

- Describes [[WI-005-runbook-system]]
