---
id: TERM-007
title: "Flow Gate"
type: term
status: active
created: 2026-02-24
updated: 2026-02-24
source: "convex/flow/graph.ts"
tags: [core-concept, agent, pipeline]
links:
  - rel: is part of
    target: "[[WI-002-flow-agent-autoflow]]"
---

# Flow Gate

A Flow Gate is a node in the AutoFlow directed acyclic graph (DAG). Gates are the sequential processing stages that the flow agent traverses to build a complete project plan.

**V2.1 Graph** has 11 gates (G0–G10), each depending on completion of the previous gate, with a concurrency limit of 2.

**V3.0 Graph** uses 5 stages (A–E):
- **A**: Intake / memory docs
- **B**: Element and task planning
- **C**: Accounting / BOM / budget
- **D**: Polish and review
- **E**: Quote generation

Each gate produces a snapshot, assumptions, confidence score, and a ChangeSet. Gate execution is tracked via `flowSteps` and `flowNodeRuns`.

## Related

- Part of [[WI-002-flow-agent-autoflow]]
