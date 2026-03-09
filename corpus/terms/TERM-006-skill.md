---
id: TERM-006
title: "Skill"
type: term
status: active
created: 2026-02-24
updated: 2026-02-24
source: "convex/skills/registry.ts"
tags: [core-concept, agent, ai]
links:
  - rel: is part of
    target: "[[WI-003-skill-system]]"
---

# Skill

A Skill is a registered AI capability within Studio Agent's [[WI-003-skill-system]]. Each skill encapsulates a specific planning or analysis task with:

- **skillId**: Unique identifier (e.g., `ELEMENTS_BUILDER_FULL`, `SHOPPING_PLANNER_WEB`)
- **category**: planning, tasks, knowledge, review, or shopping
- **flow**: Which project phase it belongs to (ideation, planning, execution, review, optimization)
- **config**: Allowed tools (web search, RAG, file inspect), output contract (blocks, changeset, suggestions)
- **prompts**: System header reference and specific prompt addon
- **model**: Which LLM to use (e.g., gpt-5-mini, gpt-5.2)
- **scheduling**: When to suggest the skill (after which other skills, at which stages)

Skills are run through `skillRuns` and can produce ChangeSets, chat blocks, or suggestions.
