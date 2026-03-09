---
id: WI-010
title: "Quote Generation"
type: work-item
item_type: feature
status: active
created: 2026-02-24
updated: 2026-02-24
source: "convex/quotes.ts"
tags: [core-feature, client-facing]
links:
  - rel: is part of
    target: "[[TERM-001-studio-agent]]"
  - rel: includes scenario
    target: "[[SCN-019-quote-draft-generation]]"
  - rel: includes scenario
    target: "[[SCN-020-quote-pdf-export]]"
---

# Feature: Quote Generation

Generate client-facing quotes from project data including elements, cost data, and margins.

## Behavior

- `quoteVersions` store immutable quote snapshots with sections and totals
- Configurable margins: risk%, overhead%, profit%
- Multiple display modes: by section or by element
- Hebrew quote text generation via AI
- Quote blocks with structured content
- PDF generation and file storage
- Supports terms, dates, agreements, and options sections
- Previous quote linking for versioning
- Customer name and logo customization

## Scenarios

- [[SCN-019-quote-draft-generation]]
- [[SCN-020-quote-pdf-export]]

## Related

- Part of [[TERM-001-studio-agent]]
