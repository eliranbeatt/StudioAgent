---
id: WI-015
title: "Clarification QA"
type: work-item
item_type: feature
status: active
created: 2026-02-24
updated: 2026-02-24
source: "convex/flowAnswers.ts"
tags: [ai, interaction, core-feature]
links:
  - rel: is part of
    target: "[[TERM-001-studio-agent]]"
  - rel: includes scenario
    target: "[[SCN-029-question-set-emission]]"
  - rel: includes scenario
    target: "[[SCN-030-answer-submission]]"
---

# Feature: Clarification QA

Structured question-answer system for gathering project information from users.

## Behavior

- **qaPairs** store individual questions with rich typing (text, number, date, single, multi, toggle)
- Scope types: global, project, element, task, section
- Blocking levels: blocker, helpful, optional
- Status progression: open → answered/assumed/resolved/skipped/dismissed
- Suggested answers with labels
- Sources: seed, rebase, manual, chat_parse, clarification, system
- **flowQuestionSets** batch questions for flow agent (3-7 per set, ordered by impact)
- **flowAnswerEvents** track answers with version numbering
- Answer state feeds into gate snapshots for reproducibility

## Scenarios

- [[SCN-029-question-set-emission]]
- [[SCN-030-answer-submission]]

## Related

- Part of [[TERM-001-studio-agent]]
