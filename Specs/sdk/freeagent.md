# SDK Free Agent Plan

## Goal
Make `SDK Agent > Agent` a true free-chat orchestrator:
- Chat is the primary interaction mode.
- Orchestrator can use all SDK tools/agents as needed.
- Orchestrator can emit structured UI blocks (`QuestionsBlock`, `SuggestionsBlock`, `ReviewBlock`, `ChangeSetBlock`) together with chat.
- Missing baseline fields (location/budget/date) must not hard-block chat unless the user asks to run strict planning.
- Existing runs/conversations remain untouched.

## Confirmed Product Decisions
1. Free chat drives the conversation.
2. Agent may include structured blocks in the same assistant response.
3. Do not proactively force location/budget prompts for existing projects with data; stay silent unless user asks.
4. Leave old runs/conversations untouched.

## Problem Summary
Current behavior is caused by `runNext` routing to vNext when `ff_sdk_vnext_pipeline=true`.  
vNext starts at `brief` and enforces blocking validators, which repeatedly produce the same questions block.  
In SDK Agent UI, question submission is wired to legacy `skills.runner` APIs, not SDK vNext APIs, so the loop is not unlocked by normal chat flow.

## Root Causes
1. **Execution mode selected by global flag, not by run intent**
- `convex/sdk/dispatch.ts` checks `ff_sdk_vnext_pipeline` and enters vNext branch for all runs.
- This ignores whether run is conversational (`Agent tab`) or planning flow.

2. **Run defaults are planning-oriented**
- `convex/sdk/telemetry.ts` creates runs with `runMode: 'PLANNING_FLOW'` and `stageKey: 'intake'`.
- Agent tab starts runs via `api.sdk.api.startRun` without declaring conversational intent.

3. **SDK Agent block submit path uses wrong backend**
- `src/app/projects/[id]/sdk-agent/_components/AgentTab.tsx` renders shared `QuestionsBlock`.
- Shared block submits via `api.skills.runner.submitClarifications` and `api.skills.runner.runSkill` (legacy path), not SDK APIs.

## Target Behavior
### Agent Tab (Conversational)
- Always starts `CHAT_EDIT` runs.
- Always executes orchestrator free-chat loop in `dispatch.runNext`.
- Uses tool calls as needed.
- May return structured blocks, but none are mandatory to continue chatting.
- If a response includes questions, user can answer inline and continue chatting in same run.

### Planning Tab (Structured Flow)
- Keeps current strict staged pipeline behavior.
- Uses vNext gating and stage progression as-is.

## Design Changes
### 1) Explicit run intent
Add explicit run creation mode for SDK runs.

Proposed API contract:
- `api.sdk.api.startRun({ projectId, conversationId, mode?: 'chat' | 'planning', input?, shadowMode? })`

Rules:
- `mode='chat'` => `runMode='CHAT_EDIT'`, `stageKey='intake'`, `currentAgentName='orchestrator'`.
- `mode='planning'` => `runMode='PLANNING_FLOW'`, `stageKey='brief'` (or existing planning default), `currentAgentName='vnext_pipeline'` when applicable.
- If omitted, keep backward-compatible default (`planning`) for old callers, then migrate Agent tab call to `mode='chat'`.

### 2) Dispatch routing by run mode first
In `convex/sdk/dispatch.ts`:
- Compute `isPlanningRun = run.runMode === 'PLANNING_FLOW'`.
- Execute vNext pipeline only when both:
  - `isPlanningRun`
  - `ff_sdk_vnext_pipeline === true`
- Else execute free-chat orchestrator path.

Result:
- Feature flag can stay enabled globally for planning without hijacking conversational runs.

### 3) Agent tab conversation/run isolation
In `src/app/projects/[id]/sdk-agent/_components/AgentTab.tsx`:
- Create new conversations the same way, but start run with `mode:'chat'`.
- Resolve active run by preferring latest `CHAT_EDIT` run for selected conversation.
- If conversation has no `CHAT_EDIT` run, create one lazily.
- Keep old runs visible in DB, but do not bind Agent tab runtime to planning runs.

### 4) SDK-native question submission component
Create SDK-specific question block renderer for SDK Agent tab:
- New file: `src/app/projects/[id]/sdk-agent/_components/SdkQuestionsBlock.tsx`
- Behavior:
  - If block is `sdkVnext: true` and run is planning: call `api.sdk.api.answerVnext` + `api.sdk.api.continueVnext`.
  - Otherwise (conversational block): convert answers into a normal chat turn and call `runNext` with synthesized answer text.
- Do not use `api.skills.runner.*` from SDK Agent tab.

### 5) Non-blocking conversational question policy
In free-chat orchestrator branch:
- Never force `needs_input` just because questions exist.
- Questions are optional guidance unless explicitly marked hard-required by a tool contract invoked by user command.
- Continue accepting user chat regardless of unanswered blocks.

### 6) Silence policy for missing baseline constraints
In free-chat orchestrator mode:
- Do not auto-ask for missing `location`/`budget` in greeting or unrelated requests.
- Ask only when user request requires those constraints (for example: quote approval, strict budget estimate, schedule commitment).

## Detailed Implementation Tasks

### A. Backend run mode plumbing
Files:
- `convex/sdk/api.ts`
- `convex/sdk/telemetry.ts`

