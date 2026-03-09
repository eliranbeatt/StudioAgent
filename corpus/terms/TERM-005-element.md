---
id: TERM-005
title: "Element"
type: term
status: active
created: 2026-02-24
updated: 2026-02-24
source: "convex/elements.ts"
tags: [core-concept, data-model]
links:
  - rel: is part of
    target: "[[TERM-001-studio-agent]]"
  - rel: related to
    target: "[[WI-007-element-lifecycle]]"
---

# Element

An Element is a discrete production unit within a project — e.g., a stage backdrop, a signage piece, a printed banner. Elements are the primary building blocks that link to tasks, accounting lines, and quotes.

Each element has:
- A **type** (build, rent, buy, print, transport, install, subcontract, mixed)
- A **status** lifecycle (drafting → approvedForQuote → inProduction → delivered → archived)
- Versioning via `elementVersions` (immutable snapshots) and `elementDrafts` (working copies)
- Links to tasks, material lines, work lines, and print parts

Elements are managed through the [[WI-007-element-lifecycle]] feature, and are central to the [[WI-009-accounting-budget]] and [[WI-010-quote-generation]] features.

## Related

- Part of [[TERM-001-studio-agent]]
