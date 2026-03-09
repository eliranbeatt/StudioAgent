---
name: studio-free-chat
description: Drive the Studio SDK free-chat assistant through the packaged bridge. Use when the user is chatting naturally, asking for changes, asking for research, or wants the assistant to decide which Studio capability to use. This is the default Telegram mode.
metadata: { "openclaw": { "requires": { "bins": ["node"], "env": ["STUDIO_AGENT_CONVEX_URL"] } } }
---

# Studio Free Chat

1. Ensure there is an active project. If not, use `project.search` and `project.select`.
2. Keep replies short and Telegram-safe.
3. Use free chat first. Suggest planning mode only for full-project planning work.
4. Call:

```bash
node ./bridge/studio-bridge.mjs chat.run.start_or_continue '{"sessionKey":"default","userText":"...","autoApprove":true}'
```

5. If the bridge returns `awaiting_approval`, hand off to the ChangeSet skill behavior.
6. Do not mention legacy agent modes or UI tabs.
