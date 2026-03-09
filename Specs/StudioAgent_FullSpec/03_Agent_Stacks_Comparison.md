# 03 — Agent Stacks Comparison

## Two Co-existing Systems

StudioAgent has two agent systems that co-exist and serve different purposes. Both are active in the current codebase.

### SDK Agent Stack

| Aspect | Detail |
|--------|--------|
| **Entry Point** | [dispatch.ts](file:///c:/Users/elira/Dev/StudioAgent/convex/sdk/dispatch.ts) |
| **Registry** | [registry.ts](file:///c:/Users/elira/Dev/StudioAgent/convex/sdk/registry.ts) — 27 tool definitions |
| **Prompts** | [prompts.ts](file:///c:/Users/elira/Dev/StudioAgent/convex/sdk/prompts.ts) — 25 prompt constants |
| **Schemas** | [schemas.ts](file:///c:/Users/elira/Dev/StudioAgent/convex/sdk/schemas.ts) — 27 Zod validators |
| **Runner** | [runner.ts](file:///c:/Users/elira/Dev/StudioAgent/convex/sdk/runner.ts) — LLM executor with tool loop |
| **Tool Kind** | `agent` (iterative, up to 6 loops) or `tool` (single-shot) |
| **Output** | Validated JSON via Zod schemas |
| **Model** | `gpt-5.2` (orchestrator, tasks, accounting) / `gpt-5-mini` (most tools) |
| **UI** | `/projects/[id]/sdk-agent` (planning) and `/projects/[id]/agent` (chat) |
| **Run Modes** | `PLANNING_FLOW` / `CHAT_EDIT` |

### Skills System Stack

| Aspect | Detail |
|--------|--------|
| **Entry Point** | [actions.ts](file:///c:/Users/elira/Dev/StudioAgent/convex/skills/actions.ts) |
| **Registry** | [skills/registry.ts](file:///c:/Users/elira/Dev/StudioAgent/convex/skills/registry.ts) — 37 skill definitions |
| **Prompts** | [skills/prompts.ts](file:///c:/Users/elira/Dev/StudioAgent/convex/skills/prompts.ts) — Shared header + 37 addon prompts |
| **Output** | UI Blocks (ChatBlock, QuestionsBlock, ChangeSetBlock, etc.) |
| **Model** | Mostly `gpt-5-mini`, some `gpt-5.2` (TASKS_BUILDER, ACCOUNTING_BUILDER) |
| **Clarifications** | Optional `CLARIFICATIONS_GATE` prerequisite per skill |
| **Web Tools** | Selective: only `SHOPPING_PLANNER_WEB`, `BUYING_ASSISTANT_WEB`, `RESEARCH_*` skills |

## Comparison Matrix

| Feature | SDK Agent | Skills System |
|---------|-----------|--------------|
| Entry model | Orchestrator delegates to tools | Direct skill invocation or orchestrator skill-run |
| Tool calling | OpenAI function calling with loop | Single-shot LLM with structured output |
| Output validation | Zod schemas per tool | Block-type checking per output contract |
| Context loading | `context.get` with configurable packs | `agent.data()` with resource + filters |
| Knowledge update | `knowledge.summarize_or_update` action | `CONTEXT_GENERATION` skill |
| ChangeSet path | `changeset.compile` → `changeset.review` → `changeset.apply` | Direct ChangeSetBlock in skill output |
| Question flow | `clarify.next_questions` agent | `CLARIFICATIONS_GATE` skill |
| Web research | `web_search` tool handler | `webSearch: true` in skill config |
| Stage tracking | `sdkRuns.stageKey` | `sdkRuns.stageKey` (shared) |
| Prompt architecture | Standalone system prompts (400–1500 lines each) | Shared header (198 lines) + addon (30–200 lines each) |

## V3 Flow Skills (Bridge)

The skills system includes **V3 Flow Skills** that provide a structured, stage-based planning pipeline (Stages A–E):

| Stage | Question Skill | Builder Skill |
|-------|---------------|---------------|
| **A — Intake** | `V3_Q_A_INTAKE` | `V3_BUILD_A_MEMORYDOCS` |
| **B — Plan** | `V3_Q_B_PLAN` | `V3_BUILD_B_PLAN`, `V3_BUILD_BC_COMBINED_PLAN_ACCOUNTING` |
| **C — Cost** | `V3_Q_C_COST` | `V3_BUILD_C_ACCOUNTING` |
| **D — Polish** | `V3_Q_D_POLISH_APPROVALS` | `V3_BUILD_D_POLISH` |
| **E — Quote** | `V3_Q_E_QUOTE` | `V3_BUILD_E_QUOTE` |

These V3 skills use the `agent.data()` tool for context fetching and share a common prompt prefix for questions and builds respectively.
