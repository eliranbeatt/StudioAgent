---
id: SCN-005
title: "Skill run produces a ChangeSet"
type: scenario
status: active
created: 2026-02-24
updated: 2026-02-24
source: "convex/skills/runner.ts"
tags: [skill, changeset]
links:
  - rel: describes
    target: "[[WI-003-skill-system]]"
---

# Scenario: Skill run produces a ChangeSet

```gherkin
Feature: Skill ChangeSet output

  Scenario: ELEMENTS_BUILDER_FULL skill creates element ChangeSets
    Given a project exists with a brain dump and context
    And the ELEMENTS_BUILDER_FULL skill is enabled
    When the skill is invoked with project context
    Then a skillRun is created with status "running"
    And the skill produces a ChangeSet with "create" operations for elements
    And the ChangeSet has scope "elements" and stage matching the project
    And the skillRun transitions to "succeeded"
```

## Related

- Describes [[WI-003-skill-system]]
