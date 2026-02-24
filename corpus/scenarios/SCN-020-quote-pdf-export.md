---
id: SCN-020
title: "Quote PDF export"
type: scenario
status: active
created: 2026-02-24
updated: 2026-02-24
source: "convex/quotePdf.ts"
tags: [quote, export]
links:
  - rel: describes
    target: "[[WI-010-quote-generation]]"
---

# Scenario: Quote PDF export

```gherkin
Feature: Quote PDF

  Scenario: Export a quote version as PDF
    Given a quoteVersion exists with Hebrew content and sections
    When the user exports the quote as PDF
    Then a PDF file is generated and stored in projectFiles
    And the quoteVersion's pdfFileId is updated
    And the PDF is available for sharing via share links
```

## Related

- Describes [[WI-010-quote-generation]]
