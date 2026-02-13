# SDK Free Agent v3 Plan (Fast Chat First)

## Goal
Make `SDK Agent > Agent` behave as a fast free-chat orchestrator:
- `Hi` and similar messages stay lightweight and cheap.
- Project questions fetch data lazily via `context.get` only when needed.
- Heavy skills (budget, audit, compile/review) run only on explicit user intent.
- Structured UI blocks remain available as optional tools (questions/suggestions/review/changeset), not forced.

## Incident Evidence (Run `xs75g6xmrgdtj9vj190yagfawx8129x2`)
- 11 LLM traces, ~318s aggregate latency, ~0.3619 USD logged.
- Model mix: 8x `gpt-5.2`, 1x `gpt-5-mini`, 2x `gpt-4o-mini`.
- Chain observed:
1. Orchestrator call.
2. `recovery_triggered` event (`talking_not_doing`).
3. Forced tool path executes `cost.build_budget`.
4. `changeset.compile`.
5. `audit.project` runs multiple times.

This confirms the current chat path is over-triggering planning/audit flows.

## 3 Root Causes

### Root Cause 1: Recovery logic forces planning tools for non-planning chat
File: `convex/sdk/dispatch.ts`
- `hasActionableContent` ignores `ChatBlock`, so normal free-chat replies are treated as failure.
- Recovery prompt hardcodes planning instructions ("call plan.elements -> plan.tasks -> changeset.compile"), even when user said only `hi`.
- Result: greeting escalates into planning/budget/audit execution.

### Root Cause 2: Chat path preloads large context every turn
Files: `convex/sdk/dispatch.ts`, `convex/sdk/context.ts`
- `bootstrapContext` fetches `project,elements,tasks,accounting,quote,knowledge,qa` on each message before intent is known.
- This inflates tokens and encourages unnecessary tool/tool-agent activity.
- Violates intended lazy pull behavior.

### Root Cause 3: Model/runtime config is expensive by default and overrides intent
Files: `convex/sdk/registry.ts`, `convex/lib/llm.ts`
- Orchestrator default model is `gpt-5.2`.
- `normalizeReasoningEffort` forces `medium` for all `gpt-5*`, overriding configured `none`.
- Chat requests therefore run heavier than intended.

## Target Behavior (v3)

### 1) Fast chat-first orchestration
- For greeting/smalltalk/general chat: one lightweight LLM call, no tools by default.
- Response may include:
  - `ChatBlock`
  - optional `SuggestionsBlock` (quick next actions)
- No automatic budget/audit/compile on greetings.

### 2) Intent-gated tool usage
- Tools run only when user intent requires them.
- Read intent (example: "show my tasks/priorities"): use `context.get` with targeted packs and answer directly.
- Write intent (example: "change budget to X"): run mutation tool chain with explicit approval flow.
- Audit runs only when user asks or when an approval-critical write flow requires it.

### 3) Lazy context pulls
- No full preload in free chat.
- Start with minimal context (`project` + `knowledge` only when needed).
- Pull `tasks`/`elements`/`accounting` only by explicit query intent.

## Implementation Plan

## Phase 0: Hotfixes (stop cost bleed immediately)

### A. Stop forced planning recovery in chat
File: `convex/sdk/dispatch.ts`
1. Treat `ChatBlock` as actionable content.
2. Remove recovery prompt hardcoding planning tool chain.
3. Recovery (if still needed) should only request a valid block response, not mandatory tool calls.
4. Gate any recovery tool forcing behind explicit planning intent.

### B. Disable deterministic planning auto-branch for chat mode
File: `convex/sdk/dispatch.ts`
1. `strictFullPlanMode` must be `false` for `runMode === 'CHAT_EDIT'`.
2. Never execute deterministic `plan.elements -> plan.tasks -> cost.build_budget` branch in chat mode.

### C. Respect configured reasoning effort
File: `convex/lib/llm.ts`
1. Fix `normalizeReasoningEffort` to:
   - honor explicit `none|minimal|low|medium|high` when provided,
   - avoid forced `medium` for `gpt-5*`.
2. Keep safe default only when value is absent.

## Phase 1: Intent router + lazy context (core behavior)

### A. Add lightweight intent router in dispatch
File: `convex/sdk/dispatch.ts`
1. Add `detectIntent(userMessage)` with categories:
   - `chat_smalltalk`
   - `project_read_qna`
   - `project_write_change`
   - `explicit_skill_run`
   - `planning_request`
2. For trivial greetings (`hi`, `hello`, `hey`, `shalom`, short emoji-only): route directly to fast chat response path.
3. Optional fallback classifier call (cheap model) only if intent is ambiguous.

### B. Context pack planner (lazy pull)
Files: `convex/sdk/dispatch.ts`, `convex/sdk/context.ts`
1. Add `packsForIntent(intent, message)`:
   - smalltalk: no context fetch.
   - read tasks/priorities: `tasks,elements` (+ `project` if needed).
   - budget question: `accounting,tasks,elements`.
   - quote question: `quote,accounting`.
