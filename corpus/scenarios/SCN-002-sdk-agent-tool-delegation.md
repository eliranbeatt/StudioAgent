---
id: SCN-002
title: "SDK Agent delegates to a tool"
type: scenario
status: active
created: 2026-02-24
updated: 2026-02-24
source: "convex/sdk/runner.ts"
tags: [agent, tools]
links:
  - rel: describes
    target: "[[WI-001-sdk-agent-orchestrator]]"
---

# Scenario: SDK Agent delegates to a tool

```gherkin
Feature: SDK Agent tool delegation

  Scenario: SDK Agent delegates task creation to plan.tasks tool
    Given a project exists with elements already defined
    And the user sends "תכנן משימות לכל האלמנטים"
    When the orchestrator processes the message
    Then it invokes the "plan.tasks" tool with element context
    And the tool returns a changeset with task creation operations
    And the changeset is proposed to the user for approval
```

## Related

- Describes [[WI-001-sdk-agent-orchestrator]]
