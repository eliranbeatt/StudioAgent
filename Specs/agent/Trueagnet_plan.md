

1) Product scope and invariants
1.1 Canonical studio flow
Project → Elements (canonical source of truth) → Tasks → Accounting → Pricing → Ops/Overhead Completeness → Quote → Final Audit
1.2 Determinism guarantees
Validators decide what’s missing, via typed issue keys.
Gate order is fixed.
Skills never write canon directly—they return ChangeSets + optional Questions.
Canon only changes after explicit user approval (line-by-line allowed).
After every apply: re-validate → next gate.
If a skill fails: run REPAIR_STEP constrained to validator keys.
1.3 Safety / studio guardrails
No deletes (archive only).
Every task must link to elementId or explicit scope=project_global.
Every accounting line must link to elementId (or overhead element/section).
Pricing must include provenance + checkedAt + confidence.
Human-facing values: Hebrew; instructions: English (internal).
________________________________________
2) UX goals
Brain dump first to reduce slow discovery.
Fast clarification (consolidated pack) + multi-round until readiness ≥ 0.95.
Ask again at any stage when missing info could materially hurt: safety / fit / cost / schedule.
With each clarification round: include 0–2 optional improvement suggestions.
Minimize “waiting”: parallel validators + parallel draft compute + pricing fan-out.
Multi-element projects (15+) processed in deterministic batches (3–5 elements).
________________________________________
3) Data model changes (Convex) + migrations
3.1 Projects (add brain dump + structured extraction + assumptions)
Add fields:
brainDumpRaw?: string
brainDumpStructuredDraft?: BrainDumpDraft
unknownAcceptedKeys?: string[]
assumptionsAccepted?: { key: string; valueHe: string; acceptedAt: number }[]
dismissedOppKeys?: string[] (for “don’t suggest again”)
Plus your existing basics:
customer, dates, location, status, etc.
3.2 Elements table (canonical)
If you don’t already have a first-class elements table, add elements:
projectId
titleHe, descriptionHe
status (drafting / approvedForQuote / …)
sortIndex
brainDumpRaw?: string
Core spec fields:
size?: { heightCm?, widthCm?, depthCm? }
mountingMode?: standing|hanging|wall|ceiling|other
primaryMaterialFamily?: wood|metal|foam|pvc|print|mixed
finish?: matte|satin|gloss|other
safetyNotesHe?: string
siteDependency?: none|install|measureRequired
tags?: string[] (for batching, e.g., “הדפסה”)
3.3 Tasks (linking + enrichment)
In tasks:
elementId?: Id<"elements"> or scope="project_global"
workType enum (your StudioWorkType)
phase enum: design|procure|build|finish|pack|install|returns|management
descriptionHe (enriched later)
checklistItems[] (Hebrew titles)
idempotencyKey
Add taskAccountingLinks:
taskId, accountingLineId, kind: material|labor|service
3.4 Accounting lines (materials + labor + services)
Keep materialLines and workLines if existing, but unify shared fields:
projectId, elementId
titleHe
qty, unit
unitCostNis, totalCostNis
Pricing provenance:
pricingSource: catalog|web|estimate|manual
confidence: high|medium|low
checkedAt
evidence?: { url?: string; noteHe?: string }
catalogRef?: { catalogItemId?: Id; priceId?: Id }
idempotencyKey
Add either:
serviceLines table
or
allow services inside materialLines with lineKind="service".
3.5 PriceBook (materials + services)
Evolve your current catalog/price memory into:
catalogItems (kind: material|service, unit, spec fields, aliases)
catalogPrices (supplierId, priceNis, checkedAt, confidence, isPreferred, evidence)
Rule: never overwrite “last paid”; keep history.
3.6 ChangeSets (mandatory)
Add changeSets:
projectId
gateId, skillId, batchId?
status: draft|proposed|approved|applied|rejected|superseded
summaryHe
ops[] (typed ops)
dependsOnIssueKeys[]
assumptionsUsed[]
createdAt, appliedAt
3.7 Flow run tracking (optional but recommended)
Add flowRuns + flowSteps OR extend agentRuns with:
flowRunId, currentGateId
readinessScore
blockingIssueKeys[]
activeBatchId?
draftChangeSetIds[] (parallel drafts)
________________________________________
4) Gate system (fixed order) and validators (exact)
4.1 Gate order
G0 Brief & Constraints
G1 Elements
G2 Tasks Skeleton
G3 Accounting BOM+Quantities+Labor
G4 Pricing
G5 Tasks Enrichment
G6 Ops & Overhead Completeness
G7 Pricing Recheck (only if new lines)
G8 Quote Snapshot
G9 Final Audit
4.2 ValidationReport structure (single schema)
Each validator returns:
status: pass|fail
blockingIssues[] (required to proceed unless explicitly “accept unknown/assumption” is allowed)
fixableIssues[] (agent can fix via ChangeSet without asking)
opportunities[] (0–N, non-blocking improvements, bounded)
warnings[]
metrics (coverage stats)
computed readinessScore
4.3 Readiness “95% sure” rule
Proceed when:
readinessScore >= 0.95 OR
user explicitly chooses: “continue with assumptions” (stored)
Readiness is computed from issue severities, not model intuition:
CRITICAL -0.25
HIGH -0.12
MEDIUM -0.06
LOW -0.02
contradictions -0.20
unknownAccepted on CRITICAL -0.10
4.4 Issue keys (typed, deterministic)
(Use your existing list; keep it stable. All clarifications map to a key.)
Key sets:
Brief keys (date/location/window dims/access/safety…)
Element keys (missing core specs)
Task keys (missing phases/workType/link)
Accounting keys (missing lines/qty/unit/link/workType)
Pricing keys (missing unitCost/source/evidence/stale/catalog mismatch)
Enrichment keys (task not referencing materials/labor/tools)
Ops/Overhead keys (transport/food/tools/consumables/buffer/returns)
Quote keys (missing/outdated/totals mismatch)
Audit keys (orphans, duplicates, unresolved unknown)
________________________________________
5) Clarification loop design (multi-round, fast, safe)
5.1 Clarification runs at any gate
Any gate can demand clarification if:
unresolved CRITICAL/HIGH issues exist
or readiness < 0.95
5.2 Consolidated Clarification Pack (no drip-feed)
When blocked:
run validators (parallel)
build one QuestionsBlock:
max 6 required questions (highest gain)
plus 0–2 improvement suggestions
show immediately (fast model)
user answers → save → revalidate
repeat if still <0.95
5.3 “Unknown” and assumptions
For each question:
“לא יודע” → add key to unknownAcceptedKeys
If canAssume=true: show “המשך עם הנחה” with assumption text; accepting stores assumptionsAccepted[]
Never re-ask answered/unknownAccepted keys
________________________________________
6) Improvement suggestions inside clarification (0–2 per round)
6.1 Two lanes in QuestionsBlock
kind="clarify" (required)
kind="suggest" (optional, never blocks)
6.2 Bounded suggestion space (deterministic)
Suggestions must map to OpportunityKey enums, e.g.:
modular for transport
faster finish system
more durable coating
lighter construction
stability improvement
cost reduction via material swap
Opportunities come from:
rule heuristics (code)
optional IMPROVEMENT_SUGGESTER skill constrained to allowed keys
6.3 Accepting a suggestion
If user chooses “לאמץ”:
generate a SuggestionChangeSet (small)
user approves it like any other ChangeSet If user chooses “לא להציע שוב”:
store opp key in dismissedOppKeys
________________________________________
7) Skills registry (full list) + tool policies
7.1 Wizard-time
BRAIN_DUMP_EXTRACTOR (fast, parallel)
CLARIFY_PACK_FROM_VALIDATION (fast)
optional IMPROVEMENT_SUGGESTER (fast, bounded)
7.2 Main flow (Option 3)
ELEMENTS_BUILD_OR_FIX
TASKS_SKELETON_BATCH
ACCOUNTING_BOM_AND_LABOR_BATCH
PRICING_LOOKUP_CATALOG_BATCH
PRICING_RESEARCH_WEB_BATCH (only if useWebSearch=true)
PRICING_ESTIMATE_FALLBACK_BATCH
TASKS_ENRICH_FROM_ACCOUNTING_BATCH
OVERHEAD_AND_LOGISTICS_COMPLETER
QUOTE_BUILD_OR_FIX
FINAL_AUDIT_FIXER
REPAIR_STEP (universal, constrained)
7.3 Tooling exposed to skills (no direct writes)
snapshot read tool
unit normalizer
catalog match + preferred price pick
calculator
web search (toggle)
quote breakdown compute
________________________________________
8) Multi-element batching (15 elements)
8.1 Batch selector (deterministic)
Batch size: 3–5 elements or token cap.
Grouping key: (siteDependency, primaryWorkType, materialFamily)
All elements get these tags from:
structured fields
extractor
deterministic classifier
8.2 Batch gates
Same gates (G2–G5 mostly) are run on batch scope:
batch passes if all elements in batch pass gate
batch issues are unioned and sorted deterministically
8.3 Project DONE
Only when:
all elements pass per-element gates
project-level ops completeness passes
quote snapshot up-to-date
final audit passes
________________________________________
9) Parallelism strategy (fast UX)
9.1 Always-parallel
all validators
pricing per line (bounded concurrency)
“draft compute” for next 1–2 steps while user answers
9.2 Serialized
ChangeSet apply (one at a time)
gate progression (in order)
9.3 DraftChangeSet metadata for rebasing
Each draft stores:
dependsOnIssueKeys[]
assumptionsUsed[]
if user answers change a dependency → patch affected section only
________________________________________
10) UI implementation plan
10.1 New Project Wizard (brain dump)
Modal steps:
Basics
Project Brain Dump (big text)
Elements builder + per-element dump
Review: summary + missing critical + optional improvements
Right rail live preview:
extracted facts
missing critical (CRITICAL/HIGH only)
assumptions
readiness score
On submit:
create project + elements
store raw + structured draft
redirect to /projects/[id]/agent with auto-run enabled
10.2 Agent tab
Route: /projects/[id]/agent
Layout:
Center: chat timeline with blocks
Right rail “Flow Dock”:
coverage dashboard per element
readiness score + current gate
run next / run batch
toggles: auto-run, useWebSearch
ChangeSet review drawer:
grouped ops
line-by-line approve/edit/decline/comment
QuestionsBlock:
required clarifications
optional “שדרוגים מומלצים” (0–2)
________________________________________
11) Backend modules (Convex) and responsibilities
11.1 snapshotBuilder
build ProjectSnapshot from canonical tables
compute per-element aggregates
11.2 validators/*
one file per gate validator
output typed issues + opportunities + readiness score
11.3 clarificationPackBuilder
selects top issues (max 6) + top opps (max 2)
ensures no repeats / respects unknownAccepted
11.4 flowRunner
compute validation across gates
choose next gate and next batch
run skill
store ChangeSet draft
handle failure → REPAIR_STEP
support auto-run until blocked
11.5 changeSetApplier
apply approved ops (with invariants)
revalidate post-apply
record audit trail
________________________________________
12) Migrations & backfills
Create elements from existing sections or inferred grouping
Backfill elementId onto tasks and accounting lines
Add idempotency keys to tasks/lines
Pricing provenance backfill:
existing costs become manual with checkedAt
Populate service catalog defaults
________________________________________
13) Testing plan (must-have)
13.1 Deterministic unit tests
validators produce expected issue keys + readiness
batch selection stable
idempotency prevents duplicates
pricing staleness TTL logic
invariants: cannot apply orphan ops
13.2 Integration tests
wizard creates project + elements + extraction preview
clarification pack shows instantly and progresses to 0.95+
end-to-end single-element project reaches DONE
multi-element project runs by batches, reaches DONE
repair loop recovers from schema/apply failures
________________________________________
14) Rollout plan (feature flags)
ff_wizard_brain_dump
ff_agent_flow_runner
ff_changeset_line_review
ff_pricing_web_research
ff_completeness_gate Roll out in phases:
Wizard only
Clarification pack only
Full flow single-element
Batching + parallel drafts
Migrations
________________________________________
15) Deliverables checklist (implementation-ready)
Frontend
NewProjectWizardModal + steps + live preview
Agent tab + Flow Dock + Coverage dashboard
QuestionsBlock (clarify + suggest)
ChangeSet review drawer (approve/edit/decline/comment)
Backend
schema changes + migrations scripts
snapshot builder
validators per gate + readiness score
clarification pack builder
flow runner + batcher + parallel draft scheduling
ChangeSet applier with invariants
skills registry + runner adapters
AI prompts (stored in skills admin)
extractor
clarify pack
improvement suggester
each main skill prompt (tasks/accounting/pricing/enrichment/overhead/quote/repair)
