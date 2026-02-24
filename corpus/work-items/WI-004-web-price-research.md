---
id: WI-004
title: "Web Price Research"
type: work-item
item_type: feature
status: active
created: 2026-02-24
updated: 2026-02-24
source: "convex/lib/webSearch.ts"
tags: [ai, procurement, pricing]
links:
  - rel: is part of
    target: "[[TERM-001-studio-agent]]"
  - rel: includes scenario
    target: "[[SCN-007-web-price-lookup]]"
  - rel: includes scenario
    target: "[[SCN-008-price-confidence-ranking]]"
---

# Feature: Web Price Research

The web price research system enables AI agents to find real-world pricing for materials and services. It combines catalog lookups, logged purchase history, and live web search.

## Behavior

- `webPriceRuns` store resolved pricing with candidates, confidence, and assumptions
- `materialLinePriceSnapshots` attach pricing to specific material lines
- Multiple source types: catalog_manual, purchase_actual, web, estimate, override
- Confidence levels: high, medium, low
- Supports multiple currencies (ILS, USD, EUR)
- Skills like SHOPPING_PLANNER_WEB and PRICING_RESEARCH_WEB_BATCH drive the research

## Scenarios

- [[SCN-007-web-price-lookup]]
- [[SCN-008-price-confidence-ranking]]

## Related

- Part of [[TERM-001-studio-agent]]
