---
id: WI-002
title: "Flow Agent AutoFlow"
type: work-item
item_type: feature
status: active
created: 2026-02-24
updated: 2026-02-24
source: "convex/flow/"
tags: [agent, ai, pipeline, core-feature]
links:
  - rel: is part of
    target: "[[TERM-001-studio-agent]]"
  - rel: uses
    target: "[[TERM-004-changeset]]"
  - rel: uses
    target: "[[TERM-007-flow-gate]]"
  - rel: includes scenario
    target: "[[SCN-003-flow-agent-gate-progression]]"
  - rel: includes scenario
    target: "[[SCN-004-flow-agent-late-answers]]"
---

# Feature: Flow Agent AutoFlow

AutoFlow is a gate-based autonomous planning pipeline that progresses through a DAG of gates to build a complete project plan. It runs without blocking on user input, using assumptions when answers are unavailable.

## Behavior

- Managed via `flowRuns` with statuses: running, blocked, awaiting_approval, paused, completed, failed, cancelled
- Progresses through gates defined in `convex/flow/graph.ts` (V2.1: G0–G10, V3.0: A–E)
- Each gate snapshots current artifact revision and answer state
- Produces ChangeSets with auto or manual apply policy
- Parallel question sets are emitted to chat without blocking flow
- Includes audit/polish step after flow completion
- Supports V3 combined planning mode (separated or combined)

## Key Components

- `flowRunner.ts` / `flowRunnerV3.ts` — flow execution engine
- `graph.ts` — DAG definition
- `gateActions.ts` — per-gate logic
- `snapshotBuilder.ts` — artifact revision snapshots
- `questionSets.ts` — parallel question generation
- `audit.ts` / `validation/` — post-flow audit and validation

## Scenarios

- [[SCN-003-flow-agent-gate-progression]]
- [[SCN-004-flow-agent-late-answers]]

## Related

- Part of [[TERM-001-studio-agent]]
- Uses [[TERM-004-changeset]] and [[TERM-007-flow-gate]]
