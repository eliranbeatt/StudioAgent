# 10 — Prompts Reference

> **Sources**:
> - [sdk/prompts.ts](file:///c:/Users/elira/Dev/StudioAgent/convex/sdk/prompts.ts) — 1598 lines, 25 prompt constants
> - [skills/prompts.ts](file:///c:/Users/elira/Dev/StudioAgent/convex/skills/prompts.ts) — 696 lines, SHARED_HEADER + 37 addon prompts

## SDK Prompts (25 constants)

### Shared References

| Constant | Purpose | Size |
|----------|---------|------|
| `SHARED_REF` | Canonical enums (work types, stages, sections) | ~10 lines |

### System Prompts

| Constant | Used By | Focus | Lines |
|----------|---------|-------|-------|
| `ORCHESTRATOR_SYSTEM` | `orchestrator` | Top-level delegation + tool selection policy | ~291 |
| `INTAKE_BRIEF_SYSTEM` | `intake.parse_brief` | Extract brief → structured format | ~80 |
| `PLAN_ELEMENTS_SYSTEM` | `plan.elements` | Generate elements as deliverable units | ~100 |
| `PLAN_TASKS_SYSTEM` | `plan.tasks` | Generate tasks with studio reality | ~150 |
| `PLAN_PHASES_SYSTEM` | `plan.execution_phases` | Phase plan with gates | ~80 |
| `COST_BUILD_BUDGET_SYSTEM` | `cost.build_budget` | Materials + labor BOM | ~200 |
| `PRICING_RESOLVE_SYSTEM` | `pricing.resolve_lines` | Price resolution cascade | ~100 |
| `QUOTE_GENERATE_SYSTEM` | `quote.generate` | Client-facing quote draft | ~80 |
| `PROCUREMENT_SHOPPING_SYSTEM` | `procurement.shopping_plan` | Procurement planning | ~100 |
| `FINANCE_RECEIPT_SYSTEM` | `finance.ingest_receipt` | Receipt parsing + mapping | ~80 |
| `AUDIT_PROJECT_SYSTEM` | `audit.project` | Plan completeness review | ~150 |
| `AUDIT_FIX_PLAN_SYSTEM` | `audit.fix_plan` | Convert findings → repair intents | ~120 |
| `MAINT_SYNC_REPAIR_SYSTEM` | `maint.sync_and_repair` | Link repair + dedup | ~100 |
| `CHAT_FREE_SYSTEM` | `chat.free` | Free-form conversation | ~60 |
| `THINK_DEEP_SYSTEM` | `think.deep` | Strategic analysis | ~80 |
| `CLARIFY_QUESTIONS_SYSTEM` | `clarify.next_questions` | Iterative Q&A | ~120 |
| `QA_PRINT_SYSTEM` | `qa.print_files` | Print file validation | ~80 |
| `RUNBOOK_SYSTEM` | `runbook.installation` | Install-day runbook | ~100 |
| `OPS_DAILY_SYSTEM` | `ops.daily_plan` | Daily execution plan | ~80 |
| `DRAFT_PLAN_QUESTIONS_SYSTEM` | `draft.plan_and_questions` | Planning flow (plan + Qs) | ~250 |
| `CHANGESET_COMPILE_SYSTEM` | `changeset.compile` | Intent → ops compilation | ~200 |
| `CHANGESET_REVIEW_SYSTEM` | `changeset.review` | PR-style validation | ~100 |
| `KNOWLEDGE_SYSTEM` | `knowledge.summarize_or_update` | Knowledge doc creation | ~100 |

### Full Prompts Map

| Constant | Purpose |
|----------|---------|
| `FULL_PROMPTS` | Runtime map: `toolId → system prompt string` |

## Skills Prompt Architecture

### Shared Header (`SHARED_HEADER` — 198 lines)

The shared header is prepended to every skill. It defines:

1. **Identity**: StudioOps agent for Emi Studio
2. **Language layer**: All instructions EN, all human-facing values HE
3. **Hard rules** (9 rules):
   - Output must be valid JSON only
   - Keys must be ASCII English
   - Task granularity: 1–4 hours (prefer split)
   - Atomic checklists: 0.1–0.5 hours per item
   - Work types: 9 canonical keys with Hebrew labels
   - Accounting routing: `material` | `work` lineTypes with section keys
   - Never invent measurements, dates, or prices
   - Completeness self-check (packaging, transport, install, safety)
4. **ChangeSet ops schema** (11 op kinds):
   - `element.create`, `task.create`, `task.syncFromLabor`, `task.patch`
   - `materialLine.create`, `workLine.create`
   - `materialLine.delete`, `workLine.delete`, `accountingLine.delete`, `task.delete`
   - `taskAccountingLink.create`, `taskAccountingLink.delete`
5. **Output format** (blocks-first):
   - `ChatBlock`, `SuggestionsBlock`, `QuestionsBlock`, `ChangeSetBlock`
   - `ReviewBlock`, `ShoppingPlanBlock`, `PrintQaBlock`, `ReceiptBlock`
   - `RunbookBlock`, `DailyPlanBlock`

### Skill Addon Prompts (37 entries in `SKILL_SYSTEM_ADDONS`)

Each addon is 30–200 lines defining:
- Skill identity and goal
- Specific behavioral rules
- Output contract constraints
- Dedup/consistency rules (when relevant)

### V3 Flow Shared Prefixes

| Prefix | Used By | Purpose |
|--------|---------|---------|
| `V3_SHARED_Q_PREFIX` | V3_Q_A through V3_Q_E | Common question-generation rules |
| `V3_SHARED_BUILD_PREFIX` | V3_BUILD_A through V3_BUILD_E | Common builder rules |

Key V3 rules:
- Generate exactly one QuestionSet per run (4–8 questions)
- Two actions: `submit_skip` and `submit_more`
- Data tool contract: `agent.data({ resource, projectId, filters, fields, limit, cursor })`
- Runtime variables injected: `projectId`, `runId`, `stageKey`, `runStartedAtISO`, `answerVersion`, `autoApprove`
