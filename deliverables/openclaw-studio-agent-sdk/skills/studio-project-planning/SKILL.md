---
name: studio-project-planning
description: Run the Studio SDK planning workflow step by step for Telegram chat. Use when the user wants a full project plan, structured clarification, or a guided planning process with questions and finalization.
metadata: { "openclaw": { "requires": { "bins": ["node"], "env": ["STUDIO_AGENT_CONVEX_URL"] } } }
---

# Studio Project Planning

1. Confirm planning mode if the user did not ask for it explicitly.
2. Start or resume planning:

```bash
node ./bridge/studio-bridge.mjs planning.run.start '{"sessionKey":"default","brainDump":"optional"}'
```

3. Present only the current question batch.
4. Submit answers with `planning.answers.submit`.
5. When the bridge says `readyToFinalize`, ask for a brief confirmation and run `planning.finalize`.
6. Keep every question batch compact. Use [`../../memory/process/planning.md`](../../memory/process/planning.md) as the formatting rule.
