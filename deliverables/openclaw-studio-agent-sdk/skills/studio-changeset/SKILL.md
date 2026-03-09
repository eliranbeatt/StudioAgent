---
name: studio-changeset
description: Review, summarize, approve, auto-approve, apply, or discard Studio ChangeSets. Use when the SDK flow proposes changes, when a pending approval exists, or when the user says yes/no about proposed changes.
metadata: { "openclaw": { "requires": { "bins": ["node"], "env": ["STUDIO_AGENT_CONVEX_URL"] } } }
---

# Studio ChangeSet

1. Review the pending ChangeSet first:

```bash
node ./bridge/studio-bridge.mjs changeset.review '{"sessionKey":"default"}'
```

2. Follow [`../../memory/process/approval.md`](../../memory/process/approval.md).
3. If `policy.autoApplyEligible` is true, auto-apply is allowed.
4. Otherwise summarize:
   - what changes
   - risk level
   - whether approval is required
5. Apply:

```bash
node ./bridge/studio-bridge.mjs changeset.apply '{"sessionKey":"default"}'
```

6. Discard:

```bash
node ./bridge/studio-bridge.mjs changeset.discard '{"sessionKey":"default"}'
```
