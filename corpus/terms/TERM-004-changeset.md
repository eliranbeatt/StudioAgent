---
id: TERM-004
title: "ChangeSet"
type: term
status: active
created: 2026-02-24
updated: 2026-02-24
source: "convex/changeSets.ts"
tags: [core-concept, data-model, agent]
links:
  - rel: used by
    target: "[[WI-001-sdk-agent-orchestrator]]"
  - rel: used by
    target: "[[WI-002-flow-agent-autoflow]]"
  - rel: used by
    target: "[[WI-003-skill-system]]"
---

# ChangeSet

A ChangeSet is the central mutation artifact in Studio Agent. When an AI agent or skill proposes changes to project data, it emits a ChangeSet containing:

- **ops[]**: An array of operations (create, patch, archive, link)
- **changeGroups[]**: Grouped suggestions with rationale and risk level
- **status**: PROPOSED → APPLIED / PARTIALLY_APPLIED / DISCARDED
- **stage**: Which project stage it targets (IDEATION, QUOTE, BREAKDOWN)
- **scope**: What data domain it affects (tasks, accounting, elements, quote, knowledge, project, multi)

ChangeSets are used by both the [[WI-001-sdk-agent-orchestrator]] and [[WI-002-flow-agent-autoflow]], and are the output contract for many skills in the [[WI-003-skill-system]].

Each ChangeSet application is audited via `auditLogs` and `flowChangeSetApplyLogs`.
