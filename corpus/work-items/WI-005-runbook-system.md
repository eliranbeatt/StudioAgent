---
id: WI-005
title: "Runbook System"
type: work-item
item_type: feature
status: active
created: 2026-02-24
updated: 2026-02-24
source: "convex/runbooks.ts"
tags: [execution, install-day]
links:
  - rel: is part of
    target: "[[TERM-001-studio-agent]]"
  - rel: includes scenario
    target: "[[SCN-009-runbook-generation]]"
  - rel: includes scenario
    target: "[[SCN-010-runbook-execution-tracking]]"
---

# Feature: Runbook System

Runbooks are structured execution plans for install-day operations and element-specific procedures. They organize work into phases with steps, checkpoints, approvals, and notes.

## Behavior

- Scoped to project or element level
- Contains phases with ordered items (steps, checkpoints, approvals, notes)
- Each item has status tracking (todo → doing → done → blocked)
- Supports bring-lists, safety checklists, quick-fix kits, and assumptions
- Can be AI-generated via INSTALL_RUNBOOK_BUILDER skill or manually created
- Approval stages with sign-off records

## Scenarios

- [[SCN-009-runbook-generation]]
- [[SCN-010-runbook-execution-tracking]]

## Related

- Part of [[TERM-001-studio-agent]]
