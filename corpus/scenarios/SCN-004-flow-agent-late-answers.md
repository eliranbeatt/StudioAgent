---
id: SCN-004
title: "Flow Agent handles late answers"
type: scenario
status: active
created: 2026-02-24
updated: 2026-02-24
source: "docs/autoflow_v2_1_contract.md"
tags: [agent, answers]
links:
  - rel: describes
    target: "[[WI-002-flow-agent-autoflow]]"
---

# Scenario: Flow Agent handles late answers

```gherkin
Feature: Flow Agent late answer handling

  Scenario: Late answer does not affect running gate
    Given a flow run is at gate C with answerVersionUsed = 3
    And the user submits a new answer, incrementing to answerVersion = 4
    When gate C is still running
    Then gate C continues with its original snapshotted answerVersion = 3
    And the new answer is available for future gates (D onwards)
    And no gate is automatically rerun
```

## Related

- Describes [[WI-002-flow-agent-autoflow]]
