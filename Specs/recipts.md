# Receipt Ingestion Agent Spec

## Purpose

This spec defines a standalone manual ingestion system for studio receipts, invoices, and bills.

It is not part of the Studio app.

It is a local, file-based workflow operated by an AI coding agent, optimized first for Gemini CLI.

The goal is to turn a folder of source files into a trustworthy local expense ledger that can later be used for budgeting, reporting, planning, and supplier analysis.

## Core Principles

- Manual ingestion only. No background automation service.
- File-system first. The database is local files, not Convex, not the Studio app.
- Agent-driven. The operator runs Gemini CLI and gives it a fixed prompt pack.
- Evidence only. The agent extracts what is visible and does not invent hidden values.
- Restart-safe. The workflow can be stopped and resumed without corrupting the ledger.
- Audit-safe. Every accepted record keeps its source file path, raw extraction, confidence, and review history.

## Scope

### In scope

- Batch processing of a local folder of images and PDFs
- Receipt, invoice, and bill extraction
- Structured JSON outputs per document
- Append-only JSONL ledger files
- Duplicate detection
- Confidence scoring
- Flag-based review flow
- Supplier normalization
- Fixed expense-category mapping
- Operator instructions for Gemini CLI
- Prompt files for batch ingest, extraction, and review

### Out of scope for v1

- Direct integration with the Studio app
- Convex, database server, or cloud storage
- Live OCR service orchestration beyond what Gemini CLI can inspect
- Automatic bookkeeping export to third-party accounting tools
- Auto-sync to spreadsheets or BI tools
- Auto-linking to project accounting lines in the Studio app

## Operator Model

The operator places new files into a local `inbox/` folder and starts Gemini CLI in the ingestion workspace.

Gemini CLI receives a batch prompt that tells it to:

1. Enumerate all files in `inbox/`
2. Process each file one by one
3. Create or update structured artifacts
4. Append records to the ledgers
5. Move each file into exactly one terminal folder:
   - `accepted/`
   - `flagged/`
   - `rejected/`

The operator then reviews only the flagged files.

## Recommended Workspace

Use a separate repo or local folder, for example:

```text
receipt_ingestion/
  inbox/
  working/
  accepted/
  flagged/
  rejected/
  documents/
  ledger/
  prompts/
  schemas/
  instructions/
  runs/
```

### Folder meanings

- `inbox/`: New files waiting to be processed
- `working/`: Temporary holding area while the current run is active
- `accepted/`: Files successfully ingested into the final ledger
- `flagged/`: Files needing manual review before acceptance
- `rejected/`: Files that are not valid expense documents or are unreadable
- `documents/`: Structured JSON artifacts for each source file
- `ledger/`: Append-only JSONL data files and shared dictionaries
- `prompts/`: Prompt pack used by Gemini CLI
- `schemas/`: JSON schemas and field definitions
- `instructions/`: Short runbooks for the human operator
- `runs/`: Per-run manifests, logs, and summaries

## Required Files

### Prompt files

- `prompts/system.md`
- `prompts/batch_ingest.md`
- `prompts/classify_extract.md`
- `prompts/review_flagged.md`
- `prompts/category_map.md`

### Ledger files

- `ledger/expenses.jsonl`
- `ledger/expense_line_items.jsonl`
- `ledger/review_queue.jsonl`
- `ledger/suppliers.jsonl`
- `ledger/category_dictionary.json`

### Per-document artifacts

For each source file `supplier_2026_03_12_001.jpg`, create:

- `documents/supplier_2026_03_12_001.document.json`
- `documents/supplier_2026_03_12_001.lines.json`
- `documents/supplier_2026_03_12_001.review.json`
- `documents/supplier_2026_03_12_001.raw_response.json`

### Per-run artifacts

For each batch run:

- `runs/<run_id>/manifest.json`
- `runs/<run_id>/run_summary.jsonl`
- `runs/<run_id>/operator_notes.md`

## Processing States

Each file must end in exactly one of these states:

- `accepted`
- `flagged`
- `rejected`

Each record must also have a review state:

- `accepted`
- `flagged`
- `rejected`
- `corrected_after_review`

## Supported Inputs

### File types

- `.jpg`
- `.jpeg`
- `.png`
- `.webp`
- `.pdf`

