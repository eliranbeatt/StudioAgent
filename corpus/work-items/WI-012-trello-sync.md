---
id: WI-012
title: "Trello Sync"
type: work-item
item_type: feature
status: active
created: 2026-02-24
updated: 2026-02-24
source: "convex/trelloSync.ts"
tags: [integration, external]
links:
  - rel: is part of
    target: "[[TERM-001-studio-agent]]"
  - rel: includes scenario
    target: "[[SCN-023-trello-sync-run]]"
  - rel: includes scenario
    target: "[[SCN-024-trello-mapping-create]]"
---

# Feature: Trello Sync

Bi-directional synchronization between Studio Agent tasks and Trello boards.

## Behavior

- Per-project Trello configuration (board ID, list mappings)
- Per-user Trello credentials (API key + token)
- Sync runs tracked with status (running → success/failed), summary, and retry log
- Card-to-task mappings via `trelloMappings` with content hash for change detection
- Diff plan preview before applying sync

## Scenarios

- [[SCN-023-trello-sync-run]]
- [[SCN-024-trello-mapping-create]]

## Related

- Part of [[TERM-001-studio-agent]]
