# SDK Free Agent v5 - Repo-Aligned Delivery Plan

## Goal
Deliver a reliable SDK Agent chat experience where:
1. Free chat is the primary interaction.
2. Structured controls (questions/suggestions) are available as side tools, not blockers.
3. ChangeSets can be reviewed/applied/discarded directly from SDK Agent UI.
4. Approval loops are eliminated (`yes`/`no` must resolve pending actions deterministically).

This plan updates and supersedes `Specs/sdk/freeagerntev4.md` by aligning to current repo code.

---

## Current Repo Reality (verified)

### Already in place (reuse, do not duplicate)
1. Conversation persistence + sidebar:
   - `src/app/projects/[id]/_components/ConversationsSidebar.tsx`
   - `convex/sdk/api.ts`: `createConversation`, `listChatConversations`, `renameConversation`, `deleteConversation`, `generateConversationTitle`
2. SDK chat timeline and block rendering:
   - `src/app/projects/[id]/sdk-agent/_components/AgentTab.tsx`
   - existing block components: `ChatBlock`, `SuggestionBlock`, `ChangeSetBlock`, `ReviewBlock`, `SdkQuestionsBlock`
3. ChangeSet lifecycle core:
   - `convex/changeSets.ts` (`create`, `apply`, `discard`, `applyChangeSetOps`, etc.)
   - SDK wrapper tools in `convex/sdk/changeset.ts`
   - review/edit drawer: `src/app/projects/[id]/agent/_components/ChangeSetReviewDrawer.tsx`

### Confirmed blockers still present
1. Pending approval dead-end:
   - `convex/sdk/dispatch.ts` returns early on `awaiting_approval`.
2. Short-reply misclassification:
   - `convex/sdk/chatPolicy.ts` marks `length <= 4` as smalltalk.
3. Planning intent cannot complete write path:
   - `planning_request` tools omit `changeset.compile`/`changeset.review`.
4. Approve button path still has audit hard-gate:
   - `convex/sdk/api.ts` `approveChangeSet` requires `audit_snapshot`.
5. SDK Agent chat block does not wire apply/discard:
   - `AgentTab.tsx` passes only `onReview` into `ChangeSetBlock`.
6. Chat still forces heavy context/tool behavior:
   - forced first tool call for non-smalltalk.
   - chat policy text asks model to call `context.get` with full packs before answering.

---

## Scope for v5

### In scope
1. Fix approval/write loops.
2. Add SDK Agent right rail:
   - `Next` panel (staged suggestion + questions)
   - `ChangeSets` tray
3. Keep conversation UX from existing shared components.
4. Keep free chat as default and fast path.

### Out of scope (v5)
1. New generic Turn/UIBlockSet backend tables.
2. Rewriting flow-agent architecture.
3. Automatic audits.
4. Mandatory persistence of staged side-panel selections across refresh (optional phase only).

---

## Target UX and Behavior

1. Center panel remains chat timeline truth.
2. Right rail has:
   - `Next`: latest assistant suggestion/questions as staged controls.
   - `ChangeSets`: recent project changesets grouped by status with actions.
3. Chip/select clicks in `Next` are local queued state only.
4. Only explicit send triggers backend call:
   - `Send updates` in right rail, or
   - normal chat send (auto-attaches queued state).
5. ChangeSet apply/discard does not require a new LLM roundtrip.
6. `yes`/`no` text while pending approval resolves state immediately.

---

## Architecture Decisions

1. Use existing `agentMessages` as turn history source.
2. Derive `Next` panel from latest assistant blocks (no new table in v5).
3. Use existing `changeSets` table/statuses:
   - Pending = `PROPOSED`
   - Applied = `APPLIED`/`PARTIALLY_APPLIED`
   - Rejected = `DISCARDED`
4. Keep staging state client-side first; optional persistence later.

---

## Phase 0 - Correctness First (mandatory)

### 0.1 Pending action resolver in dispatch
Files:
- `convex/sdk/dispatch.ts`

Changes:
1. Replace hard early return on `awaiting_approval` with resolver branch:
   - parse approval/rejection from user text (`yes`, `approve`, `no`, `cancel`, Hebrew variants).
   - on approve: call `api.sdk.changeset.apply` (or shared helper).
   - on reject: clear pending changeset and move run back to `running`.
2. Add lightweight branch for ambiguous short reply:
   - assistant returns one-line instruction plus optional suggestion block.
3. If no user message and still awaiting approval, keep existing status return behavior.

