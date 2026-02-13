# SDK Free Agent v4 (Adjusted to Real Repo State)

## Why this v4 plan exists
The attached plan is directionally good, but it assumes structures that do not exist yet in this repo (`Turn`, `UIBlockSet`, standalone staged input backend model, direct tray status model).  
This v4 plan maps that UX to the current codebase and adds the missing backend flow fixes that are causing the current "asks for permission and does nothing" loop.

---

## Current Repo Truth (as of now)

### Already implemented and reusable
1. Conversation persistence + sidebar is already implemented and should be reused:
   - `src/app/projects/[id]/_components/ConversationsSidebar.tsx`
   - `src/app/projects/[id]/sdk-agent/_components/AgentTab.tsx`
   - Backend: `convex/sdk/api.ts` (`createConversation`, `listChatConversations`, `renameConversation`, `deleteConversation`, `generateConversationTitle`)
2. Chat timeline with structured assistant blocks already exists:
   - `ChatBlock`, `SuggestionBlock`, `ChangeSetBlock`, `ReviewBlock`, `SdkQuestionsBlock`
3. ChangeSet infrastructure is mature and reusable:
   - Compile/review/apply flow in `convex/sdk/changeset.ts`
   - Rich manual review/edit drawer in `src/app/projects/[id]/agent/_components/ChangeSetReviewDrawer.tsx`
4. Chat intent router exists (but is too brittle):
   - `convex/sdk/chatPolicy.ts`
5. Chat run mode exists and is separated from planning run mode:
   - `sdkRuns.runMode` in schema and usage in `dispatch.ts`

### Confirmed mismatches causing the current loop
1. Short replies become smalltalk:
   - `looksLikeSmalltalk` marks any message with `length <= 4` as smalltalk.
   - File: `convex/sdk/chatPolicy.ts:105-110`
   - Impact: replies like `כן`, `1` lose workflow context.
2. "Create tasks" can route to planning intent that cannot execute writes:
   - `planning_request` currently does **not** allow `changeset.compile/review/apply`.
   - File: `convex/sdk/chatPolicy.ts:144-153`
   - Impact: assistant can discuss planning but cannot finalize actionable changesets in that route.
3. Chat while awaiting approval is hard-blocked:
   - `runNext` returns immediately when run status is `awaiting_approval`.
   - File: `convex/sdk/dispatch.ts:590-592`
   - Impact: user can type `כן` repeatedly and nothing executes.
4. UI approval action has an extra audit gate that conflicts with "no automatic audit":
   - `approveChangeSet` requires `audit_snapshot` event and blocks without audit.
   - File: `convex/sdk/api.ts:1939-1952`
   - Impact: approval can fail even after valid review.
5. `ChangeSetBlock` Apply/Discard buttons are not wired in SDK Agent tab:
   - UI component supports `onApply`/`onDiscard`, but SDK `BlockRenderer` passes only `onReview`.
   - Files:
     - `src/app/projects/[id]/agent/_components/Blocks/ChangeSetBlock.tsx:3,38-49`
     - `src/app/projects/[id]/sdk-agent/_components/AgentTab.tsx:320-325`
6. Non-smalltalk chat forces first tool call (`tool_choice: required`):
   - File: `convex/sdk/dispatch.ts:1172-1173`
   - Impact: amplifies repetitive context-fetch behavior if intent/pending state is wrong.

---

## Adjustments to the attached plan (fit to this repo)

### Keep from attached plan
1. Main chat timeline remains source of truth.
2. Add right panel with:
   - "Next" staged controls (suggestion + questions)
   - "ChangeSets tray"
3. Clicks in staged controls are queued and only submitted on explicit "Send updates" (or attached to next chat send).
4. ChangeSet approval should be direct backend apply (no extra LLM turn).
5. Edit flow stays via existing diff/editor drawer.

### Replace from attached plan (repo-aligned mapping)
1. Do not create a brand-new `Turn` entity now.
   - Use existing `agentMessages` + `runId` + `createdAt` as turn source.
2. Do not create a separate `UIBlockSet` table now.
   - Extract current "Next" data from latest assistant `blocks` in message stream.
3. Do not create a new generic `ProposedChangeSet` entity.
   - Use existing `changeSets` table and existing statuses (`PROPOSED`, `APPLIED`, `PARTIALLY_APPLIED`, `DISCARDED`).
