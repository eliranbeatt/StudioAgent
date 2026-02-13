# SDK Agent Free Chat v2 Plan

## Intent
Implement `SDK Agent > Agent` as a true free-chat orchestrator that can emit structured blocks, while keeping planning flow separate.

This plan incorporates your decisions:
1. Free chat is the primary driver.
2. Questions blocks are allowed, but answers are submitted only on explicit submit action.
3. Missing location/budget/date should stay silent unless user asks for operations that require them.
4. Old conversations/runs remain untouched.
5. Agent tab should use a conversation sidebar with full session management, reusing existing mechanisms/patterns.

---

## Current State (Code Findings)

### 1) Wrong execution branch for Agent tab
- `convex/sdk/dispatch.ts` routes to vNext pipeline when `ff_sdk_vnext_pipeline=true`.
- This is global, not run-intent aware.
- In your deployment, `ff_sdk_vnext_pipeline` is `true`, so Agent tab traffic enters vNext.

### 2) Repeated brief questions come from vNext validator
- Repeated block is built by `buildQuestionsBlock` in `convex/sdk/vnext/pipeline.ts`.
- Title text comes from stage meta: `convex/sdk/vnext/stages.ts` (`brief => בריף ואילוצים`).
- Question text is hardcoded in `convex/sdk/vnext/validators/validateBrief.ts`:
  - `איפה ההקמה/האירוע?`
  - `מה מסגרת התקציב המשוערת?`

### 3) SDK Agent tab currently uses legacy QuestionsBlock submit path
- `src/app/projects/[id]/sdk-agent/_components/AgentTab.tsx` renders shared `QuestionsBlock` from legacy agent UI.
- That block submits via `api.skills.runner.submitClarifications` and runs `skills.runner` actions.
- This is not SDK orchestrator-native behavior and causes mixed pipelines.

### 4) Conversation UX in SDK Agent is minimal
- SDK backend already has conversation CRUD + title generation:
  - `createConversation`, `listConversations`, `renameConversation`, `deleteConversation`, `generateConversationTitle` in `convex/sdk/api.ts`.
- But SDK Agent UI currently has no left conversation sidebar like Agent page.

### 5) Run defaults are planning-biased
- `internal.sdk.telemetry.createRun` sets `runMode: 'PLANNING_FLOW'` and `stageKey: 'intake'` by default.
- `api.sdk.api.startRun` does not accept explicit mode yet.

---

## Product Rules for v2

### Agent tab (new behavior)
1. Always conversational.
2. Can output free chat plus any structured block types.
3. QuestionsBlock answers are sent only when user clicks Submit.
4. Submit posts one combined user message to orchestrator (`runNext`) and gets next response.
5. No automatic forced brief gating.
6. Show only chat conversations in this tab.
7. If no chat conversation exists, create a brand-new one.
8. No reuse of planning conversations in Agent tab.

### Planning tab (unchanged behavior)
1. Remains staged/structured.
2. Keeps vNext pipeline and strict gating.
3. Keeps old planning conversations and runs unchanged.

---

## Architecture Changes

## A. Route by run intent, not only by global flag

### Backend
1. Add explicit start mode to SDK run creation:
- `startRun({ ..., mode?: 'chat' | 'planning' })`

2. Persist mode to run:
- `mode: 'chat' => runMode='CHAT_EDIT'`
- `mode: 'planning' => runMode='PLANNING_FLOW'`

3. Update `dispatch.runNext` routing:
- vNext path only when:
  - feature flag enabled
  - `run.runMode === 'PLANNING_FLOW'`
- Otherwise use free-chat orchestrator path.

### Why
This decouples planning flow from conversational agent while keeping both available.

---

## B. Conversation sidebar in SDK Agent (reused mechanism, no duplicated behavior)

### Reuse strategy
Extract current Agent page sidebar UI pattern into a shared component and use it in SDK Agent:
- Current pattern source: `src/app/projects/[id]/agent/page.tsx`
- New shared component (proposed): `src/app/projects/[id]/_components/ConversationsSidebar.tsx`
- SDK Agent and Agent page both consume it with adapters.

### Shared sidebar capabilities
1. List conversations
2. Select conversation
3. New conversation
4. Rename inline
5. Generate AI title
6. Delete conversation (with confirm)
7. Date/timestamp display

