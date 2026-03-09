---
id: WI-003
title: "Skill System"
type: work-item
item_type: feature
status: active
created: 2026-02-24
updated: 2026-02-24
source: "convex/skills/"
tags: [agent, ai, modular, core-feature]
links:
  - rel: is part of
    target: "[[TERM-001-studio-agent]]"
  - rel: uses
    target: "[[TERM-006-skill]]"
  - rel: includes scenario
    target: "[[SCN-005-skill-run-changeset]]"
  - rel: includes scenario
    target: "[[SCN-006-skill-recommendation]]"
---

# Feature: Skill System

The Skill System is a modular registry of 30+ AI capabilities that can be invoked by the orchestrator, flow agent, or directly by users. Skills are defined in `convex/skills/registry.ts` with full configuration.

## Behavior

- Skills are registered in `SKILL_CATALOG` with unique IDs, categories, and configurations
- Each skill has a system prompt addon, model assignment, and tool permissions
- Skills produce one of three output contracts: `blocks` (chat), `changeset` (mutations), or `suggestions`
- Skills support scheduling hints (suggestAfter, suggestAtStage)
- `skillRuns` track execution with status, phase, blocks, and usage data
- `clarificationSessions` handle pre-skill clarification loops

## Skill Categories

- **Planning**: ELEMENTS_BUILDER_FULL, TASKS_BUILDER_FULL, ACCOUNTING_BUILDER_FULL, BUILD_PLANNER
- **Tasks**: ELEMENTS_TO_TASKS_SYNC, TASKS_CRITICAL_PATH_POLISH, TASKS_SYNC_FROM_LABOR_LINES
- **Knowledge**: knowledge (orchestrator), CONTEXT_GENERATION, V3_BUILD_A_MEMORYDOCS
- **Review**: GAP_AUDIT, RISK_REVIEW, BOM_DUPLICATE_ANALYZER, FINAL_AUDIT_FIXER
- **Shopping**: SHOPPING_PLANNER_WEB, BUYING_ASSISTANT_WEB, PRICING_LOOKUP_CATALOG_BATCH

## Scenarios

- [[SCN-005-skill-run-changeset]]
- [[SCN-006-skill-recommendation]]

## Related

- Part of [[TERM-001-studio-agent]]
- Uses [[TERM-006-skill]]