2. Replace unconditional bootstrap context load with on-demand `context.get`.

### C. Tool whitelist per intent
File: `convex/sdk/dispatch.ts`
1. Build allowed tools dynamically for chat mode:
   - smalltalk: none (or `chat.free` only).
   - read qna: `context.get`, `knowledge.summarize_or_update`.
   - write change: add planner/cost/changeset tools as needed.
   - explicit audit request: allow `audit.project`.
2. Remove global always-on 24-tool menu for every chat turn.

## Phase 2: Model policy for speed/cost

### A. Introduce chat runtime profile
Files: `convex/sdk/registry.ts`, `convex/sdk/dispatch.ts`
1. Add lightweight orchestrator profile for `CHAT_EDIT`:
   - model: `gpt-5-mini`
   - reasoning: `none` (or `minimal` if API requires)
   - lower completion tokens (for example 800-1500 for chat turns)
2. Keep planning profile heavier only for planning runs.

### B. Per-tool runtime limits
File: `convex/sdk/runner.ts`
1. Chat mode tool calls use stricter token caps.
2. Enforce max tool loops for chat at 1-2 (instead of 6).
3. Abort repeated tool signatures earlier in chat mode.

## Phase 3: Write-flow safety without auto-heavy behavior

### A. Compile/audit policy by operation type
File: `convex/sdk/dispatch.ts`
1. For read-only chat requests: never call compile/audit.
2. For write requests:
   - compile/review only when user asked to change data.
   - audit only when user requests audit, or when policy requires pre-approval validation for risky writes.
3. Keep `changeset.apply` approval-gated.

### B. Suggestion-driven skill execution
Files: `convex/sdk/dispatch.ts`, `src/app/projects/[id]/sdk-agent/_components/AgentTab.tsx`
1. Add `SuggestionsBlock` for optional next actions:
   - "Show tasks and priorities"
   - "Build budget draft"
   - "Run audit"
2. Clicking suggestion sends explicit action text, so heavy tools run by user choice.

## Phase 4: UI consistency

### A. Keep chat UI as chat-only
Files: `src/app/projects/[id]/sdk-agent/_components/AgentTab.tsx`, `src/app/projects/[id]/sdk-agent/_components/SdkQuestionsBlock.tsx`
1. Preserve free chat input as primary surface.
2. Questions blocks remain optional attachments in assistant messages.
3. Submit button in question block remains explicit trigger (already aligned).

## Telemetry and Guardrails

### New events
Files: `convex/sdk/dispatch.ts`, `convex/sdk/telemetry.ts`
- `chat_intent_detected` with intent category.
- `chat_context_fetch` with selected packs.
- `chat_tool_policy` with allowed tools and reason.
- `chat_heavy_tool_blocked` when heavy tool request is denied by policy.

### SLO targets for `CHAT_EDIT`
1. Greeting path: 1 LLM call max, no tools.
2. P50 response time: under 4s.
3. P95 response time: under 10s.
4. Mean cost per smalltalk turn: < $0.01.

## Test Plan

## Unit tests
Files: add tests under `convex/sdk/__tests__/`
1. Intent classification (`hi` => `chat_smalltalk`).
2. Chat mode does not enter deterministic planning branch.
3. Chat mode does not auto-run compile/audit on non-write intents.
4. `normalizeReasoningEffort` respects explicit `none`.

## Integration tests
1. Run `runNext` with chat run + `hi`:
   - exactly one assistant response,
   - no `cost.build_budget`/`audit.project` tool events.
2. Run "show my tasks and priorities":
   - `context.get` with `tasks,elements`,
   - no compile/audit.
3. Run "change budget for task X to Y":
   - write tool chain allowed,
   - approval flow preserved.

## Manual validation on target project
Project: `nn7a7t5rmws4shnbz9cb9d4gn980y9z7`
1. Send `hi` in new chat run.
2. Verify no heavy tool events.
3. Ask "show me my tasks and priorities".
4. Verify targeted context fetch and direct answer.
5. Ask explicit audit; verify audit runs only then.

## Rollout Strategy
1. Ship Phase 0 first (immediate protection).
2. Enable Phase 1+2 behind new flag `ff_sdk_chat_intent_router_v1`.
3. Compare telemetry before/after on:
   - calls per message,
   - avg latency,
   - avg cost,
   - tool mix.
4. Ramp to 100% after 48h stable metrics.

## Finalized Product Decisions
1. `audit.project` must never run automatically in chat flows.
2. Audit runs only on explicit user intent (typed request or suggestion click).
3. For write intents, the agent should propose a `changeset` and let the user review/audit manually.
4. `SuggestionsBlock` is optional and should be included only when useful.
5. Default answer style is concise summary.
6. Default end-user chat language is Hebrew.
7. Engineering prompts/code/comments remain English.
8. No strict hard per-turn budget cap; optimize behavior for fast, practical responses and only run tools when needed.

## Implementation Deltas From Clarifications
1. Phase 3 policy is now strict:
   - remove any automatic audit trigger paths.
   - keep `audit.project` out of allowed tools unless explicit audit intent is detected.
