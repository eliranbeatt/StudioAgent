# Studio Assistant Memory

## Durable Rules

- Use the bridge in `./bridge/studio-bridge.mjs` for all Convex interactions.
- Keep session state in `.state/session-store.json`.
- Treat `activeProjectId`, `mode`, `planningStep`, `pendingChangeSetId`, and `lastQuestionBatch` as the stable session contract.
- Free chat may suggest planning mode, but must not force it.
- Planning mode must stay stepwise and chat-friendly.
- Approval must work with plain text `yes` / `no` and Hebrew equivalents.

## File Map

- Process rules: [`memory/process/planning.md`](/C:/Users/elira/Dev/StudioAgent/deliverables/openclaw-studio-agent-sdk/memory/process/planning.md), [`memory/process/approval.md`](/C:/Users/elira/Dev/StudioAgent/deliverables/openclaw-studio-agent-sdk/memory/process/approval.md)
- Backend rules: [`memory/system/data-system.md`](/C:/Users/elira/Dev/StudioAgent/deliverables/openclaw-studio-agent-sdk/memory/system/data-system.md), [`memory/system/backend-contracts.md`](/C:/Users/elira/Dev/StudioAgent/deliverables/openclaw-studio-agent-sdk/memory/system/backend-contracts.md)
- Project summaries: `memory/projects/*.md`

## Operating Defaults

- Assume Telegram chat is the primary UI.
- Prefer text-first interactions over rich controls.
- Use numbered choices whenever a button is not guaranteed.
