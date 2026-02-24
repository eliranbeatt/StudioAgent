---
id: SCN-008
title: "Price confidence ranking"
type: scenario
status: active
created: 2026-02-24
updated: 2026-02-24
source: "convex/schema.ts"
tags: [pricing, confidence]
links:
  - rel: describes
    target: "[[WI-004-web-price-research]]"
---

# Scenario: Price confidence ranking

```gherkin
Feature: Price confidence

  Scenario: Price sources are ranked by confidence
    Given a webPriceRun has candidates from catalog, web, and fallback sources
    When the system evaluates price confidence
    Then catalog prices with recent purchase data get "high" confidence
    And web prices with multiple corroborating sources get "medium" confidence
    And AI-estimated fallback prices get "low" confidence
    And the recommended price uses the highest-confidence candidate
```

## Related

- Describes [[WI-004-web-price-research]]
