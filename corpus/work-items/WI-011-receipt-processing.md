---
id: WI-011
title: "Receipt Processing"
type: work-item
item_type: feature
status: active
created: 2026-02-24
updated: 2026-02-24
source: "convex/receipts.ts"
tags: [financial, reconciliation]
links:
  - rel: is part of
    target: "[[TERM-001-studio-agent]]"
  - rel: includes scenario
    target: "[[SCN-021-receipt-upload-extract]]"
  - rel: includes scenario
    target: "[[SCN-022-receipt-line-mapping]]"
---

# Feature: Receipt Processing

Upload, parse, and reconcile receipts against planned budget items.

## Behavior

- Receipts link to projects, vendors, and purchase records
- Status flow: uploaded → extracted → reviewed → approved
- AI extraction of receipt data (vendor, items, totals)
- Receipt items map to material lines, work lines, tasks, or elements
- Supports actual vs. planned cost tracking
- Multiple file attachments per receipt

## Scenarios

- [[SCN-021-receipt-upload-extract]]
- [[SCN-022-receipt-line-mapping]]

## Related

- Part of [[TERM-001-studio-agent]]
