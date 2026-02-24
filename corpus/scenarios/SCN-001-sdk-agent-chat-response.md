---
id: SCN-001
title: "SDK Agent responds to user chat message"
type: scenario
status: active
created: 2026-02-24
updated: 2026-02-24
source: "convex/sdk/runner.ts"
tags: [agent, chat]
links:
  - rel: describes
    target: "[[WI-001-sdk-agent-orchestrator]]"
---

# Scenario: SDK Agent responds to user chat message

```gherkin
Feature: SDK Agent chat interaction

  Scenario: SDK Agent responds to a user chat message
    Given a project exists with an active agent conversation
    And the SDK Agent is available with status "completed"
    When the user sends a message "מה הסטטוס של הפרויקט?"
    Then the SDK Agent creates a new sdkRun with status "running"
    And the agent calls context.get to fetch project data
    And the agent returns an assistant message with project status summary
    And the sdkRun transitions to status "completed"
```

## Related

- Describes [[WI-001-sdk-agent-orchestrator]]