4. If staged controls need persistence across refresh:
   - Add a minimal `sdkQueuedInputs` table later (Phase 3 optional), not in first delivery.

---

## Root Causes to fix first (execution blocker)

1. Context-unaware intent handling for confirmations.
2. Awaiting-approval state cannot be advanced from chat input.
3. Write execution path is split incorrectly between intents and approval endpoints.

These three are the direct reason for "asks permission and does nothing."

---

## v4 Implementation Plan

## Phase 0: Unblock execution loops (backend-first, mandatory)

### 0.1 Add pending workflow handling in dispatcher
Files:
- `convex/sdk/dispatch.ts`
- `convex/schema.ts` (only if new run fields are added)
- `convex/sdk/telemetry.ts` (if run state patch shape expands)

Changes:
1. Before generic intent flow, detect run-level pending state:
   - `awaiting_approval`
   - `needs_input` with last asked questions context
2. For `awaiting_approval`:
   - Parse user text for approval/rejection (`כן`, `מאשר`, `approve`, `לא`, `בטל`, `reject`)
   - On approval: call `sdk.changeset.apply` directly.
   - On rejection: clear pending changeset and return concise confirmation.
   - On ambiguous text: return explicit one-line instruction + SuggestionsBlock.
3. Do not return early for `awaiting_approval` when user actually supplied approval/rejection text.

Acceptance:
1. Typing `כן` after approval request applies the pending changeset in same run.
2. No repeated "approve to continue?" loop for same pending changeset.

### 0.2 Fix chat intent classification for short replies and Hebrew task-create requests
Files:
- `convex/sdk/chatPolicy.ts`
- `convex/sdk/__tests__/chatPolicy.test.mjs`

Changes:
1. Remove `trimmed.length <= 4 => smalltalk`.
2. Add explicit `workflow_reply` handling or equivalent contextual override.
3. Prioritize write intent when text contains create/change verbs + entity targets (tasks/elements/budget), including Hebrew variants.
4. Keep smalltalk detection keyword-based, not length-based.

Acceptance:
1. `תייצר מזה משימות` routes to write-capable path.
2. `כן`, `1` are treated as workflow replies when pending state exists.

### 0.3 Align tool policy with write/planning execution
Files:
- `convex/sdk/chatPolicy.ts`
- `convex/sdk/dispatch.ts`

Changes:
1. Add `changeset.compile` and `changeset.review` to the planning/write routes that are expected to output actionable changes.
2. Keep `changeset.apply` approval-gated only.
3. Keep `audit.project` explicit-intent only (no automatic audit).

Acceptance:
1. Task creation intent can produce a reviewed ChangeSet without manual mode switching.

### 0.4 Remove hidden audit gate from SDK approval button path
Files:
- `convex/sdk/api.ts`
- optionally route button to `api.sdk.changeset.apply` instead of `api.sdk.api.approveChangeSet`
- `src/app/projects/[id]/sdk-agent/_components/AgentTab.tsx`

Changes:
1. `approveChangeSet` must not fail due to missing audit event in chat mode.
2. Reuse same gating as `sdk.changeset.apply` (token + pending changeset + review pass).
3. Preserve audit checks only for explicit audit flow or planning-flow policy gates (not chat default).

Acceptance:
1. Clicking "Approve & Apply" succeeds after review, without requiring audit snapshot.

---

## Phase 1: Implement attached UX safely using existing components

### 1.1 SDK Agent layout: chat + right panel
Files:
- `src/app/projects/[id]/sdk-agent/_components/AgentTab.tsx`

Changes:
1. Keep existing left `ConversationsSidebar` unchanged.
2. Main center remains chat timeline + composer.
3. Add right rail with two stacked cards:
   - `Next`
   - `ChangeSets`

### 1.2 "Next" panel staged controls (no immediate run)
Files:
- `src/app/projects/[id]/sdk-agent/_components/AgentTab.tsx`
- new `src/app/projects/[id]/sdk-agent/_components/SdkNextPanel.tsx` (recommended)

Changes:
1. Extract latest assistant `QuestionsBlock` and `Suggestion(s)Block` from message stream.
2. UI behavior:
   - Selection click updates local staged state and shows "Queued".
   - No agent call on selection click.