### Document types

- `receipt`
- `invoice`
- `bill`

If the document is not clearly one of these, it should be marked `non_expense_document` and rejected.

## Extraction Rules

### Hard rules

- Never invent a supplier name, date, quantity, or amount
- Never invent missing line items
- Never fill unknown values with placeholders other than `null`
- Preserve raw observed text separately from normalized values
- Use English ASCII keys only
- Use ISO date format `YYYY-MM-DD` when the full date is visible
- If the year or day is uncertain, keep the raw text and set the normalized date to `null`
- Only derive a line total when quantity and unit price are clearly visible
- Only derive a unit price when quantity and total are clearly visible
- If arithmetic does not reconcile, add `total_mismatch`
- If multiple receipts appear in one image, add `multiple_documents`
- If handwriting materially affects readability, add `handwritten`
- If image quality materially affects readability, add `image_blurry`

### Normalization rules

- Keep `supplierNameRaw` exactly as seen
- Create `supplierNameNormalized` by trimming, collapsing whitespace, and normalizing obvious punctuation variation
- Keep `unitRaw` exactly as seen
- Map `unitNormalized` only when the meaning is clear
- Supported normalized units:
  - `ea`
  - `sheet`
  - `m`
  - `m2`
  - `sqm`
  - `m3`
  - `kg`
  - `g`
  - `l`
  - `ml`
  - `pack`
  - `box`
  - `roll`
  - `set`
  - `job`
  - `hour`
- Currency should be normalized to:
  - `ILS`
  - `USD`
  - `EUR`
- If the visible currency is ambiguous, set `currency` to `null` and add `currency_uncertain`

## Confidence Model

Each document must have:

- `confidenceScore`: number from `0` to `1`
- `confidenceLevel`: `high | medium | low`

Suggested interpretation:

- `high`: supplier, date, and total are clear; arithmetic mostly reconciles; little or no ambiguity
- `medium`: the main fields are usable but one or more fields need caution
- `low`: key information is incomplete, conflicting, blurry, or hard to trust

Each line item may also have its own confidence score.

## Flags

The system should use these flags exactly:

- `supplier_uncertain`
- `date_uncertain`
- `currency_uncertain`
- `total_mismatch`
- `line_items_partial`
- `image_blurry`
- `handwritten`
- `multiple_documents`
- `duplicate_candidate`
- `non_expense_document`
- `unreadable_document`
- `payment_details_uncertain`
- `tax_uncertain`
- `category_uncertain`

## Category Dictionary

Use a fixed v1 category set.

Store it in `ledger/category_dictionary.json`.

```json
{
  "version": 1,
  "categories": [
    "wood_sheet_goods",
    "hardware_fasteners",
    "paint_finishes",
    "printing_graphics",
    "fabric_textiles",
    "foam_plastics",
    "metal_materials",
    "glass_acrylic",
    "electrical_lighting",
    "rental_equipment",
    "transport_delivery",
    "labor_external",
    "tools_consumables",
    "office_admin",
    "food_hospitality",
    "cleaning_maintenance",
    "software_services",
    "misc_uncategorized"
  ]
}
```

### Category assignment rule

- Assign one `categoryPrimary` at the document level
- Assign `categoryPrimary` and optional `categorySecondary` at the line-item level when possible
- If no category is reliable, use `misc_uncategorized` and add `category_uncertain`

## Ledger Contracts

### `ledger/expenses.jsonl`

One JSON object per accepted or flagged document.

Required fields:

