# 04 — Orchestrator Design (Current)

## Overview

The SDK Orchestrator (`REGISTRY.orchestrator`) is the top-level agent that delegates to specialized tools and agents.

- **Source**: [registry.ts](file:///c:/Users/elira/Dev/StudioAgent/convex/sdk/registry.ts)
- **Prompt**: [prompts.ts](file:///c:/Users/elira/Dev/StudioAgent/convex/sdk/prompts.ts) — `ORCHESTRATOR_SYSTEM` (291 lines)
- **Model**: `gpt-5.2`
- **Kind**: `agent` (iterative, up to 6 tool-call loops)

## Allowed Tools (27 total)

```
context.get                       knowledge.summarize_or_update
web_search                        changeset.compile
changeset.review                  changeset.apply
clarify.next_questions            chat.free
think.deep                        pricing.resolve_lines
procurement.shopping_plan         finance.ingest_receipt
audit.project                     qa.print_files
maint.sync_and_repair             audit.fix_plan
intake.parse_brief                plan.elements
plan.tasks                        plan.execution_phases
cost.build_budget                 quote.generate
runbook.installation              ops.daily_plan
finalize.build_structured_package admin.set_labor_rates
admin.confirm_measurements
```

## Tool Selection Policy

The orchestrator follows a strict delegation policy:

### Option A — Skill Agents (iterative/branchy/research)

| Tool ID | Agent Name | Purpose |
|---------|-----------|---------|
| `pricing.resolve_lines` | Pricing Agent | Web research + catalog lookup for prices |
| `procurement.shopping_plan` | Procurement Agent | Vendor targets + delivery planning |
| `finance.ingest_receipt` | Receipt Agent | Parse receipts, map to material lines |
| `audit.project` | Audit/Critic Agent | Plan completeness + consistency review |
| `qa.print_files` | Print QA Agent | Validate print files for production |
| `clarify.next_questions` | Clarification Agent | Iterative Q&A to unlock next stage |
| `maint.sync_and_repair` | Maintenance Agent | Fix broken links, dedup, normalize |

### Option B — Skill Tools (deterministic single-shot)

| Tool ID | Purpose |
|---------|---------|
| `intake.parse_brief` | Extract structured brief from messy input |
| `plan.elements` | Generate elements as approval/quote units |
| `plan.tasks` | Generate realistic tasks with work types |
| `plan.execution_phases` | Produce phase plan with gates |
| `cost.build_budget` | Create budget (materials + labor) |
| `quote.generate` | Generate client-ready quote draft |
| `runbook.installation` | Install-day runbook |
| `ops.daily_plan` | Day-by-day execution schedule |

### Option C — Database Changes (gated)

| Tool ID | Purpose | Gate |
|---------|---------|------|
| `changeset.compile` | Transform intents → ChangeSet ops | None |
| `changeset.review` | Static PR-style validation | Optional |
| `changeset.apply` | Execute DB mutations | **Requires user approval** |

## Core Operating Principles

1. **Delegation over doing**: Use specialized tools/agents, not raw reasoning
2. **Context-first**: Always `context.get` before planning/auditing/pricing
3. **Stage awareness**: Maintain and deliberately advance stage (intake → execution)
4. **Structured output**: All tools return validated JSON schemas
5. **Write wall**: All DB edits go through ChangeSet tools with explicit approval
6. **80% rule**: Proceed with reasonable assumptions if 80% info available
7. **2-round rule**: After 2 rounds of questions on same topic, assume and move on

## Chat vs. Planning Behavior

| Aspect | PLANNING_FLOW | CHAT_EDIT |
|--------|---------------|-----------|
| Default behavior | Run planning pipeline | Fast, concise discussion |
| Context loading | Full project snapshot | Lazy, minimal |
| Output format | Structured UI blocks | Plain Hebrew text |
| Audit | Automatic at review stage | Only on explicit request |
| Write handling | Through planning pipeline | Suggest changeset path |
| Next steps | Always structured blocks | 1-2 numbered options |
