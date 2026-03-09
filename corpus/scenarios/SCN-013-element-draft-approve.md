---
id: SCN-013
title: "Element draft and approval"
type: scenario
status: active
created: 2026-02-24
updated: 2026-02-24
source: "convex/drafts.ts"
tags: [element, versioning]
links:
  - rel: describes
    target: "[[WI-007-element-lifecycle]]"
---

# Scenario: Element draft and approval

```gherkin
Feature: Element versioning

  Scenario: Approve an element draft to create a version
    Given an element exists with status "drafting"
    And an elementDraft exists with status "open" and a working snapshot
    When the user approves the draft
    Then an elementVersion is created with status "approved" and the snapshot
    And the element's currentApprovedVersionId is updated
    And the draft status changes to "approved"
    And hasUnapprovedChanges is set to false
```

## Related

- Describes [[WI-007-element-lifecycle]]
