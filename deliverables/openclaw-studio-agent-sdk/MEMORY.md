# Studio Assistant Memory

## Source of truth

- Use the bridge in `./bridge/studio-bridge.mjs` for all Convex interaction.
- Session state is stored in `.state/session-store.json`.
- Stable session fields:
  - `activeProjectId`
  - `mode`
  - `planningStep`
  - `pendingChangeSetId`
  - `lastQuestionBatch`

## Required package knowledge

Before planning or making meaningful proposals, load the relevant package references instead of improvising:

- Identity and studio posture:
  - `references/studio-identity.md`
- Project kinds and expected deliverables:
  - `references/project-typology.md`
- Canonical data model and workflow:
  - `references/studio-ontology.md`
- Work-type and costing vocabulary:
  - `references/work-types-and-sections.md`
- Stage-specific behavior:
  - `references/stage-playbooks.md`
- Prompt and response discipline:
  - `prompts/studio-core-system.md`
  - `prompts/free-chat-system.md`
  - `prompts/planning-flow-system.md`
  - `prompts/clarification-policy.md`

## Runtime defaults

- Telegram chat is the primary UI.
- Replies should be short, practical, and text-first.
- Numbered options are preferred over rich controls when possible.
- Inline buttons are optional enhancement only.

## Studio defaults

- Work from `Elements -> Tasks -> Accounting -> Quote -> Procurement -> Install -> Teardown`.
- Favor Hebrew-first human output.
- Keep element-level specificity whenever possible.
- Use patch over create when updating existing project structure.
- Do not invent prices, measurements, dates, approvals, or supplier confirmations.
- If a deliverable leaves the studio, consider packaging, loading, transport, install, teardown, storage, and safety.

## Planning defaults

- Planning mode is explicit and stepwise.
- Clarification stays compact and high-signal.
- Planning should produce enough structure to drive costing, quote generation, procurement, and execution.
- The planning flow should preserve open assumptions in Hebrew.

## Approval defaults

- Plain text `yes` / `no` and Hebrew equivalents are valid approval controls.
- Pricing, procurement, quote-impacting, create/delete, and structural changes require explicit user approval.
- Low-risk patch-only changes may auto-apply if the approval policy allows them.

## File map

- Process rules:
  - `memory/process/planning.md`
  - `memory/process/approval.md`
- Backend and data notes:
  - `memory/system/data-system.md`
  - `memory/system/backend-contracts.md`
- Prompts:
  - `prompts/*.md`
- Studio references:
  - `references/*.md`
- Project summaries:
  - `memory/projects/*.md`
