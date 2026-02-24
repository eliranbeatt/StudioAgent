---
id: DEC-003
title: "ChangeSet as Mutation Protocol"
type: decision
status: accepted
created: 2026-02-24
updated: 2026-02-24
source: "convex/changeSets.ts"
expires: null
tags: [architecture, data-model]
links:
  - rel: defines
    target: "[[TERM-004-changeset]]"
  - rel: constrains
    target: "[[WI-001-sdk-agent-orchestrator]]"
  - rel: constrains
    target: "[[WI-002-flow-agent-autoflow]]"
---

# Decision: ChangeSet as Mutation Protocol

## Decision
All AI-generated data mutations go through ChangeSets. No agent writes directly to core tables; instead, it proposes a ChangeSet with operations that can be reviewed, applied, partially applied, or discarded.

## Rationale
This provides an audit trail, user approval mechanism, and rollback capability. It also allows the same mutation protocol to be used by skills, flow gates, and the SDK orchestrator.

## Alternatives Considered
- Direct mutations: rejected (no audit trail, no approval step)
- Event sourcing: too complex for current needs

## Consequences
- All agent output must be serializable as ChangeSet ops
- Apply logic must handle partial application
- Every apply is logged in `auditLogs` and `flowChangeSetApplyLogs`

## Related

- Defines [[TERM-004-changeset]]
- Constrains [[WI-001-sdk-agent-orchestrator]] and [[WI-002-flow-agent-autoflow]]
