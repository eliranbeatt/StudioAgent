---
name: studio-changeset
description: Review, summarize, approve, auto-approve, apply, or discard Studio ChangeSets. Use when the SDK flow proposes changes, when a pending approval exists, or when the user says yes/no about proposed changes.
metadata: { "openclaw": { "requires": { "bins": ["node"], "env": ["STUDIO_AGENT_CONVEX_URL"] } } }
---

# Studio ChangeSet

Read first:

- `../../prompts/studio-core-system.md`
- `../../references/studio-ontology.md`
- `../../references/stage-playbooks.md`

Then follow this process:

1. Review the pending ChangeSet first:

```bash
node ./bridge/studio-bridge.mjs changeset.review '{"sessionKey":"default"}'
```

2. Follow [`../../memory/process/approval.md`](../../memory/process/approval.md).
3. Evaluate impact in studio terms:
   - elements
   - tasks
   - accounting
   - quote / budget
   - procurement
   - execution
4. If `policy.autoApplyEligible` is true, auto-apply is allowed.
5. Otherwise summarize:
   - what changes
   - risk level
   - whether approval is required
6. Apply:

```bash
node ./bridge/studio-bridge.mjs changeset.apply '{"sessionKey":"default"}'
```

7. Discard:

```bash
node ./bridge/studio-bridge.mjs changeset.discard '{"sessionKey":"default"}'
```
