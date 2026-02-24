---
id: CON-003
title: "Convex Schema Rigid Typing"
type: constraint
status: active
created: 2026-02-24
updated: 2026-02-24
source: "convex/schema.ts"
tags: [data-model, schema]
links:
  - rel: constrains
    target: "[[TERM-002-convex]]"
---

# Constraint: Convex Schema Rigid Typing

## Description
The Convex schema uses strict Zod-like validators. Adding new fields or changing types requires schema migrations. Many tables use `v.any()` escape hatches for flexible JSON blobs (snapshots, patches, payloads), but core fields are rigidly typed.

## Impact
Schema changes must be backwards-compatible or require migration scripts. Agent-generated data must conform to the schema exactly.

## Resolution Path
The `convex/migrations.ts` module and `scripts/` directory handle schema evolution.

## Lifted When
N/A — this is an inherent property of the Convex platform.

## Related

- Constrains [[TERM-002-convex]]
