---
id: CON-001
title: "No Automated Test Suite"
type: constraint
status: active
created: 2026-02-24
updated: 2026-02-24
source: "AGENTS.md"
tags: [testing, quality]
links:
  - rel: constrains
    target: "[[TERM-001-studio-agent]]"
---

# Constraint: No Automated Test Suite

## Description
There is no automated test suite in the repo yet. Only `npm run lint` and manual SDK tests (`npm run test:sdk`) exist. Playwright E2E tests are present but minimal.

## Impact
Changes carry higher risk of regressions. Refactors must be done cautiously.

## Resolution Path
Add unit and integration tests close to the code (`__tests__/` directories). The Playwright tests in `playwright/` cover some flow-agent smoke tests.

## Lifted When
Comprehensive test coverage is established across Convex functions and React components.

## Related

- Constrains [[TERM-001-studio-agent]]