```json
{
  "recordId": "exp_2026_03_15_0001",
  "sourceFileName": "supplier_2026_03_12_001.jpg",
  "sourceRelativePath": "accepted/supplier_2026_03_12_001.jpg",
  "fileSha256": "hex_string",
  "ingestionRunId": "run_2026_03_15_001",
  "documentType": "receipt",
  "reviewStatus": "accepted",
  "confidenceScore": 0.94,
  "confidenceLevel": "high",
  "flags": [],
  "languageHint": "he",
  "supplierNameRaw": "Raw supplier name",
  "supplierNameNormalized": "raw supplier name",
  "supplierTaxId": null,
  "documentNumber": null,
  "issueDateRaw": "12/03/26",
  "issueDate": "2026-03-12",
  "dueDateRaw": null,
  "dueDate": null,
  "currencyRaw": "NIS",
  "currency": "ILS",
  "subtotal": 100.0,
  "taxAmount": 17.0,
  "discountAmount": 0.0,
  "shippingAmount": 0.0,
  "totalAmount": 117.0,
  "paymentMethod": "card",
  "paymentReference": null,
  "categoryPrimary": "hardware_fasteners",
  "categorySecondary": null,
  "notes": null,
  "lineItemCount": 3,
  "ocrTextPath": "documents/supplier_2026_03_12_001.document.json",
  "rawResponsePath": "documents/supplier_2026_03_12_001.raw_response.json",
  "documentJsonPath": "documents/supplier_2026_03_12_001.document.json",
  "linesJsonPath": "documents/supplier_2026_03_12_001.lines.json",
  "reviewJsonPath": "documents/supplier_2026_03_12_001.review.json",
  "createdAt": "2026-03-15T10:00:00Z",
  "updatedAt": "2026-03-15T10:00:00Z"
}
```

### `ledger/expense_line_items.jsonl`

One JSON object per extracted line item.

```json
{
  "lineItemId": "line_2026_03_15_0001_01",
  "recordId": "exp_2026_03_15_0001",
  "lineIndex": 1,
  "descriptionRaw": "RAW ITEM TEXT",
  "descriptionNormalized": "raw item text",
  "sku": null,
  "unitRaw": "pcs",
  "unitNormalized": "ea",
  "quantity": 2,
  "unitPrice": 15.5,
  "lineSubtotal": 31.0,
  "taxRate": null,
  "taxAmount": null,
  "lineTotal": 31.0,
  "categoryPrimary": "hardware_fasteners",
  "categorySecondary": null,
  "confidenceScore": 0.9,
  "confidenceLevel": "high",
  "flags": [],
  "createdAt": "2026-03-15T10:00:00Z",
  "updatedAt": "2026-03-15T10:00:00Z"
}
```

### `ledger/review_queue.jsonl`

One JSON object per flagged document.

```json
{
  "reviewId": "rev_2026_03_15_0003",
  "recordId": "exp_2026_03_15_0003",
  "sourceFileName": "blurry_invoice_07.png",
  "reasonSummary": "Supplier and total are visible but date is unclear and tax does not reconcile",
  "blockingFlags": ["date_uncertain", "total_mismatch", "image_blurry"],
  "recommendedAction": "manual_review",
  "status": "open",
  "createdAt": "2026-03-15T10:05:00Z",
  "updatedAt": "2026-03-15T10:05:00Z"
}
```

### `ledger/suppliers.jsonl`

Deduplicated supplier reference file.

```json
{
  "supplierId": "sup_0001",
  "canonicalName": "supplier ltd",
  "displayName": "Supplier Ltd",
  "aliases": ["supplier", "supplier limited"],
  "taxId": null,
  "phone": null,
  "email": null,
  "notes": null,
  "createdAt": "2026-03-15T10:00:00Z",
  "updatedAt": "2026-03-15T10:00:00Z"
}
```

## Per-Document JSON Contracts

### `documents/<stem>.document.json`

Use this file for the normalized header-level extraction.

```json
{
  "recordId": "exp_2026_03_15_0001",
  "sourceFileName": "supplier_2026_03_12_001.jpg",
  "documentType": "receipt",
  "classificationReason": "Printed point-of-sale receipt with supplier header, dated transaction, and itemized lines",
  "supplierNameRaw": "Supplier Ltd",
  "supplierNameNormalized": "supplier ltd",
  "supplierTaxId": null,
  "documentNumber": null,
  "issueDateRaw": "12/03/26",
  "issueDate": "2026-03-12",
  "dueDateRaw": null,
  "dueDate": null,
  "currencyRaw": "NIS",
  "currency": "ILS",
  "subtotal": 100.0,
  "taxAmount": 17.0,
  "discountAmount": 0.0,
  "shippingAmount": 0.0,
  "totalAmount": 117.0,
  "paymentMethod": "card",
  "paymentReference": null,
  "categoryPrimary": "hardware_fasteners",
  "categorySecondary": null,
  "languageHint": "he",
  "confidenceScore": 0.94,
  "confidenceLevel": "high",
  "flags": [],
  "notes": null
}
```