### SDK Agent adapter functions
Use existing SDK APIs:
- `api.sdk.api.listConversations` (or new chat-filtered query)
- `api.sdk.api.createConversation`
- `api.sdk.api.renameConversation`
- `api.sdk.api.generateConversationTitle`
- `api.sdk.api.deleteConversation`

### Note on “no duplication”
No duplicate sidebar markup/state logic. One shared sidebar component + per-page API adapter.

---

## C. Chat-only visibility in SDK Agent

### Requirement
“UI shows only chats, not planning.”

### Implementation
Create a new query in SDK API:
- `listChatConversations(projectId)`

Selection logic:
1. Load all project conversations.
2. Load sdk runs for project.
3. Keep only conversations whose latest SDK run mode is `CHAT_EDIT`.
4. Exclude planning-only conversations.
5. Keep old data untouched in DB.

Fallback behavior:
- If the filtered list is empty, create a brand-new chat conversation in Agent tab.

---

## D. QuestionsBlock behavior in SDK Agent

### Current issue
SDK Agent imports legacy `QuestionsBlock` that submits into `skills.runner`.

### New behavior
Create SDK-specific block renderer:
- New component: `src/app/projects/[id]/sdk-agent/_components/SdkQuestionsBlock.tsx`

Rules:
1. Inputs are local-only until user clicks Submit.
2. Submit serializes answers into one user message payload.
3. Send payload to `runNext` for current `CHAT_EDIT` run.
4. No auto-submit on option click.
5. No direct calls to `skills.runner.*` in SDK Agent tab.

Payload format proposal:
```text
Answers:
- <question1>: <answer>
- <question2>: <answer>
```

Optional: include structured JSON suffix for parser reliability.

---

## E. Message list isolation to chat run

### Requirement
Do not show planning messages in SDK Agent chat panel.

### Implementation
1. Bind Agent tab message list to selected chat run id:
- `listMessages({ conversationId, runId: activeChatRunId })`
2. Ensure selected run is `CHAT_EDIT`.
3. If no chat run exists for selected chat conversation, create one with mode `chat`.

This avoids cross-run leakage even if conversation has mixed history.

---

## Backend Work Breakdown

## 1) `convex/sdk/api.ts`
1. Extend `startRun` args with `mode`.
2. Pass desired run mode to telemetry createRun.
3. Add `listChatConversations` query (filter by latest SDK run mode).
4. Ensure deleteConversation remains SDK safe (already exists).
5. Optional: update conversation `updatedAt` on message append.

## 2) `convex/sdk/telemetry.ts`
1. Extend `createRun` args with optional run mode.
2. Default mode for backward compatibility:
- if omitted: keep existing behavior for old callers.
- new Agent tab caller passes explicit chat mode.
3. Optional helper mutation to touch `agentConversations.updatedAt` when messages are appended.

## 3) `convex/sdk/dispatch.ts`
1. Gate vNext by run mode + flag.
2. Keep free-chat orchestrator as default for `CHAT_EDIT`.
3. Ensure `needs_input` hard-block semantics are planning-only.
4. Preserve approval controls for changesets.

## 4) `convex/sdk/prompts.ts`
1. Add explicit conversational policy:
- keep chat flowing by default
- ask only if needed for requested action
- do not emit forced intake interrogations for unrelated prompts

---

## Frontend Work Breakdown

## 1) Shared conversations sidebar extraction
Files:
- New: `src/app/projects/[id]/_components/ConversationsSidebar.tsx`
- Update: `src/app/projects/[id]/agent/page.tsx` to consume shared component
- Update: `src/app/projects/[id]/sdk-agent/_components/AgentTab.tsx` to consume shared component

Sidebar props model:
- `items`, `activeId`, `onSelect`
- `onCreate`, `onRename`, `onGenerateTitle`, `onDelete`
- `loading`, `emptyLabel`

## 2) SDK AgentTab run bootstrap
File:
- `src/app/projects/[id]/sdk-agent/_components/AgentTab.tsx`

Changes:
1. Query chat-only conversations.
2. Auto-create brand-new chat conversation if none.
3. Start run with explicit `mode:'chat'`.
4. Filter runs to chat mode.
5. Message query scoped to active chat run id.

