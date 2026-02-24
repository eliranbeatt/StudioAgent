---
id: SCN-006
title: "Skill recommendation to user"
type: scenario
status: active
created: 2026-02-24
updated: 2026-02-24
source: "convex/skills/recommender.ts"
tags: [skill, ux]
links:
  - rel: describes
    target: "[[WI-003-skill-system]]"
---

# Scenario: Skill recommendation to user

```gherkin
Feature: Skill recommendation

  Scenario: Orchestrator suggests skills based on project state
    Given a project has elements but no tasks
    And the project stage is "QUOTE"
    When the orchestrator evaluates available skills
    Then it suggests TASKS_BUILDER_FULL (suggestAfter: ELEMENTS_BUILDER_FULL)
    And it presents a SuggestionsBlock with the skill description in Hebrew
```

## Related

- Describes [[WI-003-skill-system]]
