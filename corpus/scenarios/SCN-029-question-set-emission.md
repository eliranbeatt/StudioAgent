---
id: SCN-029
title: "Question set emission"
type: scenario
status: active
created: 2026-02-24
updated: 2026-02-24
source: "convex/flow/questionSets.ts"
tags: [qa, clarification]
links:
  - rel: describes
    target: "[[WI-015-clarification-qa]]"
---

# Scenario: Question set emission

```gherkin
Feature: Question emission

  Scenario: Flow agent emits a question set after gate completion
    Given a flow run has just completed gate B
    And there are unanswered questions relevant to gate C
    When the clarification engine evaluates
    Then a flowQuestionSet is created with 3-7 questions
    And each question has a fieldKey, prompt, and priority
    And the question set is emitted to the chat (emittedToChatAt is set)
    And the flow does NOT pause — it continues to the next gate
```

## Related

- Describes [[WI-015-clarification-qa]]