### `documents/<stem>.lines.json`

```json
{
  "recordId": "exp_2026_03_15_0001",
  "lineItems": [
    {
      "lineIndex": 1,
      "descriptionRaw": "ITEM 1",
      "descriptionNormalized": "item 1",
      "sku": null,
      "unitRaw": "pcs",
      "unitNormalized": "ea",
      "quantity": 2,
      "unitPrice": 15.5,
      "lineSubtotal": 31.0,
      "taxRate": null,
      "taxAmount": null,
      "lineTotal": 31.0,
      "categoryPrimary": "hardware_fasteners",
      "categorySecondary": null,
      "confidenceScore": 0.9,
      "confidenceLevel": "high",
      "flags": []
    }
  ]
}
```

### `documents/<stem>.review.json`

```json
{
  "recordId": "exp_2026_03_15_0001",
  "reviewStatus": "accepted",
  "reviewRequired": false,
  "reviewReasons": [],
  "operatorNotes": null,
  "corrections": [],
  "createdAt": "2026-03-15T10:00:00Z",
  "updatedAt": "2026-03-15T10:00:00Z"
}
```

### `documents/<stem>.raw_response.json`

Store the model's raw structured response before any local cleanup.

This file is required for auditability.

## Duplicate Detection

### Primary duplicate rule

If the SHA-256 hash already exists in `ledger/expenses.jsonl`, do not ingest the file again.

Move it to `rejected/` or a separate duplicate area if desired, and add a run summary entry explaining that it was skipped as an exact duplicate.

### Secondary duplicate-candidate rule

If the hash is different but all of these are true:

- normalized supplier matches
- issue date matches
- total amount matches

then mark `duplicate_candidate` and route the file to `flagged/`.

## Acceptance Logic

### Auto-accept

A document may be auto-accepted only if:

- document type is supported
- supplier is reasonably clear
- date is reasonably clear
- total amount is reasonably clear
- confidence level is `high` or strong `medium`
- there are no blocking flags such as:
  - `multiple_documents`
  - `non_expense_document`
  - `unreadable_document`
  - `total_mismatch`

### Flag for review

Flag the document if:

- date is uncertain
- currency is uncertain
- totals do not reconcile
- image quality is poor
- document contains multiple receipts
- supplier mapping is ambiguous
- category assignment is weak
- duplicate candidate is suspected

### Reject

Reject the document if:

- it is not a receipt, invoice, or bill
- it is unreadable
- it is an exact duplicate
- it is not an expense document at all

## Run Manifest

Each run should create `runs/<run_id>/manifest.json`.

Example:

```json
{
  "runId": "run_2026_03_15_001",
  "startedAt": "2026-03-15T10:00:00Z",
  "completedAt": null,
  "operator": "manual",
  "agent": "gemini-cli",
  "sourceFolder": "inbox",
  "status": "running",
  "counts": {
    "discovered": 0,
    "processed": 0,
    "accepted": 0,
    "flagged": 0,
    "rejected": 0,
    "duplicatesSkipped": 0
  }
}
```

## Run Summary Log

Append one line per file to `runs/<run_id>/run_summary.jsonl`.

Example:

```json
{
  "runId": "run_2026_03_15_001",
  "sourceFileName": "supplier_2026_03_12_001.jpg",
  "recordId": "exp_2026_03_15_0001",
  "outcome": "accepted",
  "reason": "High-confidence receipt with reconciled totals",
  "flags": [],
  "createdAt": "2026-03-15T10:01:30Z"
}
```

## Prompt Pack

The following prompt contents should be stored as files and reused as-is unless deliberately revised.

## `prompts/system.md`

