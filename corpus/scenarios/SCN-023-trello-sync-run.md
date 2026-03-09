---
id: SCN-023
title: "Trello sync run"
type: scenario
status: active
created: 2026-02-24
updated: 2026-02-24
source: "convex/trelloSync.ts"
tags: [trello, sync]
links:
  - rel: describes
    target: "[[WI-012-trello-sync]]"
---

# Scenario: Trello sync run

```gherkin
Feature: Trello synchronization

  Scenario: Sync project tasks to Trello board
    Given a project has Trello configuration with board ID and list mappings
    And the user has valid Trello credentials
    When a Trello sync run is initiated
    Then a trelloSyncRun is created with status "running"
    And tasks are compared against existing Trello mappings
    And new cards are created for unmapped tasks
    And the sync run completes with a summary of changes
```

## Related

- Describes [[WI-012-trello-sync]]
