---
id: WI-013
title: "Share Links"
type: work-item
item_type: feature
status: active
created: 2026-02-24
updated: 2026-02-24
source: "convex/shareLinks.ts"
tags: [client-facing, collaboration]
links:
  - rel: is part of
    target: "[[TERM-001-studio-agent]]"
  - rel: includes scenario
    target: "[[SCN-025-share-link-create]]"
  - rel: includes scenario
    target: "[[SCN-026-share-link-access]]"
---

# Feature: Share Links

Generate token-based public links for external clients to view project information.

## Behavior

- Token-based authentication (no login required)
- Three scope types: projectSummary, quote, gallery
- Optional expiration dates
- Links to specific quote versions or PDF files
- Created by human or agent with user tracking

## Scenarios

- [[SCN-025-share-link-create]]
- [[SCN-026-share-link-access]]

## Related

- Part of [[TERM-001-studio-agent]]
