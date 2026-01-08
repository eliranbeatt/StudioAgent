# Emlly Studio — Agent Tab Dev Plan (Schema-aligned, Convex)
Date: 2026-01-08  
Scope: Implement the **Agent Tab** (“Flowing Assistant”) on top of your existing Convex schema (`schema.ts`).

This tab replaces the bloated multi-skill system with **one continuous chat** that can render:
- structured questions (ClarificationBlock),
- structured suggestions (SuggestionBlock),
- and ChangeSet review (ChangeSetBlock) — all inline inside the chat.

---

## 1) What you already have in schema.ts (confirmed)
Relevant tables exist:
- `projects` (stage optional: IDEATION/QUOTE/BREAKDOWN; pricing defaults; counters)
- `elements` (meta: title/type/status/tags, rev, currentDraftId/currentApprovedVersionId)
- `elementDrafts` (workingSnapshot:any + revisionNumber + status)
- `elementVersions` (snapshot:any approved)
- `tasks`
- `accountingLines` (estimate model lines)
- `printParts`
- `changeSets` (base.rev conflict control + ops[{kind,payload}] + preview_he)
- `conversations` + `conversationMessages` (block:any + changeSetId)

Also exist for “actuals”:
- `projectFiles` (uploads)
- `receipts` (links to projectFiles + purchaseId optional)
- `purchases` (vendorId required)
- `vendors`

---

## 2) Small schema tweaks (additive, no backfills)
### 2.1 Conversation mode persistence (recommended)
Your `conversations` table has `stage` but no `mode`.
Add:
- `mode?: "CHAT"|"QUESTIONS"|"SUGGESTIONS"` (optional)

Why: mode should persist per conversation.

### 2.2 Rev discipline (must be consistent)
You already have `elements.rev` optional.
Rule: **Every time the current draft snapshot changes, increment elements.rev**.
This keeps conflict control simple (ChangeSet.base only needs elementId+rev).

Implementation: in `applyChangeSet`, whenever you patch a draft snapshot for element X:
- patch `elements` doc: `rev = (rev ?? 0) + 1`, `updatedAt = now`, `hasUnapprovedChanges = true`

---

## 3) UX spec — Agent Tab (single window)
### 3.1 Header
- Stage selector: IDEATION / QUOTE / BREAKDOWN
- Mode selector: CHAT / QUESTIONS / SUGGESTIONS
- (Optional) “Prompt pack version” indicator

### 3.2 3-column body
Left: Conversations
- list by projectId, status=active
- create new conversation

Center: Chat
- virtualized message thread
- composer input
- inline blocks renderer:
  - ClarificationBlockForm
  - SuggestionBlockPicker
  - ChangeSetReviewCard

Right: Elements inspector
- Approved elements list (elements.status != drafting OR has currentApprovedVersionId)
- Draft elements list (status=drafting)
- selected element shows workingSnapshot (load from elementDrafts via elements.currentDraftId)

---

## 4) Frontend state machine (“flowing assistant”)
States:
- IDLE
- SENDING_USER_MESSAGE
- WAITING_AGENT
- WAITING_BLOCK_SUBMIT (clarification/suggestion)
- WAITING_CHANGESET_DECISION (apply/discard)
- ERROR

Transitions:
1) user sends text → appendUserMessage → agentRespond → WAITING_AGENT
2) assistant returns block:
   - clarification/suggestion → WAITING_BLOCK_SUBMIT
   - changeset → WAITING_CHANGESET_DECISION
3) submit block → appendEventMessage → agentRespond
4) apply/discard changeset → mutation → appendEventMessage → agentRespond (optional auto-follow-up)

---

## 5) Backend API (Convex) — minimal surface
### 5.1 Queries
- listConversations(projectId)
- getConversationMessages(conversationId, limit)
- getProjectStage(projectId)
- getElementList(projectId)  // elements meta only
- getElementDraftByElementId(elementId) // via elements.currentDraftId
- getRecentElements(projectId, limit)

### 5.2 Mutations
- createConversation(projectId, title_he?, stage?, mode?)
- setConversationStage(conversationId, stage) + optionally set projects.stage
- setConversationMode(conversationId, mode)
- appendUserMessage(conversationId, text_he)
- appendEventMessage(conversationId, eventType, eventPayload)
- createChangeSet(projectId, stage, reason_he, base, ops, preview_he)
- discardChangeSet(changeSetId)
- applyChangeSet(changeSetId)  // atomic multi-table apply (you already planned)

