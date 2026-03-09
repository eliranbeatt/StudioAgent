---
id: SCN-003
title: "Flow Agent progresses through gates"
type: scenario
status: active
created: 2026-02-24
updated: 2026-02-24
source: "convex/flow/flowRunner.ts"
tags: [agent, pipeline]
links:
  - rel: describes
    target: "[[WI-002-flow-agent-autoflow]]"
---

# Scenario: Flow Agent progresses through gates

```gherkin
Feature: Flow Agent gate progression

  Scenario: Flow Agent completes gate A and starts gate B
    Given a flow run exists for a project with status "running" at gate "A"
    And gate A has completed with a ChangeSet applied
    When the flow runner checks for ready nodes
    Then gate "B" is identified as ready (depends on A, which is completed)
    And a new flowNodeRun is created for gate B with status "running"
    And gate B snapshots the latest artifact revision and answer state
```

## Related

- Describes [[WI-002-flow-agent-autoflow]]
