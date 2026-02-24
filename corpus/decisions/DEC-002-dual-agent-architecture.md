---
id: DEC-002
title: "Dual Agent Architecture"
type: decision
status: accepted
created: 2026-02-24
updated: 2026-02-24
source: "docs/sdk-vnext-rollout.md"
expires: null
tags: [architecture, agent, ai]
links:
  - rel: implements
    target: "[[WI-001-sdk-agent-orchestrator]]"
  - rel: implements
    target: "[[WI-002-flow-agent-autoflow]]"
---

# Decision: Dual Agent Architecture

## Decision
Maintain two distinct AI agent engines: the SDK Agent (chat-driven orchestrator) and the Flow Agent (AutoFlow gate-based pipeline). Both share the same data schema and ChangeSet mechanism, but operate independently.

## Rationale
The SDK Agent excels at interactive, user-directed work (chat, free-form edits, single-skill runs). The Flow Agent excels at batch, autonomous planning that progresses through gates without user blocking. By decoupling them, each can evolve independently while sharing the underlying data model.

## Alternatives Considered
- Single unified agent: rejected (chat and batch have different interaction patterns)
- Flow-only: rejected (loses conversational flexibility)

## Consequences
- Two code paths to maintain (convex/sdk/ and convex/flow/)
- Users see two agent tabs in the UI (SDK Agent, Flow Agent)
- Both produce ChangeSets, ensuring data consistency

## Related

- Implements [[WI-001-sdk-agent-orchestrator]] and [[WI-002-flow-agent-autoflow]]
