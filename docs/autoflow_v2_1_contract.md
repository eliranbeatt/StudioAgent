# AutoFlow v2.1 Contract (Non-Negotiable)

Date: 2026-01-31

This document codifies the runtime/product guarantees for AutoFlow v2.1. These rules must hold even as implementation details evolve.

## Two Engines, Always Decoupled
- Flow Engine runs gates to completion without waiting for user input.
- Clarification Engine asks small QuestionSets in chat, collects answers, improves future outputs, and never blocks flow.

## Gate Snapshot Contract
When a gate starts, it snapshots:
- artifactRevisionInId = latest applied artifact revision
- answerVersionUsed = answerVersion at gate start
- answerState snapshot at answerVersionUsed

Rules:
- Inputs do not change mid-run.
- Late answers do not affect that gate run.

## Late Answer Policy (Default)
- Do not auto-rerun completed gates.
- Late answers affect future gates and the optional final Audit/Polish step.

## Gate Output Contract
Each gate produces:
- assumptions[] (explicit if missing data)
- confidence or confidenceNotes
- a ChangeSet with metadata
- applyPolicy (regular gates: auto, audit/polish: manual)
- status transitions tracked (ChangeSet contract)

## ChangeSet Contract (Lifecycle)
Every ChangeSet has:
- ops[]: create | patch | archive | link (etc.)
- summary
- riskLevel
- applyPolicy: auto | manual
- status: proposed | applied | rejected | stale

Every apply attempt is recorded:
- ChangeSetApplyLog: appliedBy, appliedAt, result success|failure, error, artifactRevisionOutId

## QuestionSet UX Constitution
- QuestionSets are event-triggered (no spam): after gate completion/apply, after answer submission (debounced), optional periodic tick if flow is running and no recent questions.
- Each QuestionSet is small (3-7) and ordered by impact.
- Questions map to canonical fieldKeys for machine use.
- Each question includes: questionId, fieldKey, prompt, choices?, priority, whyAsked.
- Users can ignore indefinitely.
- Answer submission updates answerState immediately.
- Flow does not pause and does not ask for permission.

## Debug Visibility (Never Blocking)
Debug shows per node:
- status timeline (queued -> running -> done/failed/stale)
- attempt number
- answerVersionUsed
- artifactRevisionInId -> artifactRevisionOutId
- inputsHash (idempotency key)
- assumptions + confidence
- ChangeSet summary + riskLevel + applyPolicy + status
- apply result (success/failure + error)
- logsRef (prompt/trace/token usage/errors)

Also:
- Provide "download / copy ChangeSet" for troubleshooting.
- Never show blocking modals.

## Audit/Polish Contract
- Only appears after flow completes.
- UI shows two buttons:
  - "Run Audit & Repair" (recommended)
  - "Finish without polish"
- Audit produces a manual ChangeSet (applyPolicy=manual).
- If answers/artifacts change after audit starts, mark audit stale and recommend rerun.
