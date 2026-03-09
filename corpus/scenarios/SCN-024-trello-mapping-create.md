---
id: SCN-024
title: "Trello mapping creation"
type: scenario
status: active
created: 2026-02-24
updated: 2026-02-24
source: "convex/trelloSync.ts"
tags: [trello, mapping]
links:
  - rel: describes
    target: "[[WI-012-trello-sync]]"
---

# Scenario: Trello mapping creation

```gherkin
Feature: Trello card mapping

  Scenario: Create mapping between task and Trello card
    Given a task exists in the project
    And a Trello card was created during sync
    When the mapping is recorded
    Then a trelloMapping record is created with taskId, trelloCardId, and contentHash
    And lastSyncedAt is set to the current timestamp
```

## Related

- Describes [[WI-012-trello-sync]]
