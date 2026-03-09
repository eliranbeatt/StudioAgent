---
name: studio-project-switch
description: Resolve or switch the sticky active Studio project for the current chat session. Use when the user names a project, asks to switch projects, or when no active project is set.
metadata: { "openclaw": { "requires": { "bins": ["node"], "env": ["STUDIO_AGENT_CONVEX_URL"] } } }
---

# Studio Project Switch

1. Search first:

```bash
node ./bridge/studio-bridge.mjs project.search '{"sessionKey":"default","query":"..."}'
```

2. If there is a single confident match, select it:

```bash
node ./bridge/studio-bridge.mjs project.select '{"sessionKey":"default","projectId":"..."}'
```

3. If there are multiple matches, show a numbered list and ask the user to choose one.
4. Never switch projects silently.
