# 16 — Acceptance Criteria and Test Scenarios

## Automated Test Infrastructure

### E2E Tests (Playwright)
```bash
npm run test:e2e
```

### SDK/Backend Tests
```bash
npm run test:sdk
```

## Test Scenarios by Domain

### 1. SDK Agent — Planning Flow

| ID | Scenario | Acceptance |
|----|----------|------------|
| P-1 | Start new project planning | Run created with `runMode=PLANNING_FLOW`, `status=running` |
| P-2 | Brain dump → question generation | `draft.plan_and_questions` produces valid `QuestionsBlock` with 4–8 questions |
| P-3 | Submit answers → next questions | Answers stored as `qaPairs`, next question set generated |
| P-4 | All questions answered → build | ChangeSet compiled with element.create + task.create ops |
| P-5 | ChangeSet approval → apply | All entities created in DB, run `status=completed` |
| P-6 | Reject changeset | Run returns to `needs_input`, no DB changes |

### 2. SDK Agent — Chat Mode

| ID | Scenario | Acceptance |
|----|----------|------------|
| C-1 | Simple question | Hebrew response via `chat.free`, no ChangeSet |
| C-2 | Change request | `context.get` → analysis → ChangeSet proposal |
| C-3 | Pricing research | `web_search` tool called, results in Hebrew |
| C-4 | Audit request | `audit.project` produces findings with risk scores |
| C-5 | Multi-tool orchestration | Orchestrator delegates to ≥2 tools in sequence |
| C-6 | Max tool loops | Run terminates after 6 iterations with partial result |

### 3. Skills System

| ID | Scenario | Acceptance |
|----|----------|------------|
| S-1 | Skill with clarifications | `CLARIFICATIONS_GATE` runs first, then target skill |
| S-2 | ELEMENTS_BUILDER_FULL | Produces ChangeSet with element.create ops |
| S-3 | TASKS_BUILDER_FULL | Tasks have work types, checklists, estimated hours |
| S-4 | ACCOUNTING_BUILDER_FULL | Material + work lines linked to tasks, dedup keys |
| S-5 | SHOPPING_PLANNER_WEB | Web search called, prices extracted, ChangeSet output |
| S-6 | GAP_AUDIT | Suggestions output (no ChangeSet unless autoFix) |
| S-7 | BOM_DUPLICATE_ANALYZER | Finds duplicates, proposes delete ops |
| S-8 | INSTALL_RUNBOOK_BUILDER | RunbookBlock with phases, bring list, safety |

### 4. ChangeSet Pipeline

| ID | Scenario | Acceptance |
|----|----------|------------|
| CS-1 | Compile intents → ops | Valid ops array, tempIds resolved |
| CS-2 | Cross-references | `elementTempOrId` resolves across ops |
| CS-3 | Review catches errors | Missing fields flagged, risk scored |
| CS-4 | Apply creates entities | DB records match op payloads |
| CS-5 | Apply preserves order | Elements before tasks before lines |
| CS-6 | Dedup on rerun | Second run patches (not creates) existing entities |

### 5. Knowledge & Context

| ID | Scenario | Acceptance |
|----|----------|------------|
| K-1 | Knowledge update | `memoryDocs` updated with structured Hebrew sections |
| K-2 | File grounding | Uploaded file text included in knowledge (≤3500 chars/file) |
| K-3 | Context packs | `context.get` returns correct data per pack |
| K-4 | QA pair storage | Questions + answers stored with topicKey for dedup |

### 6. V3 Flow Pipeline

| ID | Scenario | Acceptance |
|----|----------|------------|
| V3-1 | Stage A questions | 4–8 intake-focused questions generated |
| V3-2 | Stage A → B transition | Memory docs saved, stage B questions generated |
| V3-3 | Stage B build | Elements + tasks changeset |
| V3-4 | Stage BC combined build | Elements + tasks + accounting in one changeset |
| V3-5 | Stage D polish | Patches, archives, no hard deletes (unless approved) |
| V3-6 | Stage E quote | Quote draft with totals, assumptions, exclusions |

### 7. Data Integrity

| ID | Scenario | Acceptance |
|----|----------|------------|
| D-1 | ASCII keys | No Hebrew in JSON keys (assertAsciiKeys passes) |
| D-2 | Schema validation | All tool outputs pass Zod validation |
| D-3 | Foreign key integrity | All elementId/taskId references resolve |
| D-4 | Price never zero | No `plannedUnitCost: 0` in accounting lines |
