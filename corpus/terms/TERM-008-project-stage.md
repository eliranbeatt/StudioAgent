---
id: TERM-008
title: "Project Stage"
type: term
status: active
created: 2026-02-24
updated: 2026-02-24
source: "convex/schema.ts"
tags: [core-concept, workflow]
links:
  - rel: is part of
    target: "[[WI-006-project-management]]"
---

# Project Stage

A Project Stage represents the current phase of a project's lifecycle. Studio Agent defines three stages:

1. **IDEATION** — initial brain dump, context gathering, early clarification
2. **QUOTE** — element planning, task breakdown, budget creation, quote generation
3. **BREAKDOWN** — execution planning, procurement, install runbooks, daily ops

These stages drive which skills are suggested, which gates run in the flow agent, and what UI views are available. The stage is stored on the `projects` table and referenced by ChangeSets, conversations, and flow runs.

## Related

- Part of [[WI-006-project-management]]
