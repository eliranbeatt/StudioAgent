---
id: TERM-001
title: "Studio Agent"
type: term
status: active
created: 2026-02-24
updated: 2026-02-24
source: "repository root"
tags: [product, core]
links:
  - rel: includes feature
    target: "[[WI-001-sdk-agent-orchestrator]]"
  - rel: includes feature
    target: "[[WI-002-flow-agent-autoflow]]"
  - rel: includes feature
    target: "[[WI-003-skill-system]]"
  - rel: includes feature
    target: "[[WI-006-project-management]]"
  - rel: includes feature
    target: "[[WI-007-element-lifecycle]]"
  - rel: includes feature
    target: "[[WI-008-task-management]]"
  - rel: includes feature
    target: "[[WI-009-accounting-budget]]"
  - rel: includes feature
    target: "[[WI-010-quote-generation]]"
  - rel: includes feature
    target: "[[WI-011-receipt-processing]]"
  - rel: includes feature
    target: "[[WI-012-trello-sync]]"
  - rel: includes feature
    target: "[[WI-013-share-links]]"
  - rel: includes feature
    target: "[[WI-014-knowledge-memory]]"
  - rel: includes feature
    target: "[[WI-015-clarification-qa]]"
  - rel: uses
    target: "[[TERM-002-convex]]"
  - rel: uses
    target: "[[TERM-003-nextjs]]"
---

# Studio Agent

Studio Agent is an AI-powered project management and production planning platform built for creative studios (events, set design, fabrication). It combines a Next.js frontend with a Convex real-time backend, and features two AI agent engines — the SDK Agent (chat-driven orchestrator) and the Flow Agent (AutoFlow, a gate-based pipeline) — plus a rich skill system for specialized planning tasks.

The product manages the full lifecycle of studio projects: from initial brain-dump intake through element planning, task breakdown, budget/BOM creation, vendor procurement, quote generation, and install-day runbooks.

## Key Capabilities

- AI-driven project planning with [[WI-001-sdk-agent-orchestrator]] and [[WI-002-flow-agent-autoflow]]
- Modular [[WI-003-skill-system]] for specialized AI tasks
- Full [[WI-006-project-management]] with stages (IDEATION → QUOTE → BREAKDOWN)
- [[WI-007-element-lifecycle]] with draft/version/approval workflow
- [[WI-008-task-management]] with Kanban, Gantt, and work types
- [[WI-009-accounting-budget]] with material lines, work lines, and print parts
- [[WI-010-quote-generation]] from element and cost data
- [[WI-011-receipt-processing]] and vendor reconciliation
- [[WI-012-trello-sync]] for external task board integration
- [[WI-013-share-links]] for client-facing project views
- [[WI-014-knowledge-memory]] for persistent project context
- [[WI-015-clarification-qa]] for structured question/answer flows

## Tech Stack

- Built on [[TERM-003-nextjs]] (App Router) and [[TERM-002-convex]] (real-time backend)
- Uses OpenAI models (GPT-5.2, GPT-5-mini) for AI capabilities
- Tailwind CSS for styling
- TypeScript throughout
