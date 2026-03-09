# Architecture

## Goal

Expose the Studio SDK agent through one OpenClaw Telegram assistant without modifying the existing app UI.

## Components

- OpenClaw agent
  - owns Telegram conversation handling
  - loads local skills and memory files
- Bridge CLI
  - wraps public Convex SDK functions
  - stores sticky per-session state locally
  - enforces ChangeSet auto-approval policy
- Convex backend
  - remains the system of record for projects, context, runs, questions, ChangeSets, and knowledge

## Runtime flow

1. Telegram message reaches the OpenClaw assistant.
2. The assistant decides whether this is:
   - project selection
   - free chat
   - planning workflow
   - approval response
   - research
3. The assistant calls the bridge.
4. The bridge invokes public Convex SDK queries, mutations, or actions.
5. The bridge updates local session state and returns a normalized payload.
6. The assistant formats the result back into compact Telegram chat.

## Session state

The bridge stores these per session key:

- `activeProjectId`
- `mode`
- `planningStep`
- `pendingChangeSetId`
- `lastQuestionBatch`

The bridge also keeps helper fields for run ids, conversation ids, approval token reuse, and planning question indexes.

## Approval model

- SDK dispatcher can place a run into `awaiting_approval`.
- The bridge then reviews the pending ChangeSet.
- If the ChangeSet is patch-only, review-clean, and low-risk, the bridge can auto-approve.
- Otherwise the assistant must show a short summary and wait for `yes` / `no`.

## Legacy exclusion

This package intentionally avoids old `agent` and `flow-agent` surfaces. It only uses:

- `projects:*`
- `changeSets:*`
- `sdk/api:*`
- `sdk/context:*`
- `sdk/dispatch:*`
- `sdk/projectPlanning:*`
- `sdk/changeset:*`
- `sdk/knowledge:*`