2. Suggestion generation logic:
   - add `shouldAttachSuggestions(intent, confidence, replyLength)` heuristic.
   - avoid suggestions for trivial greeting replies unless a next-step choice is genuinely helpful.
3. Response generation defaults:
   - set concise mode by default in orchestrator prompt and response formatter.
   - allow user to ask for expanded detail explicitly.
4. Locale policy:
   - enforce Hebrew for user-facing assistant outputs in `CHAT_EDIT`.
   - keep internal system/developer/tool prompts in English.

## Implementation Status (Current)

### Completed
1. Removed automatic audit execution from `changeset.compile` flow in chat/planning orchestration path.
2. Removed mandatory audit gate from `changeset.apply`; review gate remains.
3. Added chat intent policy module: `convex/sdk/chatPolicy.ts`.
4. Added intent detection categories and routing primitives:
   - `detectChatIntent`
   - `packsForIntent`
   - `allowedToolsForChatIntent`
   - `shouldAttachSuggestions`
5. Integrated chat intent telemetry:
   - `chat_intent_detected`
   - `chat_context_fetch`
   - `chat_tool_policy`
   - `chat_heavy_tool_blocked`
6. Added lazy context bootstrap in `CHAT_EDIT`:
   - no context preload for smalltalk,
   - targeted packs for read/write/audit intents.
7. Added dynamic per-intent tool allowlist in `CHAT_EDIT`.
8. Added hard enforcement to block disallowed tool calls in chat mode.
9. Disabled auto-compile of accumulated intents in `CHAT_EDIT` loop.
10. Updated actionable-content detection so `ChatBlock` counts as valid output.
11. Disabled recovery forcing for `CHAT_EDIT` (no forced planning tool chain for simple chat).
12. Added chat runtime profile in dispatch:
   - model `gpt-5-mini`,

### Completed (2026-02-13 follow-up hotfix)
1. Added chat prompt compaction in `convex/sdk/dispatch.ts`:
   - trims bootstrap context to compact project/tasks/elements snapshot,
   - caps bootstrap list sizes for tasks/elements/accounting lines,
   - removes heavy `brainDumpRaw/details` payload from chat prompt path.
2. Reduced chat prompt bloat from conversation history:
   - added chat history limit (`SDK_CHAT_HISTORY_LIMIT`, default `20`),
   - converts block-only history messages to short chat-like text instead of full JSON blocks.
3. Added chat rescue pass for empty model outputs:
   - when chat run returns empty content, dispatch issues one rescue completion with strict plain-text instruction,
   - logs `chat_rescue_text_success` / `chat_rescue_text_empty`.
4. Tightened chat intent tool policy in `convex/sdk/chatPolicy.ts`:
   - `planning_request` no longer exposes `changeset.*` by default,
   - `project_write_change` keeps `changeset.*`,
   - fallback tool policy now defaults to `context.get` only.
5. Tightened planning intent trigger keywords:
   - removed broad `plan/planning/תכנון/תכנן` triggers that were over-classifying normal chat as heavy planning.
6. Removed chat completion token caps in runtime:
   - `CHAT_EDIT` main completion now sends no `max_tokens`/`max_completion_tokens`,
   - chat rescue pass also sends no token cap,
   - policy remains: reduce unnecessary context and fetch more only when needed.
7. Switched `CHAT_EDIT` context strategy to tool-first full fetch:
   - no compact bootstrap context is pre-injected for chat runs,
   - first non-smalltalk turn forces a tool call,
   - `context.get` defaults to full packs:
     `["project","elements","tasks","accounting","quote","knowledge","qa"]`.
8. Removed chat history cap override (back to standard 50 message window in dispatch query).
   - reasoning effort `none`,
   - lower chat token budgets,
   - lower loop cap in chat mode.
13. Fixed reasoning normalization behavior:
   - explicit reasoning effort is respected,
   - no forced medium for `gpt-5*`,
   - o-series fallback preserved.
14. Added new tests:
   - `convex/sdk/__tests__/chatPolicy.test.mjs`
   - `convex/sdk/__tests__/reasoningPolicy.test.mjs`
15. Hardened orchestrator prompt for `CHAT_EDIT` fast mode:
   - concise chat-first behavior,
   - explicit-intent-only heavy tool usage,
   - lazy data pull guidance,
   - no automatic audit guidance.

### Validated
1. `npm run test:sdk` passes (including new tests).
2. ESLint passes on touched files:
   - `convex/sdk/dispatch.ts`
   - `convex/sdk/chatPolicy.ts`
   - `convex/lib/llm.ts`
   - `convex/lib/reasoning.ts`
   - `convex/sdk/__tests__/chatPolicy.test.mjs`
   - `convex/sdk/__tests__/reasoningPolicy.test.mjs`

### Remaining
1. Add integration-level dispatch tests for full `runNext` behavior in chat mode (currently covered by policy/unit tests + manual runtime flow).
2. Optional rollout flag (`ff_sdk_chat_intent_router_v1`) not yet introduced; behavior currently active via code path.
