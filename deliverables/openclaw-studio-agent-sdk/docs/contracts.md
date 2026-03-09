# Bridge Contracts

Bridge command format:

```bash
node ./bridge/studio-bridge.mjs <operation> '<json-payload>'
```

## Session key

- Pass `sessionKey` on every call when possible.
- If OpenClaw exposes a stable per-chat session id, use that.
- If no session key is available, the bridge falls back to `default`.

## Supported operations

### `project.search`

Input:

```json
{ "sessionKey": "telegram:dm:123", "query": "expo booth", "limit": 5 }
```

### `project.select`

Input:

```json
{ "sessionKey": "telegram:dm:123", "projectId": "abc123" }
```

or

```json
{ "sessionKey": "telegram:dm:123", "query": "expo booth" }
```

### `project.current`

Returns current sticky project and session state.

### `context.get`

Input:

```json
{
  "sessionKey": "telegram:dm:123",
  "packs": ["project", "elements", "tasks", "knowledge", "qa"]
}
```

### `chat.run.start_or_continue`

Input:

```json
{
  "sessionKey": "telegram:dm:123",
  "userText": "update the installation tasks for tomorrow",
  "autoApprove": true
}
```

### `planning.run.start`

Input:

```json
{
  "sessionKey": "telegram:dm:123",
  "brainDump": "optional project brief text",
  "forceNew": false
}
```

### `planning.questions.next`

Input:

```json
{ "sessionKey": "telegram:dm:123" }
```

### `planning.answers.submit`

Input:

```json
{
  "sessionKey": "telegram:dm:123",
  "answers": [
    { "questionId": "qa1", "answer": "כן" },
    { "questionId": "qa2", "answer": "3 days" }
  ],
  "setNotes": "Need fast local sourcing only"
}
```

### `planning.finalize`

Input:

```json
{
  "sessionKey": "telegram:dm:123",
  "planningMode": "separated"
}
```

### `changeset.list_pending`

Lists pending or proposed ChangeSets for the active project.

### `changeset.compile`

Input:

```json
{
  "sessionKey": "telegram:dm:123",
  "intents": [],
  "deterministic": true
}
```

### `changeset.review`

Input:

```json
{
  "sessionKey": "telegram:dm:123",
  "changeSetId": "optional"
}
```

### `changeset.apply`

Input:

```json
{
  "sessionKey": "telegram:dm:123",
  "changeSetId": "optional"
}
```

### `changeset.discard`

Input:

```json
{
  "sessionKey": "telegram:dm:123",
  "changeSetId": "optional"
}
```

### `web.search`

Input:

```json
{
  "query": "PVC board supplier Israel 5mm",
  "maxResults": 5
}
```

### `knowledge.refresh`

Input:

```json
{
  "sessionKey": "telegram:dm:123",
  "newFacts": ["Client approved local fabrication only"],
  "userText": "Use this as durable context"
}
```

## Output notes

- All operations return JSON.
- `chat.run.start_or_continue` includes the latest assistant message when available.
- Planning operations normalize question batches into chat-safe sets.
- ChangeSet review outputs include `risk`, `policy.autoApplyEligible`, and human-readable reasons.