Tasks:
1. Add optional `mode` arg to `startRun`.
2. Pass mode into `internal.sdk.telemetry.createRun`.
3. Update `createRun` to set `runMode` based on mode.
4. Keep default behavior for old callers to avoid breaking existing flows.

Acceptance:
- Starting run from Agent tab stores `runMode='CHAT_EDIT'`.
- Existing planning code still works without changes.

### B. Dispatch mode gate
File:
- `convex/sdk/dispatch.ts`

Tasks:
1. Replace global-flag-only vNext branch with run-mode-aware branch.
2. Ensure `blocked/needs_input` early return only applies to planning gating semantics.
3. Preserve approval gate semantics for change sets in both modes.

Acceptance:
- Chat runs bypass vNext `brief` question gate.
- Planning runs continue to use vNext.

### C. SDK Agent UI run initialization
File:
- `src/app/projects/[id]/sdk-agent/_components/AgentTab.tsx`

Tasks:
1. Start run with `mode:'chat'`.
2. Guard active run selection to prefer chat run.
3. If no chat run exists for selected conversation, bootstrap one.

Acceptance:
- Sending "Hi" does not return repeated vNext brief block by default.

### D. Replace legacy question submit wiring
Files:
- New: `src/app/projects/[id]/sdk-agent/_components/SdkQuestionsBlock.tsx`
- Update: `src/app/projects/[id]/sdk-agent/_components/AgentTab.tsx`

Tasks:
1. Stop rendering shared legacy `QuestionsBlock` in SDK Agent tab.
2. Render `SdkQuestionsBlock` with SDK-aware submit handlers.
3. Remove dependence on `api.skills.runner.submitClarifications` in SDK Agent path.

Acceptance:
- Question block responses in SDK Agent follow SDK path only.
- No cross-system side effects into legacy skills runner.

### E. Conversational policy hardening
Files:
- `convex/sdk/prompts.ts`
- `convex/sdk/dispatch.ts`

Tasks:
1. Add explicit instruction in orchestrator prompt:
   - questions may be emitted, but chat must continue.
   - do not force baseline intake questions unless user intent requires it.
2. Keep structured blocks optional in free chat.
3. Ensure fallback blocks do not become mandatory blockers.

Acceptance:
- Orchestrator responds naturally to casual/user-directed requests and can still call tools.

## Compatibility and No-Migration Promise
- No mutation of existing `agentConversations` or old `sdkRuns`.
- No backfill/migration job.
- New behavior applies only to newly created chat runs and future dispatch cycles where run mode is `CHAT_EDIT`.

## Observability
Add telemetry events:
- `sdk_chat_mode_start`
- `sdk_dispatch_route_selected` with `{ route: 'vnext' | 'chat_orchestrator', runMode }`
- `sdk_questions_submit_path` with `{ path: 'sdk_vnext' | 'sdk_chat' }`

Use these to verify production behavior without inspecting raw DB rows manually.

## Test Plan

### Unit/logic tests
1. `dispatch` route selection:
- `runMode='CHAT_EDIT'` + `ff_sdk_vnext_pipeline=true` => chat orchestrator branch.
- `runMode='PLANNING_FLOW'` + `ff_sdk_vnext_pipeline=true` => vNext branch.

2. `startRun` mode mapping:
- mode chat => chat run fields.
- mode planning => planning run fields.

3. SDK questions submit path:
- SDK Agent questions use SDK APIs, not skills runner APIs.

### Integration scenarios
1. Existing rich project (elements/tasks/accounting present), open Agent tab, send "Hi":
- Should not auto-show brief gate questions.
- Should return free chat or relevant suggestions.

2. Ask actionable task:
- "Build me a quote summary and audit risks."
- Orchestrator may call tools and emit review/suggestion blocks.

3. Planning tab flow:
- Still shows structured staged behavior and can ask hard questions.

4. Approval safety:
- ChangeSet apply still requires review + audit + approval token.

## Rollout Plan
1. Implement backend run-mode plumbing + dispatch routing.
2. Implement SDK Agent UI run bootstrap and question component swap.
3. Add telemetry events and tests.
4. Verify against project `nn7a7t5rmws4shnbz9cb9d4gn980y9z7`.
5. Release behind existing flags; no DB migration.

## Risks and Mitigations
1. Risk: Some old conversational runs labeled planning.
- Mitigation: Agent tab creates/uses new chat run if active run is planning.

2. Risk: Mixed conversation with both run modes.
- Mitigation: bind each send action to selected run id, not just conversation id.

3. Risk: Structured block submit regressions.
- Mitigation: keep legacy shared block untouched; isolate SDK-specific block for SDK Agent tab only.

## Implementation Checklist
- [ ] Add `mode` to `startRun`.
- [ ] Wire `mode` into `createRun`.
- [ ] Route `runNext` by `runMode`.
- [ ] Update Agent tab to create/use `CHAT_EDIT` runs.
- [ ] Add `SdkQuestionsBlock`.
- [ ] Replace SDK Agent QuestionsBlock renderer.
- [ ] Add prompt policy updates for non-blocking free chat.
- [ ] Add telemetry events.
- [ ] Add tests.
- [ ] Manual verification on target project.

