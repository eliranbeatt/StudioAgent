---
id: DEC-005
title: "Hebrew-First UI Language"
type: decision
status: accepted
created: 2026-02-24
updated: 2026-02-24
source: "convex/skills/registry.ts"
expires: null
tags: [ux, localization]
links:
  - rel: constrains
    target: "[[TERM-001-studio-agent]]"
---

# Decision: Hebrew-First UI Language

## Decision
All user-facing content (skill labels, descriptions, question prompts, AI responses) is Hebrew-first. Field names use `_he` suffix convention (e.g., `titleHe`, `summaryHe`, `labelHe`).

## Rationale
The target user base is Israeli creative studios. Hebrew is the primary working language.

## Alternatives Considered
- English-only: rejected (doesn't serve target market)
- Bilingual: deferred (complexity not justified yet)

## Consequences
- All skill prompts must generate Hebrew output
- Schema fields use `_he` suffix for Hebrew strings
- The system prompts include Hebrew variable names (e.g., `workTypeLabelHe`)

## Related

- Constrains [[TERM-001-studio-agent]]
