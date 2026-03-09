---
id: WI-006
title: "Project Management"
type: work-item
item_type: feature
status: active
created: 2026-02-24
updated: 2026-02-24
source: "src/app/projects/"
tags: [core-feature, management]
links:
  - rel: is part of
    target: "[[TERM-001-studio-agent]]"
  - rel: uses
    target: "[[TERM-008-project-stage]]"
  - rel: includes scenario
    target: "[[SCN-011-project-creation]]"
  - rel: includes scenario
    target: "[[SCN-012-project-stage-transition]]"
---

# Feature: Project Management

Core project management including creation, stage progression, customer linking, and summary generation.

## Behavior

- Projects have statuses: active, archived, lead, production, done, rejected
- Three stages (IDEATION → QUOTE → BREAKDOWN) drive workflow via [[TERM-008-project-stage]]
- Customer linking via `customers` table with contacts
- AI-generated project summaries (with queue/generate/ready/failed status)
- Pricing defaults (profit%, overhead%, risk%) configurable per project
- Brain dump raw text capture for initial ideation
- Project linking for cross-project context sharing
- Project digests for summarized context

## UI Pages

- `/projects` — project list
- `/projects/[id]/overview` — project overview
- `/projects/[id]/sdk-agent` — SDK agent chat
- `/projects/[id]/flow-agent` — Flow agent view
- `/projects/[id]/elements`, `/tasks`, `/accounting`, `/quote`, `/receipts`

## Scenarios

- [[SCN-011-project-creation]]
- [[SCN-012-project-stage-transition]]

## Related

- Part of [[TERM-001-studio-agent]]
- Uses [[TERM-008-project-stage]]
