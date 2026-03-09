---
id: SCN-019
title: "Quote draft generation"
type: scenario
status: active
created: 2026-02-24
updated: 2026-02-24
source: "convex/quotes.ts"
tags: [quote, ai]
links:
  - rel: describes
    target: "[[WI-010-quote-generation]]"
---

# Scenario: Quote draft generation

```gherkin
Feature: Quote generation

  Scenario: Generate a Hebrew quote from project data
    Given a project has approved elements and accounting data
    When the QUOTE_WRITER_FULL skill is invoked
    Then a quoteVersion is created with Hebrew text and sections
    And the quote includes element breakdowns with costs and margins
    And totals are calculated with risk%, overhead%, and profit%
    And the quote is linked to the project and customer
```

## Related

- Describes [[WI-010-quote-generation]]
