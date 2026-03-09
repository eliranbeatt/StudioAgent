---
id: WI-001
title: "SDK Agent Orchestrator"
type: work-item
item_type: feature
status: active
created: 2026-02-24
updated: 2026-02-24
source: "convex/sdk/"
tags: [agent, ai, core-feature]
links:
  - rel: is part of
    target: "[[TERM-001-studio-agent]]"
  - rel: uses
    target: "[[TERM-004-changeset]]"
  - rel: uses
    target: "[[TERM-010-context-manager]]"
  - rel: uses
    target: "[[TERM-011-agent-data-api]]"
  - rel: includes scenario
    target: "[[SCN-001-sdk-agent-chat-response]]"
  - rel: includes scenario
    target: "[[SCN-002-sdk-agent-tool-delegation]]"
---

# Feature: SDK Agent Orchestrator

The SDK Agent is a chat-driven AI orchestrator that handles user interactions in real time. It uses a tool-loop pattern: the orchestrator receives a user message, decides which tools/agents to call, executes them, and returns a response.

## Behavior

- Receives user messages via `agentConversations` and `agentMessages`
- Uses the `REGISTRY` (in `convex/sdk/registry.ts`) which defines 25+ tools/agents
- Delegates to specialized tools: `context.get`, `changeset.compile`, `web_search`, `clarify.next_questions`, `chat.free`, `think.deep`, and planning tools
- Runs up to 6 tool loops per invocation
- Produces chat blocks, changeset proposals, and suggestions
- Tracked via `sdkRuns` with status progression and `sdkRunEvents`

## Tools Available

- **context.get**: Fetch project context by packs
- **changeset.compile/review/apply**: Manage ChangeSet lifecycle
- **clarify.next_questions**: Iterative clarification agent
- **chat.free**: Free-form brain dump and fact extraction
- **think.deep**: Deep research and strategic analysis
- **pricing.resolve_lines**: Price resolution agent
- **plan.elements/tasks/execution_phases**: Planning tools
- **cost.build_budget**: Budget BOM generation
- **quote.generate**: Client quote drafting

## Scenarios

- [[SCN-001-sdk-agent-chat-response]]
- [[SCN-002-sdk-agent-tool-delegation]]

## Related

- Part of [[TERM-001-studio-agent]]
- Uses [[TERM-004-changeset]], [[TERM-010-context-manager]], [[TERM-011-agent-data-api]]
