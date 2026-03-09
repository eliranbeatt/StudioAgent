---
id: WI-008
title: "Task Management"
type: work-item
item_type: feature
status: active
created: 2026-02-24
updated: 2026-02-24
source: "convex/tasks.ts"
tags: [core-feature, execution]
links:
  - rel: is part of
    target: "[[TERM-001-studio-agent]]"
  - rel: uses
    target: "[[TERM-009-work-type]]"
  - rel: includes scenario
    target: "[[SCN-015-task-creation-from-skill]]"
  - rel: includes scenario
    target: "[[SCN-016-task-kanban-view]]"
---

# Feature: Task Management

Full task management with stages, work types, checklists, dependencies, draft revisions, and multiple views (Kanban, Gantt, list).

## Behavior

- Tasks belong to projects and optionally link to elements
- Stages: clarification, quote, procurement, build, install, teardown, accounting
- Work types from [[TERM-009-work-type]] taxonomy
- Checklists with sub-items, estimated hours, and dependencies
- Draft revision layer (`taskRevisions`) for AI-proposed patches
- Accounting links connect tasks to material/work lines
- Assignee support via employees table
- Created by human or agent, with optional ChangeSet provenance

## Scenarios

- [[SCN-015-task-creation-from-skill]]
- [[SCN-016-task-kanban-view]]

## Related

- Part of [[TERM-001-studio-agent]]
- Uses [[TERM-009-work-type]]
