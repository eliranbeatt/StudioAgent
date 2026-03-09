---
id: SCN-030
title: "Answer submission and version tracking"
type: scenario
status: active
created: 2026-02-24
updated: 2026-02-24
source: "convex/flow/answerState.ts"
tags: [qa, answers]
links:
  - rel: describes
    target: "[[WI-015-clarification-qa]]"
---

# Scenario: Answer submission and version tracking

```gherkin
Feature: Answer submission

  Scenario: User submits answers to a question set
    Given a flowQuestionSet exists with 5 questions
    When the user answers 3 of the 5 questions
    Then a flowQuestionSetResponse is created with intent "answer"
    And flowAnswerEvents are created for each answered question
    And the answerVersion is incremented
    And the answers are immediately available in answer state
    And the remaining 2 questions can be answered later or ignored
```

## Related

- Describes [[WI-015-clarification-qa]]
