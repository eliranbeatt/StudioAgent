---
id: SCN-012
title: "Project stage transition"
type: scenario
status: active
created: 2026-02-24
updated: 2026-02-24
source: "convex/projectsStage.ts"
tags: [project, workflow]
links:
  - rel: describes
    target: "[[WI-006-project-management]]"
---

# Scenario: Project stage transition

```gherkin
Feature: Project stage transition

  Scenario: Project advances from IDEATION to QUOTE
    Given a project exists with stage "IDEATION"
    And the project has at least one element defined
    When the project stage is updated to "QUOTE"
    Then the project's stage field changes to "QUOTE"
    And AI skills appropriate for QUOTE stage become suggested
    And the flow agent can start QUOTE-phase gates
```

## Related

- Describes [[WI-006-project-management]]