### 5.3 Action
- agentRespond(conversationId, uiContext)
  - Reads last N messages
  - Reads project stage/mode
  - Loads selected elements + current drafts (thin summaries unless needed)
  - Builds prompt = System + Developer + Stage module + Mode nudge + Context JSON
  - Calls LLM
  - Validates JSON envelope (Zod)
  - If ChangeSetBlock.proposedChangeSet present → persist into `changeSets` and link `changeSetId`
  - Writes assistant message into `conversationMessages`

---

## 6) Context builder (prevents prompt bloat)
Always include:
- project: name, stage, pricingDefaults/defaults, event date/location if exists
- conversation: last ~20 messages, plus last 3 events summarized
- selectedElementIds (from UI)
- elements summaries:
  - selected elements: title/type/status/tags + workingSnapshot (thin)
  - 5 recently updated elements: title/type/status only

Load on demand:
- if user asks for tasks → load tasks by element
- if user asks cost breakdown → load accountingLines by element
- if user asks print → load printParts by element

---

## 7) ChangeSet op design (aligned to schema.ts)
Your `changeSets.ops[]` is { kind, payload:any }.
Standardize V1 kinds:
- element.create
- element.patch (includes draftPatch merge)
- task.create
- accountingLine.create
- printPart.create
- vendor.create (optional)
- purchase.create (optional)
- receipt.attach (optional)

See the prompt pack for exact payload shapes.

### 7.1 Apply ordering inside applyChangeSet
1) element.create → creates elements + elementDrafts + sets elements.currentDraftId
2) vendor.create
3) printPart.create
4) task.create (resolve element temp ids; resolve dependency temp ids)
5) accountingLine.create
6) purchase.create
7) receipt.attach
8) element.patch (including draftPatch merge) + bump rev

All in ONE mutation.

---

## 8) Validation rules (server-side in applyChangeSet)
- element.create: title required; type must be one of schema enums; tags array exists
- element.patch: reject if ChangeSet.base rev mismatches current elements.rev
- task.create: title required; estimatedMinutes 30–360 recommended; clamp or warn
- accountingLine.create: type + title + total required; total >= 0 (allow negative only if you want credits)
- printPart.create: label + qty required
- purchase.create: vendorId required (resolve from vendor.create temp map); totalAmount required
- receipt.attach: projectFiles id must exist

If any validation fails: throw → atomic rollback.

---

## 9) UI block handling (events)
When user submits a block:
- write an `event` message into `conversationMessages` with structured payload
- call `agentRespond` (the assistant will continue flow)

Event payloads:
- clarification_submitted: { answersById: {...} }
- suggestions_selected: { selectedIds: [...], note_he?: string }
- changeset_applied: { changeSetId }
- changeset_discarded: { changeSetId }

---

## 10) Implementation phases (fast + safe)
### Phase A — Tab shell + data
- Build Agent Tab layout
- list conversations / messages
- stage & mode selector (mode may be client-only until schema adds it)

### Phase B — Blocks renderer
- Render ClarificationBlockForm + SuggestionBlockPicker + ChangeSetReviewCard
- Submit writes event messages

### Phase C — ChangeSet wiring
- Create changeset record
- Apply/discard via mutations
- After apply, reload element lists + selected draft

### Phase D — LLM loop
- Implement agentRespond action
- Zod validation + safe fallback
- Persist assistant message + optional changeset creation

### Phase E — Hardening
- Conflict UI (rev mismatch)
- Safety-critical warnings
- “Regenerate” button
- Observability logs: model, promptVersion, latency, validation failures

---

## 11) Test plan (must-have)
### Unit (applyChangeSet)
- tempId mapping works (element.create then task.create referencing temp)
- dependency temp ids resolve
- conflict detection blocks apply
- invalid op payload blocks apply

### Integration (Agent Tab)
- chat → clarification block → submit → suggestion block → submit → changeset → apply
- stage switching changes assistant behavior
- reload persistence: conversation and messages remain

---

## 12) Prompt pack to use
Use: `EmllyStudio_AgentPrompts_schemaAligned_v1.md`
(keep promptVersion in assistant messages for debugging).
