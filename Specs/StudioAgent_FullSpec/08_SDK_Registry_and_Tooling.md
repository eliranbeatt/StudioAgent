# 08 — SDK Registry and Tooling

> **Source**: [registry.ts](file:///c:/Users/elira/Dev/StudioAgent/convex/sdk/registry.ts) — 284 lines, 27 tool definitions

## ToolDefinition Interface

```typescript
interface ToolDefinition {
  id: string;
  kind: 'agent' | 'tool';   // agent = iterative loop, tool = single shot
  systemPrompt: string;
  description: string;
  model: string;
  temperature?: number;
  allowedTools?: string[];   // Only for kind='agent'
  schemaName: string;        // Maps to SDK_SCHEMAS for validation
}
```

## Full Registry (27 Tools)

### Orchestrator

| ID | Kind | Model | Schema | Description |
|----|------|-------|--------|-------------|
| `orchestrator` | agent | gpt-5.2 | `orchestrator.response` | Top-level orchestrator, 27 allowed tools |

### Infrastructure Tools

| ID | Kind | Model | Schema | Description |
|----|------|-------|--------|-------------|
| `context.get` | tool | gpt-5-mini | `context.response` | Fetch project data by packs |
| `knowledge.summarize_or_update` | tool | gpt-5-mini | `knowledge.response` | Update project knowledge doc |
| `web_search` | tool | — | `web_search.response` | Internet search (Brave/Google) |

### Clarification & Chat

| ID | Kind | Model | Schema | Description |
|----|------|-------|--------|-------------|
| `clarify.next_questions` | agent | gpt-5-mini | `clarify.next_questions` | Iterative clarification loops |
| `chat.free` | agent | gpt-5-mini | `chat.free.response` | Free-form conversation |
| `think.deep` | agent | gpt-5.2 | `think.deep.response` | Deep strategy/research analysis |

### Planning Tools

| ID | Kind | Model | Schema | Description |
|----|------|-------|--------|-------------|
| `intake.parse_brief` | tool | gpt-5-mini | `intake.parse_brief` | Extract structured brief |
| `plan.elements` | tool | gpt-5-mini | `plan.elements` | Generate element intents |
| `plan.tasks` | tool | gpt-5.2 | `plan.tasks` | Generate task intents |
| `plan.execution_phases` | tool | gpt-5-mini | `plan.execution_phases` | Phase plan with gates |
| `draft.plan_and_questions` | tool | gpt-5-mini | `draft.plan_and_questions` | Planning flow: plan + question sets |

### Costing & Pricing

| ID | Kind | Model | Schema | Description |
|----|------|-------|--------|-------------|
| `cost.build_budget` | tool | gpt-5.2 | `cost.build_budget` | Generate budget (materials + labor) |
| `pricing.resolve_lines` | agent | gpt-5-mini | `pricing.resolve_lines` | Resolve prices via catalog/web |
| `quote.generate` | tool | gpt-5-mini | `quote.generate` | Client-facing quote draft |

### Procurement & Finance

| ID | Kind | Model | Schema | Description |
|----|------|-------|--------|-------------|
| `procurement.shopping_plan` | agent | gpt-5-mini | `procurement.shopping_plan` | Procurement plan + vendor targets |
| `finance.ingest_receipt` | agent | gpt-5-mini | `finance.ingest_receipt` | Parse receipts → map to lines |

### Audit & Maintenance

| ID | Kind | Model | Schema | Description |
|----|------|-------|--------|-------------|
| `audit.project` | agent | gpt-5-mini | `audit.project` | Plan completeness/consistency review |
| `audit.fix_plan` | agent | gpt-5-mini | `audit.fix_plan` | Convert findings → repair intents |
| `maint.sync_and_repair` | agent | gpt-5-mini | `maint.sync_and_repair` | Iterative link/dedup repair |

### Operations

| ID | Kind | Model | Schema | Description |
|----|------|-------|--------|-------------|
| `qa.print_files` | agent | gpt-5-mini | `qa.print_files` | Print file QA |
| `runbook.installation` | tool | gpt-5-mini | `runbook.installation` | Install-day runbook |
| `ops.daily_plan` | tool | gpt-5-mini | `ops.daily_plan` | Day-by-day execution plan |

### ChangeSet Tools

| ID | Kind | Model | Schema | Description |
|----|------|-------|--------|-------------|
| `changeset.compile` | tool | gpt-5.2 | `changeset.compile` | Compile intents → ChangeSet ops |
| `changeset.review` | tool | gpt-5-mini | `changeset.review` | PR-style validation |
| `changeset.apply` | tool | — | — | Apply approved ChangeSet (gated) |

### Admin Tools

| ID | Kind | Model | Schema | Description |
|----|------|-------|--------|-------------|
| `admin.set_labor_rates` | tool | gpt-5-mini | `admin.set_labor_rates` | Validate + normalize labor rates |
| `admin.confirm_measurements` | tool | gpt-5-mini | `admin.confirm_measurements` | Validate element measurements |

### Planning Flow

| ID | Kind | Model | Schema | Description |
|----|------|-------|--------|-------------|
| `rebase.regenerate_questions_manual` | tool | gpt-5-mini | `rebase.regenerate_questions` | Regenerate plan after manual refresh |
| `finalize.build_structured_package` | tool | gpt-5.2 | `finalize.structured_package` | Build final deliverable package |

## Model Distribution

| Model | Count | Usage |
|-------|-------|-------|
| `gpt-5.2` | 7 | Orchestrator, tasks, budget, compile, think, finalize |
| `gpt-5-mini` | 20 | Most tools — lighter/faster |
