# Appendix A — UI Block Types

The agent output uses a typed block system for rendering in the frontend. Each block has a `type` field and a specific payload shape.

## Block Catalog

### ChatBlock
Free-form markdown response in Hebrew.
```json
{
  "type": "ChatBlock",
  "markdownHe": "string (Hebrew markdown)"
}
```

### SuggestionsBlock
Actionable next-step suggestions.
```json
{
  "type": "SuggestionsBlock",
  "titleHe": "string",
  "suggestions": [
    {
      "labelHe": "string",
      "whyHe": "string",
      "payload": {
        "action": "SKILL_ID",
        "params": {}
      }
    }
  ],
  "freeTextPromptHe": "string?"
}
```

### QuestionsBlock
Structured question sets for user input.
```json
{
  "type": "QuestionsBlock",
  "titleHe": "string",
  "stageKey": "string?",
  "questions": [
    {
      "id": "string",
      "textHe": "string",
      "type": "text | date | select | number | single | multi | toggle",
      "optionsHe": ["string"],
      "topicKey": "string"
    }
  ],
  "actions": [
    { "id": "submit_skip", "labelHe": "string" },
    { "id": "submit_more", "labelHe": "string" }
  ],
  "freeTextPromptHe": "string?",
  "freeTextTitleHe": "string?",
  "submitLabelHe": "string?",
  "autoRun": "boolean?",
  "continueAction": {
    "labelHe": "string",
    "payload": { "targetSkillId": "string" }
  }
}
```

### ChangeSetBlock
Proposed data mutations awaiting approval.
```json
{
  "type": "ChangeSetBlock",
  "titleHe": "string",
  "summaryHe": "string",
  "stats": {
    "elementsCreated": "number?",
    "tasksCreated": "number?",
    "materialLinesCreated": "number?",
    "workLinesCreated": "number?"
  },
  "changeSet": {
    "ops": ["ChangeSetOp[]"]
  },
  "nextActions": ["Action[]"]
}
```

### ReviewBlock
Audit/review findings.
```json
{
  "type": "ReviewBlock",
  "titleHe": "string",
  "sections": [
    {
      "headingHe": "string",
      "findings": ["string"],
      "severity": "info | warning | critical"
    }
  ],
  "risksHe": ["string"]
}
```

### ShoppingPlanBlock
Procurement plan with vendor trips.
```json
{
  "type": "ShoppingPlanBlock",
  "titleHe": "string",
  "objective": "string",
  "trips": [
    {
      "storeName": "string",
      "items": ["string"],
      "estimatedCost": "number",
      "notesHe": "string?"
    }
  ],
  "totals": {
    "totalEstimated": "number",
    "tripCount": "number"
  },
  "assumptionsHe": ["string"]
}
```

### PrintQaBlock
Print file validation results.
```json
{
  "type": "PrintQaBlock",
  "overallStatus": "pass | warning | fail",
  "issues": [
    {
      "fileRef": "string",
      "issue": "string",
      "severity": "info | warning | critical"
    }
  ],
  "questionsHe": ["string"],
  "vendorNotesHe": ["string"]
}
```

### ReceiptBlock
Parsed receipt data.
```json
{
  "type": "ReceiptBlock",
  "extracted": {
    "vendorName": "string",
    "date": "string",
    "totalAmount": "number",
    "vat": "number?",
    "lineItems": [{ "name": "string", "qty": "number?", "price": "number?" }]
  },
  "mappingSuggestions": [
    { "lineItem": "string", "targetElement": "string?", "targetMaterialLine": "string?" }
  ],
  "questionsHe": ["string"]
}
```

### RunbookBlock
Installation/teardown runbook.
```json
{
  "type": "RunbookBlock",
  "titleHe": "string",
  "summaryHe": "string?",
  "phases": [
    {
      "nameHe": "string",
      "steps": ["string"],
      "crew": ["string"],
      "duration": "string?"
    }
  ],
  "bringListHe": ["string"],
  "safetyHe": ["string"],
  "checkpointsHe": ["string"],
  "quickFixKitHe": ["string?"],
  "assumptionsHe": ["string?"],
  "approvalsRequired": "boolean?",
  "approvalStages": ["string?"]
}
```

### DailyPlanBlock
Day-by-day execution plan.
```json
{
  "type": "DailyPlanBlock",
  "date": "string",
  "prioritiesHe": ["string"],
  "scheduleHe": ["string"],
  "blockersHe": ["string"],
  "shoppingHe": ["string"]
}
```
