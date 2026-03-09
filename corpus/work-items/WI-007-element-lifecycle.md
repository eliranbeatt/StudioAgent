---
id: WI-007
title: "Element Lifecycle"
type: work-item
item_type: feature
status: active
created: 2026-02-24
updated: 2026-02-24
source: "convex/elements.ts"
tags: [core-feature, versioning]
links:
  - rel: is part of
    target: "[[TERM-001-studio-agent]]"
  - rel: uses
    target: "[[TERM-005-element]]"
  - rel: includes scenario
    target: "[[SCN-013-element-draft-approve]]"
  - rel: includes scenario
    target: "[[SCN-014-element-version-history]]"
---

# Feature: Element Lifecycle

Elements follow a draft → approve → version lifecycle with snapshot-based versioning and working drafts.

## Behavior

- Elements start in `drafting` status
- Working changes are stored in `elementDrafts` (mutable)
- Approval promotes a draft to `elementVersions` (immutable snapshot)
- Versions track `versionNumber`, `snapshot`, and `schemaVersion`
- Elements can have images (`elementImages`) of types: engineering, illustration, reference
- Type options: build, rent, buy, print, transport, install, subcontract, mixed
- Tags and ordering for UI organization

## Scenarios

- [[SCN-013-element-draft-approve]]
- [[SCN-014-element-version-history]]

## Related

- Part of [[TERM-001-studio-agent]]
- Uses [[TERM-005-element]]
