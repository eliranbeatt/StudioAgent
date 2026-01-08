Agent Tab Smoke Test (Manual)

Pre-reqs
- Run Convex dev server.
- Start Next dev server.
- Use a project with at least one element.

1) Conversation setup
- Open `projects/[id]/studio`.
- Confirm a conversation is created and listed.
- Switch stage and mode; verify badge updates and stays after reload.

2) Chat loop
- Send a short Hebrew message.
- Confirm user message appears, then assistant response appears.

3) Clarification block
- Ask for something ambiguous (e.g. "צריך הצעת מחיר").
- If the agent returns a ClarificationBlock, fill and submit.
- Confirm an event message is appended and the agent responds.

4) Suggestion block
- Ask for options (e.g. "תן רעיונות לאלמנטים").
- Select one or more suggestions and submit.
- Confirm an event message and a follow-up assistant response.

5) ChangeSet block
- Ask for a concrete change (e.g. "צור אלמנט X עם משימות").
- If a ChangeSetBlock appears, click Apply.
- Confirm a changeset_applied event and follow-up assistant response.

6) Discard path
- Trigger another ChangeSet.
- Click Discard and confirm changeset_discarded event is appended.
