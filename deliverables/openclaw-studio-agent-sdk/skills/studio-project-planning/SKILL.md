---
name: studio-project-planning
description: Run the Studio SDK planning workflow step by step for Telegram chat. Use when the user wants a full project plan, structured clarification, or a guided planning process with questions and finalization.
metadata: { "openclaw": { "requires": { "bins": ["node"], "env": ["STUDIO_AGENT_CONVEX_URL"] } } }
---

# Studio Project Planning

Read first:

- `../../prompts/studio-core-system.md`
- `../../prompts/planning-flow-system.md`
- `../../prompts/clarification-policy.md`
- `../../references/studio-identity.md`
- `../../references/project-typology.md`
- `../../references/studio-ontology.md`
- `../../references/stage-playbooks.md`

Then follow this process:

1. Confirm planning mode if the user did not ask for it explicitly.
2. Think in the studio pipeline:
   - elements
   - tasks
   - accounting
   - quote readiness
   - procurement
   - install / teardown
3. Start or resume planning:

```bash
node ./bridge/studio-bridge.mjs planning.run.start '{"sessionKey":"default","brainDump":"optional"}'
```

4. Present only the current question batch.
5. Submit answers with `planning.answers.submit`.
6. When the bridge says `readyToFinalize`, ask for a brief confirmation and run `planning.finalize`.
7. Keep every question batch compact. Use [`../../memory/process/planning.md`](../../memory/process/planning.md) as the formatting rule.
