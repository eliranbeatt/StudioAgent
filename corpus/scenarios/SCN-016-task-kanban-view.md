---
id: SCN-016
title: "Task Kanban view"
type: scenario
status: active
created: 2026-02-24
updated: 2026-02-24
source: "src/app/projects/[id]/tasks/"
tags: [task, ui]
links:
  - rel: describes
    target: "[[WI-008-task-management]]"
---

# Scenario: Task Kanban view

```gherkin
Feature: Task Kanban board

  Scenario: View tasks in Kanban columns
    Given a project has tasks with statuses "todo", "doing", and "done"
    When the user opens the tasks tab in Kanban view
    Then tasks are displayed in columns by status
    And drag-and-drop is available to move tasks between columns
    And the kanbanColumnOrder configuration determines column ordering
```

## Related

- Describes [[WI-008-task-management]]
