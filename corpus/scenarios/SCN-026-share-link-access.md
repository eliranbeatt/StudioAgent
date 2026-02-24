---
id: SCN-026
title: "Share link access"
type: scenario
status: active
created: 2026-02-24
updated: 2026-02-24
source: "convex/shareLinks.ts"
tags: [share, access]
links:
  - rel: describes
    target: "[[WI-013-share-links]]"
---

# Scenario: Share link access

```gherkin
Feature: Share link viewing

  Scenario: External client accesses a share link
    Given a shareLink exists with a valid token
    And the link has not expired
    When a client visits the share link URL
    Then the system resolves the token to the project and scope
    And displays the appropriate view (quote, summary, or gallery)
    And no authentication is required
```

## Related

- Describes [[WI-013-share-links]]
