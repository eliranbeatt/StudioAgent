---
id: SCN-007
title: "Web price lookup for material"
type: scenario
status: active
created: 2026-02-24
updated: 2026-02-24
source: "convex/lib/webSearch.ts"
tags: [pricing, web]
links:
  - rel: describes
    target: "[[WI-004-web-price-research]]"
---

# Scenario: Web price lookup for material

```gherkin
Feature: Web price research

  Scenario: Find price for a material via web search
    Given a material line exists for "פלטת PVC 10mm לבן"
    And no catalog price record exists for this variant
    When the SHOPPING_PLANNER_WEB skill is invoked
    Then the agent performs a web search for the material
    And creates a webPriceRun with candidates from multiple sources
    And sets a recommended price with confidence level
    And attaches a materialLinePriceSnapshot to the material line
```

## Related

- Describes [[WI-004-web-price-research]]
