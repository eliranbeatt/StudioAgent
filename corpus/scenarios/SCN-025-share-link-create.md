---
id: SCN-025
title: "Share link creation"
type: scenario
status: active
created: 2026-02-24
updated: 2026-02-24
source: "convex/shareLinks.ts"
tags: [share, client]
links:
  - rel: describes
    target: "[[WI-013-share-links]]"
---

# Scenario: Share link creation

```gherkin
Feature: Share links

  Scenario: Create a share link for a quote
    Given a project has a published quoteVersion
    When the user creates a share link with scope "quote"
    Then a shareLink is created with a unique token
    And the link references the quoteVersionId
    And an optional expiresAt can be set
```

## Related

- Describes [[WI-013-share-links]]