Acceptance:
1. Typing `yes` after approval request applies pending changeset.
2. Typing `no` discards/cancels pending path.
3. No repeated approval prompt loop for the same pending change.

### 0.2 Chat intent classifier fixes
Files:
- `convex/sdk/chatPolicy.ts`
- `convex/sdk/__tests__/chatPolicy.test.mjs`

Changes:
1. Remove `trimmed.length <= 4` smalltalk heuristic.
2. Add contextual workflow-reply handling for short tokens under pending states.
3. Extend Hebrew write/planning phrase coverage for task creation/change requests.
4. Ensure `planning_request` route is write-capable where needed.

Acceptance:
1. Short confirmations are not downgraded to smalltalk in workflow context.
2. Hebrew "create tasks from this" style prompts route to actionable path.

### 0.3 Tool policy alignment for planning/write
Files:
- `convex/sdk/chatPolicy.ts`

Changes:
1. Add `changeset.compile` and `changeset.review` to `planning_request`.
2. Keep `changeset.apply` approval-gated only.
3. Keep audit explicit-only.

Acceptance:
1. Planning request can produce reviewable changeset in one flow.

### 0.4 Remove hidden audit gate from SDK approval path
Files:
- `convex/sdk/api.ts`

Changes:
1. Refactor `approveChangeSet` to share gating with `sdk/changeset.apply`.
2. Remove mandatory `audit_snapshot` dependency for chat approval.
3. Keep review validity gate.

Acceptance:
1. SDK approve button works without audit event in chat mode.

### 0.5 SDK Agent ChangeSetBlock action wiring
Files:
- `src/app/projects/[id]/sdk-agent/_components/AgentTab.tsx`

Changes:
1. Wire `onApply` and `onDiscard` to `ChangeSetBlock` (same pattern as `AgentChat`/`FlowChat`).
2. Keep `onReview` wired to `ChangeSetReviewDrawer`.

Acceptance:
1. Apply/discard buttons inside SDK chat message work.

---

## Phase 1 - Right Rail UX (Next + ChangeSets)

### 1.1 Layout upgrade in SDK Agent tab
Files:
- `src/app/projects/[id]/sdk-agent/_components/AgentTab.tsx`

Changes:
1. Keep current left sidebar + center chat.
2. Add right rail column with:
   - top card: `SdkNextPanel`
   - bottom card: `SdkChangeSetsTray`
3. Mobile behavior: right rail collapses below chat or to tabs.

Acceptance:
1. SDK Agent screen shows stable 3-column desktop layout.

### 1.2 Next panel component with staged controls
Files:
- new `src/app/projects/[id]/sdk-agent/_components/SdkNextPanel.tsx`
- `src/app/projects/[id]/sdk-agent/_components/AgentTab.tsx`

Data source:
1. Parse latest assistant message blocks.
2. Select latest suggestion block and latest questions block.
3. Normalize to a compact "next controls" model:
   - one suggestion decision
   - one yes/no question
   - one single-choice question

Behavior:
1. Clicks update local staged state (`Queued`) only.
2. No backend call on click.
3. `Send updates` submits queued payload as a single user message.
4. If user sends normal chat while queued state exists, auto-attach queued payload.
5. `Clear` resets staged state.

Payload strategy:
1. v5 default (no schema change): embed machine-readable marker in user text:
   - `[SDK_QUEUED_INPUT_V1]{...}[/SDK_QUEUED_INPUT_V1]`
2. Dispatch parser extracts this payload before intent routing.

Acceptance:
1. Zero runNext calls from selection clicks.
2. Exactly one runNext call from `Send updates`.

### 1.3 ChangeSets tray component
Files:
- new `src/app/projects/[id]/sdk-agent/_components/SdkChangeSetsTray.tsx`
- `src/app/projects/[id]/sdk-agent/_components/AgentTab.tsx`
- `convex/changeSets.ts` (new list query)

Backend query:
1. Add list query by project, recent first, filterable by statuses.
2. Return preview-ready fields:
   - id, status, reason/summary, ops count, createdAt.

Tray behavior:
1. Group by Pending/Applied/Rejected.
2. Row actions:
   - Review (open existing drawer)
   - Apply
   - Discard
3. Apply/discard mutate backend directly.
4. If action resolves active run pending changeset, update run state and clear pending token.

Acceptance:
1. User can apply/discard without a new LLM turn.
2. Tray updates immediately after action.

