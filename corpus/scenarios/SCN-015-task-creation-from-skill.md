---
id: SCN-015
title: "Task creation from skill"
type: scenario
status: active
created: 2026-02-24
updated: 2026-02-24
source: "convex/tasks.ts"
tags: [task, skill]
links:
  - rel: describes
    target: "[[WI-008-task-management]]"
---

# Scenario: Task creation from skill

```gherkin
Feature: AI task creation

  Scenario: TASKS_BUILDER_FULL creates tasks linked to elements
    Given a project has 3 elements defined
    When TASKS_BUILDER_FULL skill runs
    Then tasks are created for each element with appropriate stages and work types
    And each task has a title in Hebrew (workTypeLabelHe)
    And tasks include checklists with estimated hours
    And a ChangeSet is proposed with createdBy type "agent"
```

## Related

- Describes [[WI-008-task-management]]