```md
You are a local expense-ingestion agent operating inside a file-based bookkeeping workspace.

Your job is to process receipt, invoice, and bill images or PDFs from the inbox folder and convert them into a trustworthy structured ledger.

Rules:
- Work one file at a time.
- Do not skip files silently.
- Do not invent missing information.
- Use only visible evidence from the source file.
- Keep raw values and normalized values separate.
- Use JSON only when writing structured artifacts.
- Use English ASCII keys only.
- Use null for unknown values.
- Persist output after each file.
- Never overwrite prior accepted ledger entries.
- Append to JSONL ledgers only.
- Every file must end in exactly one state: accepted, flagged, or rejected.
- If confidence is weak or evidence conflicts, flag the file instead of pretending certainty.
- Always preserve the raw model response in documents/<stem>.raw_response.json.
- Always write a per-file review artifact in documents/<stem>.review.json.
- Always write a per-file run entry in runs/<run_id>/run_summary.jsonl.

Document types allowed:
- receipt
- invoice
- bill

If a file is not clearly one of those, mark it as non_expense_document and reject it.

Blocking flags:
- multiple_documents
- non_expense_document
- unreadable_document
- total_mismatch

Important:
- The local ledger is the source of truth.
- This workflow is independent of any app or external database.
```

## `prompts/batch_ingest.md`

```md
Process the local receipt-ingestion workspace as a batch run.

Steps:
1. Create a new run id using the current date plus a sequence number.
2. Create runs/<run_id>/manifest.json if it does not exist.
3. Enumerate all supported files in inbox/.
4. For each file:
   - compute or record a stable SHA-256 hash
   - check ledger/expenses.jsonl for an exact duplicate hash
   - if exact duplicate, log it and move the file to rejected/ or duplicate handling state
   - otherwise analyze the file using the classify_extract prompt contract
   - write:
     - documents/<stem>.document.json
     - documents/<stem>.lines.json
     - documents/<stem>.review.json
     - documents/<stem>.raw_response.json
   - append ledger rows as appropriate
   - move the file to accepted/, flagged/, or rejected/
   - append a run summary row immediately
   - update the run manifest counters
5. When all files are processed, mark the run manifest as completed.

Constraints:
- Persist after each file.
- Do not batch all writes at the end.
- Do not drop fields from the schema.
- If a file is ambiguous, flag it.
- If a file is not an expense document, reject it.
- If a file contains multiple receipts, flag it.
```

## `prompts/classify_extract.md`

```md
Open one source file and return structured extraction data.

You must inspect the file as a receipt, invoice, or bill classifier and extractor.

Return one JSON object only with this schema:

{
  "documentType": "receipt" | "invoice" | "bill" | null,
  "classificationReason": string,
  "supplierNameRaw": string | null,
  "supplierNameNormalized": string | null,
  "supplierTaxId": string | null,
  "documentNumber": string | null,
  "issueDateRaw": string | null,
  "issueDate": string | null,
  "dueDateRaw": string | null,
  "dueDate": string | null,
  "currencyRaw": string | null,
  "currency": "ILS" | "USD" | "EUR" | null,
  "subtotal": number | null,
  "taxAmount": number | null,
  "discountAmount": number | null,
  "shippingAmount": number | null,
  "totalAmount": number | null,
  "paymentMethod": string | null,
  "paymentReference": string | null,
  "categoryPrimary": string | null,
  "categorySecondary": string | null,
  "languageHint": string | null,
  "confidenceScore": number,
  "confidenceLevel": "high" | "medium" | "low",
  "flags": string[],
  "notes": string | null,
  "lineItems": [
    {
      "lineIndex": number,
      "descriptionRaw": string,
      "descriptionNormalized": string | null,
      "sku": string | null,
      "unitRaw": string | null,
      "unitNormalized": string | null,
      "quantity": number | null,
      "unitPrice": number | null,
      "lineSubtotal": number | null,
      "taxRate": number | null,
      "taxAmount": number | null,
      "lineTotal": number | null,
      "categoryPrimary": string | null,
      "categorySecondary": string | null,
      "confidenceScore": number,
      "confidenceLevel": "high" | "medium" | "low",
      "flags": string[]
    }
  ]
}

Rules:
- Use only visible evidence.
- Use null for unknown values.
- Keep raw text exact where possible.
- Use ISO YYYY-MM-DD only when the date is fully readable.
- If totals conflict, add total_mismatch.
- If the image contains more than one expense document, add multiple_documents.
- If the document is not a receipt, invoice, or bill, set documentType to null and add non_expense_document.
- Do not output markdown.
- Do not explain outside the JSON object.
```

## `prompts/review_flagged.md`

