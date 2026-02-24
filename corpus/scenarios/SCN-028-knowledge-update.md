---
id: SCN-028
title: "Knowledge update from conversation"
type: scenario
status: active
created: 2026-02-24
updated: 2026-02-24
source: "convex/sdk/knowledge.ts"
tags: [knowledge, update]
links:
  - rel: describes
    target: "[[WI-014-knowledge-memory]]"
---

# Scenario: Knowledge update from conversation

```gherkin
Feature: Knowledge updating

  Scenario: Update running knowledge document from new information
    Given a memoryDoc exists with kind "RUNNING_MEMORY"
    And the user provides new project information in chat
    When the knowledge.summarize_or_update tool is called
    Then the memoryDoc's contentMd_he is updated with new facts
    And the AI summary is refreshed
    And the updatedAt timestamp is updated
```

## Related

- Describes [[WI-014-knowledge-memory]]
