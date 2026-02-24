---
id: CON-002
title: "LLM Token Limits"
type: constraint
status: active
created: 2026-02-24
updated: 2026-02-24
source: "convex/sdk/registry.ts"
tags: [ai, performance]
links:
  - rel: constrains
    target: "[[WI-001-sdk-agent-orchestrator]]"
  - rel: constrains
    target: "[[WI-003-skill-system]]"
---

# Constraint: LLM Token Limits

## Description
All AI skills are capped at `max_completion_tokens: 25000`. The SDK runner limits tool loops to 6 iterations (`MAX_TOOL_LOOPS = 6`). This means skills and agents must produce concise output and cannot run unbounded.

## Impact
Complex projects with many elements/tasks may require multiple skill runs or summarized context. Context must be carefully curated to fit within prompt limits.

## Resolution Path
Message compression (in `sdk/messageCompression.ts`) and selective context loading (via context packs) help manage token budgets.

## Lifted When
Token limits increase significantly or the system adopts streaming/chunking strategies.

## Related

- Constrains [[WI-001-sdk-agent-orchestrator]] and [[WI-003-skill-system]]
