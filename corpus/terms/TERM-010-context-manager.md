---
id: TERM-010
title: "Context Manager"
type: term
status: active
created: 2026-02-24
updated: 2026-02-24
source: "convex/contextManager/"
tags: [core-concept, agent, ai]
links:
  - rel: used by
    target: "[[WI-001-sdk-agent-orchestrator]]"
  - rel: used by
    target: "[[WI-002-flow-agent-autoflow]]"
---

# Context Manager

The Context Manager (`convex/contextManager/`) is a subsystem that builds and serves structured project context to AI agents. It uses:

- **promptBuilder.ts** — assembles system prompts with project context
- **pull.ts** — fetches data from the Convex database based on requested packs
- **recipes.ts** — predefined context pack combinations for different use cases
- **views/** — formatted views of project data for LLM consumption

The Context Manager is used by both the [[WI-001-sdk-agent-orchestrator]] and the [[WI-002-flow-agent-autoflow]] to provide grounded, relevant data to LLM calls.