## 3) SDK-specific questions block
Files:
- New: `src/app/projects/[id]/sdk-agent/_components/SdkQuestionsBlock.tsx`
- Update `BlockRenderer` in AgentTab to use `SdkQuestionsBlock`.

Behavior:
1. Collect answers in component state.
2. Submit button triggers one `runNext`.
3. Disable submit while dispatching.

---

## Data Compatibility

1. No migration/backfill of old runs.
2. No deletion or mutation of old planning conversations.
3. New behavior applies to new chat runs and chat-filtered SDK Agent UI.

---

## QA and Acceptance Criteria

## A. Core acceptance
1. In SDK Agent tab, sending `Hi` does not show forced brief validator block.
2. Agent responds in free chat and may include structured blocks.
3. Questions block answers are sent only on Submit, not per field change.
4. SDK Agent sidebar supports: new, rename, AI title, delete.
5. Sidebar shows only chat conversations.
6. Planning tab behavior unchanged.

## B. Regression checks
1. ChangeSet approval flow still works.
2. Planning flow still progresses with vNext when used in planning tab.
3. Old conversations remain visible where they were before; SDK Agent chat view stays filtered.

## C. Manual scenario on target project
Project: `nn7a7t5rmws4shnbz9cb9d4gn980y9z7`
1. Open SDK Agent > Agent.
2. Verify new/filtered chat sidebar appears.
3. Send generic message, confirm no forced brief questions.
4. Ask for an operation that can produce blocks, confirm free chat + block coexistence.
5. Rename, generate title, delete a chat conversation.

---

## Rollout Plan
1. Implement backend mode-aware routing.
2. Implement shared sidebar extraction.
3. Implement SDK Agent chat-only filtering and run bootstrap.
4. Swap to `SdkQuestionsBlock`.
5. Add tests.
6. Validate on target project.
7. Ship with existing flags; no migration.

---

## Risks and Mitigations

1. Risk: Mixed conversation histories confuse UI.
- Mitigation: message query scoped to active chat run id.

2. Risk: Filtering removes all historical items unexpectedly.
- Mitigation: auto-create new chat conversation; keep planning history in planning tab only.

3. Risk: Shared sidebar refactor breaks Agent page.
- Mitigation: extract component with adapter props and keep page-specific logic minimal.

4. Risk: Existing callers relying on `startRun` defaults.
- Mitigation: keep backward-compatible default mode when arg not provided.

---

## Implementation Checklist
- [x] Add `mode` to SDK `startRun`.
- [x] Persist run mode in telemetry createRun.
- [x] Route dispatch by `runMode`.
- [x] Add `listChatConversations`.
- [x] Add/touch conversation updated timestamp on message append.
- [x] Extract shared `ConversationsSidebar`.
- [x] Wire sidebar into SDK Agent tab.
- [x] Start new chat conversations with `mode:'chat'`.
- [x] Scope message list to active chat run only.
- [x] Replace legacy `QuestionsBlock` with `SdkQuestionsBlock`.
- [x] Add delete conversation action in SDK sidebar.
- [ ] Add tests and manual verification.

## Execution Status (2026-02-13)
- Implemented backend mode-aware run creation and dispatch routing.
- Implemented shared conversations sidebar and wired it to Agent + SDK Agent pages.
- Implemented SDK chat-only conversations, chat-run bootstrap, and run-scoped message history.
- Implemented SDK submit-only questions block (no per-answer auto-submit, no legacy `skills.runner` submit path).
- Remaining: full manual UI regression pass and end-to-end `runNext` runtime validation once OpenAI quota is available.

## QA Smoke Results (2026-02-13)
- PASS: `startRun({ mode: 'chat' })` creates runs with `runMode='CHAT_EDIT'` and `stageKey='chat'`.
- PASS: `listChatConversations(projectId)` includes chat conversations and excludes planning-only conversations.
- PASS: Conversation rename flow via SDK API.
- PASS: Conversation `updatedAt` is touched on SDK message append.
- PASS: Conversation delete flow and cleanup for temporary QA conversations.
- BLOCKED: End-to-end `sdk/dispatch:runNext` LLM response validation due OpenAI quota (`429`).
- BLOCKED: In-browser visual/manual checks from this CLI environment (no browser automation setup in this task).
