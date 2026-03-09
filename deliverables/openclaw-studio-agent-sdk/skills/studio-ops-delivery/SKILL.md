---
name: studio-ops-delivery
description: Handle Studio operational asks such as procurement, quote/runbook follow-ups, and execution prep through the SDK free-chat path. Use when the user asks for shopping plans, installation prep, quote changes, or delivery-oriented operational help.
metadata: { "openclaw": { "requires": { "bins": ["node"], "env": ["STUDIO_AGENT_CONVEX_URL"] } } }
---

# Studio Ops Delivery

1. Use free chat as the execution path so the SDK orchestrator can choose the right tools.
2. Keep the user request explicit in the prompt, for example:
   - build a shopping plan
   - update the quote assumptions
   - prepare the installation runbook
3. If the SDK proposes changes, switch to the ChangeSet approval behavior.
