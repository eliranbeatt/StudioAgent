---
id: SCN-027
title: "Memory document creation"
type: scenario
status: active
created: 2026-02-24
updated: 2026-02-24
source: "convex/memory.ts"
tags: [knowledge, memory]
links:
  - rel: describes
    target: "[[WI-014-knowledge-memory]]"
---

# Scenario: Memory document creation

```gherkin
Feature: Knowledge memory

  Scenario: Create a running memory document from chat
    Given a project exists with an active conversation
    When the V3_BUILD_A_MEMORYDOCS skill runs
    Then a memoryDoc is created with kind "RUNNING_MEMORY"
    And the document contains extracted facts and AI summary
    And the memoryDoc is scoped to the project
```

## Related

- Describes [[WI-014-knowledge-memory]]
