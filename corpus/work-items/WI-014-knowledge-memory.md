---
id: WI-014
title: "Knowledge and Memory"
type: work-item
item_type: feature
status: active
created: 2026-02-24
updated: 2026-02-24
source: "convex/memory.ts"
tags: [ai, context, core-feature]
links:
  - rel: is part of
    target: "[[TERM-001-studio-agent]]"
  - rel: includes scenario
    target: "[[SCN-027-memory-doc-creation]]"
  - rel: includes scenario
    target: "[[SCN-028-knowledge-update]]"
---

# Feature: Knowledge and Memory

Persistent project knowledge through memory documents and AI summaries.

## Behavior

- **memoryDocs** store project knowledge with kinds: SOURCE_DOC, RUNNING_MEMORY, QA_DIGEST, USER_INPUT_LOG, PROJECT_CONTEXT
- Source tracking: FILE, TEXT, URL, CHAT_EXPORT, OTHER
- AI summaries with model, summary text, and extracted facts
- Auto-append mode for continuous knowledge accumulation
- Scoped to project and optionally to element
- Used by context manager to provide grounded project context to agents

## Scenarios

- [[SCN-027-memory-doc-creation]]
- [[SCN-028-knowledge-update]]

## Related

- Part of [[TERM-001-studio-agent]]
