---
id: SCN-011
title: "Project creation"
type: scenario
status: active
created: 2026-02-24
updated: 2026-02-24
source: "src/app/projects/page.tsx"
tags: [project, creation]
links:
  - rel: describes
    target: "[[WI-006-project-management]]"
---

# Scenario: Project creation

```gherkin
Feature: Project creation

  Scenario: Create a new project with basic details
    Given the user is on the projects list page
    When the user creates a new project with name "Stage Build" and status "active"
    Then a project record is created with default pricing (profit, overhead, risk)
    And the project stage defaults to "IDEATION"
    And the user is redirected to the project overview page
```

## Related

- Describes [[WI-006-project-management]]