### 1.4 Optional chat event after tray action
Files:
- `convex/sdk/telemetry.ts` (append message helper usage)
- `convex/sdk/api.ts` or `convex/sdk/dispatch.ts` action wrapper

Changes:
1. On apply/discard from tray, append concise assistant/system event message for auditability.

Acceptance:
1. Timeline reflects applied/discarded action context.

---

## Phase 2 - Fast Chat + Context Discipline

### 2.1 Remove forced heavy fetch pattern in chat
Files:
- `convex/sdk/dispatch.ts`

Changes:
1. Stop forcing first tool call for all non-smalltalk chat turns.
2. Use intent + question type to decide if tool call is necessary.
3. Keep `context.get` lazy and scoped:
   - greeting/smalltalk: no tool
   - read question: minimal packs first
   - write request: fetch only required packs before compile path

Acceptance:
1. `hi` does not trigger planning/costing/audit pipeline.
2. Simple read queries use minimal context fetch.

### 2.2 Update chat system policy text
Files:
- `convex/sdk/dispatch.ts` (system policy message for chat mode)

Changes:
1. Replace "always fetch full packs first" instruction with "fetch minimal required context only when needed".

Acceptance:
1. Model no longer defaults to full-pack pull on every non-smalltalk turn.

### 2.3 Handle empty/no-content LLM finish safely
Files:
- `convex/sdk/dispatch.ts`

Changes:
1. Detect `message.content` empty + no usable blocks.
2. Fallback to concise assistant response:
   - either from last tool output summary
   - or direct retry with stricter "return chat block" instruction once
3. Log telemetry event for this failure mode.

Acceptance:
1. User does not receive "No content" for successful run without explanation.

---

## Phase 3 - Guardrails and Observability

Files:
- `convex/sdk/dispatch.ts`
- `convex/sdk/telemetry.ts`

Changes:
1. Add explicit approval loop detector:
   - if same pending action requested repeatedly, force deterministic resolve/help branch.
2. Add events:
   - `sdk_pending_action_detected`
   - `sdk_pending_action_resolved`
   - `approval_loop_detected`
   - `chat_empty_completion_fallback`

Acceptance:
1. Repeated confirmations cannot keep run in no-op loop.

---

## Optional Phase 4 - Persist staged Next panel state across refresh

Only after v5 stability.

Files:
- `convex/schema.ts` (new table)
- new `convex/sdk/queuedInput.ts`
- `SdkNextPanel.tsx`

Approach:
1. Add minimal `sdkQueuedInputs` keyed by `runId + conversationId + sourceMessageId`.
2. Save debounced state on selection changes.
3. Clear after successful send.

---

## Testing Plan

### Unit tests
1. `convex/sdk/__tests__/chatPolicy.test.mjs`
   - short confirmations in pending context
   - Hebrew task-create intent routing
   - planning intent tool allowlist includes compile/review
2. new `convex/sdk/__tests__/dispatchPendingFlow.test.mjs`
   - awaiting approval + yes -> apply
   - awaiting approval + no -> reject/discard path
   - ambiguous short reply -> guidance prompt, no loop

### Integration/manual (target project)
Project: `nn7a7t5rmws4shnbz9cb9d4gn980y9z7`

1. Ask for task creation in Hebrew.
2. Verify one proposed changeset is generated.
3. Approve by text (`yes`) and verify apply.
4. Approve/discard from ChangeSetBlock buttons in SDK chat.
5. Approve/discard from right tray.
6. Click Next panel chips and verify no dispatch until send.
7. Send `hi` and verify no heavy pipeline run.

---

## Rollout

1. Ship Phase 0 first (backend correctness).
2. Ship Phase 1 UI in two PR slices:
   - slice A: Next panel
   - slice B: ChangeSets tray
3. Ship Phase 2 performance changes.
4. Ship Phase 3 guardrails/telemetry.
5. Keep optional feature flag for right rail if needed:
   - `ff_sdk_agent_right_rail_v1`

---

## Definition of Done

1. No approval dead loop:
   - text confirmations resolve pending changesets.
2. SDK Agent supports direct ChangeSet apply/discard from:
   - chat block actions
   - right tray actions.
3. Right rail exists and works:
   - Next panel staged interactions
   - ChangeSets grouped tray.
4. Chat remains free-first and fast:
   - no automatic audits
   - no heavy tool chain for greetings/smalltalk.
5. Existing conversation mechanism remains reused; no duplicate conversation system added.
