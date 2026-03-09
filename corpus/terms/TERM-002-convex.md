---
id: TERM-002
title: "Convex"
type: term
status: active
created: 2026-02-24
updated: 2026-02-24
source: "convex/"
tags: [backend, infrastructure, real-time]
links:
  - rel: used by
    target: "[[TERM-001-studio-agent]]"
---

# Convex

Convex is the real-time backend platform used by [[TERM-001-studio-agent]]. All server-side logic — mutations, queries, actions, and the schema — lives in the `convex/` directory. Convex provides:

- Reactive queries that push updates to clients in real time
- Transactional mutations for data writes
- Actions for side-effect-heavy operations (LLM calls, web search)
- Internal functions for background and scheduled work
- File storage via `_storage`

The Convex schema (defined in `convex/schema.ts`) contains 60+ tables spanning projects, elements, tasks, accounting, agents, skills, flow runs, and more.