```md
Review one flagged expense document.

Inputs:
- source file
- documents/<stem>.document.json
- documents/<stem>.lines.json
- documents/<stem>.review.json
- documents/<stem>.raw_response.json

Tasks:
1. Reopen the source file.
2. Compare the prior extraction to the visible evidence.
3. Correct only fields that can now be made more reliable.
4. Preserve audit history by keeping prior raw response artifacts.
5. Update documents/<stem>.document.json, documents/<stem>.lines.json, and documents/<stem>.review.json.
6. If the file is now acceptable, append or update the final ledger state and move the file from flagged/ to accepted/.
7. If it is still too uncertain, keep it flagged and explain why in review.json.

Never delete the raw response file.
Never hide prior uncertainty.
Always keep a correction note in review.json.
```

## `prompts/category_map.md`

```md
Assign normalized expense categories to the extracted document and its line items.

Allowed categories:
- wood_sheet_goods
- hardware_fasteners
- paint_finishes
- printing_graphics
- fabric_textiles
- foam_plastics
- metal_materials
- glass_acrylic
- electrical_lighting
- rental_equipment
- transport_delivery
- labor_external
- tools_consumables
- office_admin
- food_hospitality
- cleaning_maintenance
- software_services
- misc_uncategorized

Rules:
- Prefer the most specific category supported by visible evidence.
- Use document-level categoryPrimary for the dominant spend type.
- Use line-item categories when individual lines clearly differ.
- If uncertain, use misc_uncategorized and add category_uncertain.
- Do not invent project linkage.
```

## Operator Instructions

Store a short version of these in `instructions/runbook.md`.

### First-time setup

1. Create the workspace folders
2. Create empty ledger files if missing
3. Save the prompt files under `prompts/`
4. Save this spec as the source of truth
5. Start Gemini CLI from the workspace root

### Batch run procedure

1. Copy new receipts, invoices, and bills into `inbox/`
2. Start Gemini CLI at the workspace root
3. Paste the contents of `prompts/system.md`
4. Paste the contents of `prompts/batch_ingest.md`
5. Let the agent process all files
6. Inspect:
   - `runs/<run_id>/manifest.json`
   - `runs/<run_id>/run_summary.jsonl`
   - `ledger/review_queue.jsonl`
7. For flagged files, run the review prompt
8. Repeat until the review queue is empty or intentionally deferred

### Review procedure

1. Open the flagged source file
2. Compare it with:
   - `documents/<stem>.document.json`
   - `documents/<stem>.lines.json`
   - `documents/<stem>.raw_response.json`
3. Run `prompts/review_flagged.md`
4. Confirm the final state:
   - still flagged
   - corrected and accepted
   - rejected

## Recommended Naming Rules

- `recordId`: `exp_<yyyy>_<mm>_<dd>_<seq>`
- `lineItemId`: `line_<yyyy>_<mm>_<dd>_<seq>_<line>`
- `reviewId`: `rev_<yyyy>_<mm>_<dd>_<seq>`
- `runId`: `run_<yyyy>_<mm>_<dd>_<seq>`

## Validation Checklist

For each processed file, verify:

- The file hash is present
- The document type is explicit
- Supplier is raw plus normalized
- Total is present or flagged as uncertain
- Date is present or flagged as uncertain
- Raw response artifact exists
- Review artifact exists
- Per-document JSON exists
- Ledger rows were appended if applicable
- File was moved to exactly one terminal folder
- Run summary row was appended

## Test Set For Dry Runs

Use at least these sample cases before trusting the workflow:

- Clean printed receipt with line items
- Invoice with VAT and supplier number
- Bill with only a grand total and no line items
- Hebrew-only receipt
- English-only receipt
- Mixed Hebrew and English receipt
- Blurry photo
- Cropped document
- Multi-page PDF invoice
- Two receipts in one image
- Exact duplicate file
- Non-expense image accidentally placed in inbox

## Acceptance Criteria

The v1 workflow is successful when:

- Gemini CLI can process a folder end to end without per-file prompting
- Every file ends in a clear terminal state
- The ledger remains readable and append-only
- Duplicate handling is safe
- Flagged cases are isolated for review
- Supplier and category rollups are possible from local files alone
- The output is useful as a clean expense database for later planning work

## Future Extensions

These are intentionally deferred:

- SQLite export
- CSV export
- Supplier alias auto-learning
- Monthly summary generation
- Budget-variance reports
- Project linkage
- Studio app integration