3. Sticky actions:
   - `Send updates` submits one composed message payload.
   - `Clear` resets staged state.
4. If user sends a normal chat message while queue is dirty:
   - Auto-attach staged selections to that outgoing payload.

Acceptance:
1. No dispatch call happens on chip click.
2. One dispatch call happens on `Send updates`.

### 1.3 ChangeSets tray with statuses/actions
Files:
- new query in `convex/changeSets.ts` (list by project/status and recency)
- `src/app/projects/[id]/sdk-agent/_components/AgentTab.tsx`
- optionally new `src/app/projects/[id]/sdk-agent/_components/SdkChangeSetsTray.tsx`

Changes:
1. Show recent project changesets grouped by mapped UI statuses:
   - Pending approval => `PROPOSED`
   - Applied => `APPLIED` / `PARTIALLY_APPLIED`
   - Rejected => `DISCARDED`
2. Row actions:
   - Review (open existing `ChangeSetReviewDrawer`)
   - Approve/apply (direct backend call, no extra LLM turn)
   - Reject/discard
3. Add chat timeline system event after apply/discard (optional but recommended).

Acceptance:
1. User can apply/discard from tray without chat round-trip.
2. Status updates immediately after backend mutation.

### 1.4 Wire ChangeSetBlock actions in chat stream
Files:
- `src/app/projects/[id]/sdk-agent/_components/AgentTab.tsx`

Changes:
1. Pass `onApply` and `onDiscard` handlers to `ChangeSetBlock`.
2. Keep `onReview` as-is.

Acceptance:
1. Apply/Discard buttons inside chat block work in SDK Agent tab.

---

## Phase 2: Conversation quality + no-loop guardrails

Files:
- `convex/sdk/dispatch.ts`
- `convex/sdk/chatPolicy.ts`

Changes:
1. Add approval-loop guard:
   - if same pending action requested twice, force deterministic branch (apply/reject/help prompt).
2. Add telemetry:
   - `sdk_pending_action_detected`
   - `sdk_pending_action_resolved`
   - `approval_loop_detected`
3. Keep chat concise default; keep SuggestionsBlock optional.

Acceptance:
1. Repeated "yes" cannot remain in no-op loop.

---

## Phase 3 (Optional): Persist queued "Next" selections across refresh

Only if needed after Phase 1 validation.

Files:
- `convex/schema.ts` (new table)
- new `convex/sdk/queuedInput.ts`
- `AgentTab.tsx` / `SdkNextPanel.tsx`

Proposal:
1. Add `sdkQueuedInputs` keyed by `{ runId, conversationId, sourceMessageId }`.
2. Save staged state on every selection change (debounced).
3. Clear on successful send.

---

## Test Plan

## Unit tests
Files:
- `convex/sdk/__tests__/chatPolicy.test.mjs`
- new `convex/sdk/__tests__/dispatchPendingFlow.test.mjs`

Cases:
1. `תייצר מזה משימות` => write-capable intent/tool policy.
2. `כן` with pending approval => apply path selected.
3. `1` after options => treated as workflow reply, not smalltalk.

## Integration tests (action-level)
1. Start chat run -> create pending changeset -> send `כן` -> verify changeset applied and run unblocked.
2. Ensure no audit snapshot required for chat approval path.
3. Ensure no tool call on staged UI selection clicks.

## Manual validation on target project
Project: `nn7a7t5rmws4shnbz9cb9d4gn980y9z7`
1. Ask: `תייצר מזה משימות`
2. Approve by typing `כן` in chat.
3. Approve via tray button.
4. Verify tasks/changeset state updates and no repeated permission loop.

---

## Rollout strategy

1. Ship Phase 0 first (backend behavior correctness).
2. Then Phase 1 UI in small increment:
   - first Next panel
   - then ChangeSets tray
3. Keep feature flag for right panel if needed (`ff_sdk_agent_right_panel_v1`).
4. Monitor:
   - tool calls per chat turn
   - apply success rate
   - repeated approval prompts per run
   - median latency

---

## Definition of done

1. User can request actionable creation, receive one reviewed ChangeSet, and approve it by text or button without loops.
2. Chat remains free-form; structured controls are available as optional staged tools in right panel.
3. No automatic audits in chat flow.
4. Existing conversation sidebar/reuse constraints are preserved (no duplicated conversation mechanism).
