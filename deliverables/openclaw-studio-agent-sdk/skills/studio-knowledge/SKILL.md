---
name: studio-knowledge
description: Refresh durable Studio project knowledge and inspect current project context. Use when the user corrects facts, approves important decisions, or when planning and execution produce durable project information.
metadata: { "openclaw": { "requires": { "bins": ["node"], "env": ["STUDIO_AGENT_CONVEX_URL"] } } }
---

# Studio Knowledge

1. Read current context if needed:

```bash
node ./bridge/studio-bridge.mjs context.get '{"sessionKey":"default","packs":["project","knowledge","qa"]}'
```

2. Refresh durable knowledge when facts changed:

```bash
node ./bridge/studio-bridge.mjs knowledge.refresh '{"sessionKey":"default","newFacts":["..."],"userText":"optional"}'
```

3. Store only durable, reusable facts. Avoid chat noise and one-off wording.
