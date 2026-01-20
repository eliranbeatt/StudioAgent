# True Agent (Flow Agent) — Implementation Plan v1 (Repo-aligned)

Date: 2026-01-19

## Status (repo scan: 2026-01-20)
- ✅ Flow Agent tab + route exists and is flag-gated.
- ✅ Feature flags module exists (`convex/featureFlags.ts`) and is used by UI + backend.
- ✅ Phase 1 persistence exists (`flowRuns`, `flowSteps` tables + APIs) and survives refresh.
- ✅ Brain Dump backend + UI exists (append + replace) and can trigger re-validation.
- ✅ Phase 2 snapshot + deterministic validators exist for G0–G9 (G4/G6/G7 gated by `ff_flow_pricing_gates`).
- ✅ Phase 4 runner is implemented and gated (`ff_flow_runner_v1`), including G1–G9 skill orchestration, approval stop points, and auto-advance.
- ✅ Per-run toggles (auto-run + web search) are implemented in backend + UI, with web pricing gated by `ff_flow_web_pricing`.
- ✅ ChangeSet “apply/discard + continue” wrappers exist to tick the runner after approval.
- ✅ `npm run build` succeeds in restricted TLS environments (no `next/font/google` fetch; Convex codegen is no longer a hard prebuild requirement).

## Goals
- Add a **new** Flow Agent that can run **end-to-end project planning flows** via deterministic gates, with **stop points** for user interaction.
- Keep the existing Agent tab intact (`/projects/[id]/agent`).
- Add a **new tab** (Flow Agent) with **progress UI**, **resumable runs**, and clear blocking reasons.
- Reduce prompt bloat over time via **Context Packs** (`ctx.pull`) + **prompt caching** (optional 24h retention for `gpt-5.2`).

## Feature flags (rollout + safety)
This project should ship the Flow Agent behind feature flags so you can safely deploy early phases without impacting the current `/agent` experience.

### Where flags live
- Use the existing `appSettings` table (already in `convex/schema.ts`).
- Store all flags in a single record:
  - `appSettings.key = "featureFlags"`
  - `appSettings.value = { ...flags }` (plain JSON object)

### Convex API for flags (recommended)
Add a small flags module so both UI and backend can check consistently.

- Add `convex/featureFlags.ts`
  - Query: `getAll()` → returns `{ [flagName: string]: boolean }`
  - Mutation: `setAll(nextFlags)` → admin-only in the future
  - Helper: `isEnabled(flags, name, defaultValue=false)` (pure)

### Frontend usage
- Fetch flags with `useQuery(api.featureFlags.getAll)` in project layout and Flow Agent route.
- Hide the Flow Agent tab unless `ff_flow_agent_tab` is enabled.
- If a user navigates directly to `/flow-agent` while disabled, render a simple “disabled” state.

### Backend usage
- Flow-run actions/mutations must hard-check flags as well (do not rely on UI hiding).
- If disabled, throw a friendly error: `Flow Agent is disabled (ff_flow_agent_backend)`.

### Flag list (planned)
Core Flow Agent
- `ff_flow_agent_tab`: show the Flow Agent tab + route.
- `ff_flow_agent_backend`: allow `flowRuns.*` APIs.
- `ff_flow_validators_v1`: allow Phase 2 validators to run.
- `ff_flow_clarification_pack_v1`: enable consolidated clarification pack behavior.
- `ff_flow_runner_v1`: enable the gate orchestration runner (tick/autorun).

Pricing + ops
- `ff_flow_pricing_gates`: enable G4/G6/G7 validators.
- `ff_flow_web_pricing`: allow web pricing skill usage from Flow Agent when `useWebSearch` toggle is on.

Prompt/context performance
- `ff_ctx_packs_v1`: enable Context Packs (`ctx.pull`) integration.
- `ff_prompt_cache`: set `prompt_cache_key` on supported calls.
- `ff_prompt_cache_24h`: additionally set `prompt_cache_retention: "24h"` for `gpt-5.2` (optional).

Wizard
- `ff_wizard_brain_dump`: enable the new project wizard brain dump step.

## Non-negotiable invariants (from specs)
- Fixed gate order; deterministic progression.
- Validators decide what’s missing using **typed issue keys**.
- Skills never write canon directly; they return **ChangeSets** (+ optional Questions).
- Canon changes only after explicit user approval (line-by-line allowed).
- After every apply: re-validate → next gate.
- No deletes (archive only).
- Every task must link to `elementId` or be explicitly project-global.
- Every accounting line must link to `elementId` (or explicit overhead scope).
- Pricing must include provenance + `checkedAt` + confidence.
- User-facing: Hebrew; internal instructions: English.

## Current repo baseline (what already exists)
### UI
- Existing Agent tab route: `src/app/projects/[id]/agent/*`
  - Conversations + chat timeline with block rendering.
  - Skills dock invokes skills with `params.scope.elementIds`.
  - ChangeSet review drawer exists.
- Project nav: `src/app/projects/[id]/layout.tsx` (where we will add the Flow Agent tab).
- Tracing UI already reads `cached_tokens`: `src/app/management/tracing/page.tsx`.

### Backend (Convex)
- Skills registry + runner:
  - `convex/skills/registry.ts` (skill catalog)
  - `convex/skills/runner.ts` (LLM calls, block saving, gate-like clarifications per skill)
- Clarifications sessions table exists: `clarificationSessions`.
- Canonical tables exist: `projects`, `elements`, `tasks`, `materialLines`, `workLines`, etc.
- ChangeSets are implemented and already support grouped ops.
- LLM tracing wrapper exists: `convex/lib/llm.ts`.

### Repo verification checklist (to avoid "baseline hallucinations")
Before starting Phase 1 work, verify these items in the repo and treat anything missing as part of Phase 1 scope:
- [x] UI route exists: `src/app/projects/[id]/agent/page.tsx`
- [x] Skills dock can run skills with scope: `params.scope.elementIds`
- [x] ChangeSet review drawer exists and can apply/discard: `src/app/projects/[id]/agent/_components/ChangeSetReviewDrawer.tsx`
- [x] Convex tables exist:
  - `agentConversations`, `agentMessages`, `skillRuns`
  - `clarificationSessions`, `qaPairs`, `memoryDocs`
  - canonical: `projects`, `elements`, `tasks`, `materialLines`, `workLines`
- [x] Tracing UI reads `cached_tokens`: `src/app/management/tracing/page.tsx`

If any of the above are missing, add them before proceeding to Phase 2.

## Glossary
- **Flow Agent**: orchestrator that runs gates → validators → skills → ChangeSets → user approvals.
- **Gate**: fixed step in canonical studio flow.
- **Validator**: deterministic code returning `ValidationReport` with typed issue keys.
- **IssueKey**: stable typed string identifying a missing/invalid requirement.
- **Readiness**: computed score; proceed when >= 0.95 or user explicitly accepts unknown/assumption.
- **Context Packs**: structured, versioned slices of project state pulled on demand (`ctx.pull`).

---

# Phase Plan (each phase shippable and testable)

## Phase 0 — v1 scope lock + schemas (1–2 days)
### Outcome
A minimal, concrete spec inside the repo so implementation stays deterministic and testable.

### Work items
- [ ] Define enums:
  - `GateId` (G0..G9)
  - `IssueSeverity` (CRITICAL/HIGH/MEDIUM/LOW)
  - `IssueKey` namespaces per gate (brief.*, elements.*, tasks.*, accounting.*, quote.*, audit.*)
  - `OpportunityKey` bounded list
- [x] Define `ValidationReport` v1 types (currently implemented as TS types in Convex)
  - `status: "pass"|"fail"`
  - `blockingIssues[]`, `fixableIssues[]`, `opportunities[]`, `warnings[]`
  - `metrics` and `readinessScore`
- [x] Define readiness scoring formula exactly
  - CRITICAL -0.25
  - HIGH -0.12
  - MEDIUM -0.06
  - LOW -0.02
  - contradictions -0.20
  - unknownAccepted on CRITICAL -0.10

### Repo changes
- [x] Add doc: (this doc) `Specs/agent/TrueAgent_ImplementationPlan_v1.md`
- [x] Add Convex validation types: `convex/flow/validation/types.ts`
- [ ] Add shared type module (shared between Convex + UI if desired): `src/lib/flow/types.ts`
  - Note: current implementation keeps Flow types in `convex/flow/validation/*`.

### Feature flags
- [x] Add `convex/featureFlags.ts` (Phase 0 foundation).
- [x] Add initial flags with defaults (all `false`).
  - Note: defaults are returned even if `appSettings.key="featureFlags"` record does not exist yet.

### Acceptance test
- Types compile; `IssueKey` list is stable and reviewed.

---

## Phase 1 — New Flow Agent tab + resumable FlowRuns skeleton (2–4 days)
### Outcome
A new tab exists, persists flow runs in DB, and supports start/pause/resume across refresh.

### Scope change in v1.1 (to match requirements)
Phase 1 must include the **Brain Dump first** UX (even if extraction is minimal at first). This is required to reduce ambiguity before the flow starts.

### Feature flags
- Introduce and wire:
  - [x] `ff_flow_agent_tab` (UI)
  - [x] `ff_flow_agent_backend` (Convex API)
- Rollout recommendation:
  - Dev: enable both.
  - Prod: enable `ff_flow_agent_tab` only after backend is deployed; then enable `ff_flow_agent_backend`.

### Backend (Convex)
#### Schema additions (update)
- [x] Update `convex/schema.ts`:
  - [x] Add table `flowRuns`
  - [x] Add table `flowSteps`

Additionally (Brain Dump v1):
- [x] Update `projects` table to include:
  - [x] `brainDumpRaw?: string` (append-only text)
  - [x] `brainDumpStructuredDraft?: any` (v1: untyped draft blob; type later)

Recommended `flowRuns` fields:
- `projectId: Id<"projects">`
- `status: "running"|"blocked"|"awaiting_approval"|"paused"|"completed"|"failed"|"cancelled"`
- `currentGateId: string`
- `readinessScore?: number`
- `blockingIssueKeys?: string[]`
- `activeBatch?: { elementIds?: Id<"elements">[]; batchId?: string }`
- `toggles?: { autoRun?: boolean; useWebSearch?: boolean }`
- `conversationId?: Id<"agentConversations">` (optional: dedicated thread for Flow Agent)
- `createdAt`, `updatedAt`, `finishedAt?`

Recommended `flowSteps` fields:
- `flowRunId: Id<"flowRuns">`
- `gateId: string`
- `status: "running"|"passed"|"failed"|"blocked"|"awaiting_approval"|"skipped"`
- `batch?: { elementIds?: Id<"elements">[]; batchId?: string }`
- `validationReport?: any` (v1; later make typed)
- `draftChangeSetIds?: Id<"changeSets">[]`
- `error?: string`
- `startedAt`, `finishedAt?`

#### New Convex module files (add)
- [x] `convex/flowRuns.ts`
  - [x] mutations/queries: `start`, `pause`, `resume`, `cancel`, `getActiveByProject`, `listByProject`
  - [x] validation helper: `computeValidation` (currently implemented as a mutation)
- [x] `convex/flowSteps.ts`
  - [x] queries: `listByRun`

Brain dump support (add):
- [x] `convex/brainDump.ts`
  - [x] mutation: `appendProjectBrainDump({ projectId, text })`
  - [x] mutation: `setProjectBrainDumpRaw({ projectId, text })` (admin-only later; useful for edits)
  - [x] query: `getProjectBrainDump({ projectId })`

#### Flag checks to implement
- [x] In `convex/flowRuns.ts` handlers, require `ff_flow_agent_backend`.

### Frontend (Next.js)
#### New route + components (add)
- [x] Add route: `src/app/projects/[id]/flow-agent/page.tsx`
- [ ] Add components (optional refactor)
  - `src/app/projects/[id]/flow-agent/_components/FlowRunHeader.tsx` (start/pause/resume)
  - `src/app/projects/[id]/flow-agent/_components/FlowTimeline.tsx` (steps list)
  - `src/app/projects/[id]/flow-agent/_components/FlowDebugPanel.tsx` (raw JSON reports; v1)
  - Note: current implementation renders these sections inline in the page.

Brain dump UI (add):
- [x] Brain dump UI exists (Hebrew) with append + replace and last-updated time.
  - Note: currently implemented inline in `src/app/projects/[id]/flow-agent/page.tsx`.

Free text addendum (required):
- The Flow Agent tab must include a free-text input that can be used at any time during the flow.
- v1 behavior:
  - [x] appends to `projects.brainDumpRaw`
  - [ ] also appends to `memoryDocs.kind="USER_INPUT_LOG"` (optional but recommended)
  - [x] triggers re-validation (currently triggers `computeValidation` when validators are enabled)

#### Update existing nav (update)
- [x] Update `src/app/projects/[id]/layout.tsx`
  - [x] Add new nav item "Flow Agent" pointing to `/projects/${projectId}/flow-agent`
  - [x] Keep existing "Agent" item unchanged.

#### Flag checks to implement
- [x] In `src/app/projects/[id]/layout.tsx`, only show the tab when `ff_flow_agent_tab` is enabled.
- [x] In `src/app/projects/[id]/flow-agent/page.tsx`, show disabled state if `ff_flow_agent_tab` is off.

### Acceptance tests
- Start Flow Run → shows status and created step 0.
- Refresh page → run still visible.
- Pause + resume works.

Brain dump tests:
- User can paste a brain dump before starting the run.
- User can add free-text addendum mid-run; the run re-validates.

---

## Phase 2 — Snapshot builder + deterministic validators v1 (4–8 days)
### Outcome
Flow Agent can deterministically compute readiness + blocking issues without calling the LLM.

### Scope change in v1.1 (to match requirements)
Phase 2 must include a **minimal brain dump extractor** (fast) so the system can:
- pre-tag elements for batching
- surface missing critical constraints early

This extractor can initially output a coarse structured draft into `projects.brainDumpStructuredDraft` and can be improved iteratively.

### Feature flags
- Introduce `ff_flow_validators_v1`.
- Gate all validation computation behind it (so Phase 1 can ship without validator behavior).

### Backend (Convex)
#### New modules (add)
- [x] `convex/flow/snapshotBuilder.ts`
  - [x] `buildProjectSnapshot(projectId, opts?)` with stable ordering

Brain dump extraction (add):
- [x] `convex/flow/brainDumpExtractor.ts`
  - deterministic extractor helper (no LLM)
  - runs on brain dump edits (append/replace) and writes `projects.brainDumpStructuredDraft`
- [x] `convex/flow/validation/types.ts`
  - [x] `ValidationReportV1`, `IssueV1`, severity enums
- [x] `convex/flow/validation/readiness.ts`
  - [x] `computeReadiness(report)`
- Validators (one file per gate):
 - Validators (one file per gate):
  - [x] `convex/flow/validation/validateG0Brief.ts`
  - [x] `convex/flow/validation/validateG1Elements.ts`
  - [x] `convex/flow/validation/validateG2Tasks.ts`
  - [x] `convex/flow/validation/validateG3Accounting.ts`
  - [x] `convex/flow/validation/validateG4Pricing.ts`
  - [x] `convex/flow/validation/validateG5TasksEnrichment.ts`
  - [x] `convex/flow/validation/validateG6OpsCompleteness.ts`
  - [x] `convex/flow/validation/validateG7PricingRecheck.ts`
  - [x] `convex/flow/validation/validateG8Quote.ts`
  - [x] `convex/flow/validation/validateG9Audit.ts`

#### Integrations (update)
- Update `convex/flowRuns.ts` to expose a query/action:
  - `computeValidation(projectId, gateId, batch?)` (no LLM)
  - Store the report in `flowSteps.validationReport`

Status:
- [x] `computeValidation` exists (implemented as a mutation) and stores into `flowSteps.validationReport`.

#### Flag checks to implement
- [x] `computeValidation` requires `ff_flow_validators_v1`.

### Frontend
- Update `Flow Agent` tab to render:
  - [x] readiness score
  - [x] grouped issues (blocking + warnings)
  - [ ] coverage metrics (counts)

### Acceptance tests
- Run validation on empty project → stable IssueKeys.
- Run validation on partially-filled project → stable IssueKeys + correct readiness.

Extractor tests:
- Running the extractor stores `brainDumpStructuredDraft` and does not break determinism of validators.

---

## Phase 3 — Consolidated Clarification Pack + unknown/assumptions persistence (4–7 days)
### Outcome
When blocked, Flow Agent asks a single consolidated pack (max 6 required + 0–2 optional), persists answers, and revalidates.

### Clarification loop (explicit contract)
This is not a one-shot interaction; it must be a deterministic multi-round loop:

While `readinessScore < 0.95` (and user has not explicitly chosen to proceed with assumptions):
1) run validators (parallel)
2) build one consolidated QuestionsBlock (max 6 required)
3) include 0–2 optional suggestions (non-blocking)
4) user answers / accepts unknown / accepts assumption
5) persist answers
6) re-validate immediately
7) repeat until `>= 0.95` or user forces continue

### Feature flags
- Introduce `ff_flow_clarification_pack_v1`.
- Rollout recommendation: enable after Phase 2 is stable.

### Backend (Convex)
#### Schema updates (update)
- Update `convex/schema.ts` `projects` table to include:
  - [x] `unknownAcceptedKeys?: string[]`
  - [x] `assumptionsAccepted?: { key: string; valueHe: string; acceptedAt: number }[]`
  - [x] `dismissedOppKeys?: string[]`

#### New module (add)
- [x] `convex/flow/clarificationPackBuilder.ts`
  - [x] `buildQuestionsBlock({ report, qaPairs, unknownAcceptedKeys, assumptionsAccepted, dismissedOppKeys })`
  - deterministic selection rules (sort by severity + stable key order; max 6)

### Improvement suggestions (fully specified)
Suggestions are a second lane that never blocks progression.

QuestionsBlock output shape (v1.1):
- `kind="clarify"` questions (required)
- `kind="suggest"` suggestions (optional, max 0–2)

Opportunity generation sources:
- deterministic heuristics (code) based on snapshot (preferred)
- optional bounded LLM suggester skill constrained to allowed `OpportunityKey` values

User choices for suggestions:
- "לאמץ" → generate a small Suggestion ChangeSet (separate, minimal ops)
- "דלג" → do nothing
- "לא להציע שוב" → add `OpportunityKey` to `projects.dismissedOppKeys`

#### Flag checks to implement
- When a run is blocked, only use the new pack builder if `ff_flow_clarification_pack_v1` is enabled.
- If disabled, fall back to a minimal QuestionsBlock (or block without questions) to keep Phase 1/2 safe.

#### Answer persistence (reuse existing)
- Use existing `qaPairs` table with `questionKey = IssueKey`.
- Add mutations:
  - [x] `convex/flowAnswers.ts`
    - [x] `submitAnswers(flowRunId, answersByKey)`
    - [x] `acceptUnknown(flowRunId, issueKey)`
    - [x] `acceptAssumption(flowRunId, { key, valueHe })`
    - [x] `dismissOpportunity(flowRunId, opportunityKey)`

### Frontend
- In Flow Agent tab:
  - [x] Render a QuestionsBlock UI when blocked (from `validationReport.questionsBlock`).
  - [x] Submitting answers persists QA and triggers revalidation.

### Acceptance tests
- Flow blocks → shows one QuestionsBlock.
- Answer → revalidate; key not asked again.
- “לא יודע” marks unknownAcceptedKeys and is not re-asked.

Suggestions tests:
- 0–2 suggestions appear alongside required questions.
- Adopt creates a separate ChangeSet and requires explicit approval.
- Dismiss stores `dismissedOppKeys` and the suggestion is not shown again.

---

## Phase 4 — FlowRunner v1 (gates + skills + ChangeSet stop points + batching) (7–14 days)
### Outcome
End-to-end run executes the required canonical gate chain:

G1 Elements → G2 Tasks Skeleton → G3 Accounting (BOM+qty+labor) →
G4 Pricing (catalog→web→fallback) → G5 Tasks Enrichment →
G6 Ops & Completeness → G7 Pricing Recheck (if needed) →
G8 Quote Snapshot → G9 Final Audit

All write steps produce draft ChangeSets and block for explicit approval.

### Feature flags
- Introduce `ff_flow_runner_v1`.
- Rollout recommendation:
  - Enable for internal projects only at first (optionally add a per-project override later).

### Backend (Convex)
#### New module (add)
- `convex/flow/flowRunner.ts`
  - action `tick(flowRunId)`:
    1) build snapshot
    2) validate current gate (validators run in parallel)
    3) if fail → block + consolidated QuestionsBlock (Phase 3 loop)
    4) if pass → advance gate
    5) if gate requires writing and unblocked → run skill(s) to produce draft ChangeSet(s)
    6) set run status = `awaiting_approval`
    7) after ChangeSet apply → revalidate and continue

### Parallelism & fast UX (required)
The runner must implement "minimize waiting" behavior:
- Always parallel:
  - run all validators for the current gate concurrently
  - pricing lookups per line (bounded concurrency)
- While user is answering questions (blocked state):
  - optionally compute draft ChangeSets for the next 1–2 likely steps and store them as `draft` only
  - drafts must be tagged with `dependsOnIssueKeys[]` so they can be rebased/discarded deterministically when answers arrive

Draft ChangeSet lifecycle (v1.1):
- `draft` (computed, not shown unless debug) → `proposed` (shown to user) → `approved` → `applied`
- drafts must include metadata:
  - `dependsOnIssueKeys[]`
  - `assumptionsUsed[]`

If answers affect a draft dependency, discard or regenerate only the impacted drafts.

#### Batch selection (add)
- ✅ `convex/flow/batching.ts`
  - deterministic batch selection (3–5 elements) based on stable grouping key

#### Skill reuse (existing)
- Use existing skill IDs (already in `convex/skills/registry.ts`):
  - G1 Elements → `ELEMENTS_BUILDER_FULL`
  - G2 Tasks → `TASKS_BUILDER_FULL`
  - G3 Accounting → `ACCOUNTING_BUILDER_FULL`

Add missing core skills (new, required):
- G4 Pricing pipeline (catalog → web → fallback)
  - `PRICING_LOOKUP_CATALOG_BATCH` (new)
  - `PRICING_RESEARCH_WEB_BATCH` (new, only if web enabled)
  - `PRICING_ESTIMATE_FALLBACK_BATCH` (new)
- G5 Tasks enrichment from accounting
  - `TASKS_ENRICH_FROM_ACCOUNTING_BATCH` (new)
- G6 Ops & overhead completeness
  - `OVERHEAD_AND_LOGISTICS_COMPLETER` (new)
- G8 Quote
  - `QUOTE_BUILD_OR_FIX` (new or map to existing `QUOTE_WRITER_FULL` if you keep it)
- G9 Audit
  - `FINAL_AUDIT_FIXER` (new)

#### Integrations (update)
- ✅ Update `convex/flowRuns.ts`:
  - `runNext(flowRunId)` calls `flowRunner.tick`.
  - `applyChangeSetOpsAndContinue(flowRunId, changeSetId, opIndices)` wrapper that applies selected ops then ticks.
  - `discardChangeSetAndContinue(flowRunId, changeSetId)` wrapper that discards then ticks.

#### Flag checks to implement
- `runNext` / `tick` require `ff_flow_runner_v1`.

### Frontend
- ✅ Flow Agent tab shows:
  - current gate + status
  - readiness summary + blocking reasons
  - when draft ChangeSet exists: open existing ChangeSet drawer UI (reuse from `/agent` components)
  - buttons: “Run next”, “Auto-run”, “Use web search”

Required UI additions for v1.1:
- A free-text addendum input (always visible) that appends to `projects.brainDumpRaw` and triggers re-validation.
- A clear blocked state:
  - shows readiness score
  - shows the consolidated QuestionsBlock
  - shows 0–2 optional suggestions with adopt/dismiss actions

### Acceptance tests
- Start new project → flow generates draft elements → approval required.
- Apply → next gates proceed.
- Refresh mid-run → resume works.

New acceptance tests (v1.1 core requirements):
- After accounting is built, the runner performs Tasks Enrichment (G5) before allowing quote.
- Pricing runs in strict order (catalog → web if enabled → fallback) and writes provenance/confidence.
- Ops completeness (G6) creates/ensures required overhead items before quote.

---

## Phase 5 — Pricing + Ops/Overhead completeness gates (7–14 days)
### Outcome
Match the full gate spec for pricing and overhead completeness; reduce quote surprises.

### Pricing pipeline contract (deterministic)
Pricing must follow a strict sequence for every priceable line (material + service + relevant labor rates):
1) Catalog lookup (preferred vendor price)
2) Web research (only if `useWebSearch=true` and flag enabled)
3) Estimation fallback (deterministic heuristics)

Each priced line must record:
- provenance (`pricingSourceCode` or equivalent)
- confidence
- checkedAt
- evidence (URL/note) where available

Staleness rules:
- Define TTL by source type (e.g. web shorter than catalog)
- Validator must emit typed IssueKeys for stale/missing pricing.

### Ops & completeness contract (explicit checklist)
The completeness validator must enforce a deterministic checklist (IssueKeys) for:
- transport runs (to site and back)
- meals per crew/day (if install/build spans mealtimes)
- tools bring-list (power tools, fasteners, ladders, PPE)
- consumables kit (tape, glue, screws, blades, etc.)
- buffer/risk line(s)
- teardown/returns logistics

These can be implemented initially as service/material lines routed to dedicated accounting sections.

### Feature flags
- Introduce:
  - `ff_flow_pricing_gates` (validators)
  - `ff_flow_web_pricing` (web pricing skills)
- Keep `useWebSearch` as a per-run toggle, but require both:
  - `ff_flow_web_pricing` AND `run.toggles.useWebSearch === true`

### Backend
- Add validators:
  - `validateG4Pricing.ts`
  - `validateG6OpsOverhead.ts`
  - `validateG7PricingRecheck.ts`
- Add skills (if missing) or reuse existing web skills behind toggle:
  - catalog lookup skill (existing catalog tables already exist)
  - `RESEARCH_PRICING_ESTIMATES_WEB` (already exists) gated by `useWebSearch`
  - overhead completer skill (new)

### Acceptance tests
- Flow blocks when pricing is missing/stale unless assumptions accepted.
- Flow ensures overhead sections exist before quote.

---

## Phase 6 — Context Manager + progressive disclosure + prompt caching (performance epic) (10–20 days)
### Outcome
Stop sending huge prompts; achieve fast iterations via cache-friendly prompt prefixes.

### Feature flags
- Introduce:
  - `ff_ctx_packs_v1`
  - `ff_prompt_cache`
  - `ff_prompt_cache_24h`
- Rollout recommendation:
  - Enable `ff_prompt_cache` first (safe, minimal behavior change).
  - Enable `ff_ctx_packs_v1` next (bigger behavior change; keep fallback path).
  - Enable `ff_prompt_cache_24h` last (only when you want long-session locality).

### Backend
#### New core modules (add)
- `convex/contextManager/types.ts`
  - `ContextView` enum v1
  - `ContextPackEnvelope` schema
- `convex/contextManager/views/*`
  - one file per view (manifest + slices)
- `convex/contextManager/pull.ts`
  - `ctxPull(view, args)` validated + canonicalized
- `convex/contextManager/recipes.ts`
  - `SkillContextRecipe` registry
- `convex/contextManager/promptBuilder.ts`
  - builds prompts in strict segment order: static prefix → tool bundle → skill spec → manifest → run header → user ask

#### Update LLM call sites (update)
- Update `convex/skills/runner.ts`:
  - replace/augment `buildContext` with `manifest` + `ctxPull` packs
  - set `prompt_cache_key = studioops::<skillId>::<fieldsVersion>::<toolBundleId>`
  - optional `prompt_cache_retention: "24h"` for `gpt-5.2`

#### Telemetry
- You already log traces and UI reads `cached_tokens`. Add:
  - `ctxPull` counts/bytes into trace metadata.

### Frontend
- Add a small “Context Debug” panel in Flow Agent tab:
  - manifests size estimate
  - packs pulled
  - cached_tokens
  - retention mode

### Acceptance tests
- Same flow behavior, but prompt sizes shrink.
- Tracing shows cache hits for repeated skill calls.

---

## Phase 7 — Wizard brain dump + structured extraction (optional after flow is stable)
### Outcome
New projects start with fewer clarification rounds.

### Feature flags
- Introduce `ff_wizard_brain_dump`.
- Keep current wizard behavior unchanged when flag is off.

### Frontend
- Extend project creation UI to include brain dump step.

### Backend
- Add `projects.brainDumpRaw` and `projects.brainDumpStructuredDraft`.
- Add extractor skill (fast) to draft structured brief.

---

# Checklist index (for tracking)
## UI files to add
- [x] `src/app/projects/[id]/flow-agent/page.tsx`
- [ ] `src/app/projects/[id]/flow-agent/_components/FlowRunHeader.tsx`
- [ ] `src/app/projects/[id]/flow-agent/_components/FlowTimeline.tsx`
- [ ] `src/app/projects/[id]/flow-agent/_components/FlowDebugPanel.tsx`

## UI files to update
- [x] `src/app/projects/[id]/layout.tsx` (add Flow Agent tab)

## Convex files to add
- [x] `convex/featureFlags.ts`
- [x] `convex/flowRuns.ts`
- [x] `convex/flowSteps.ts`
- [x] `convex/brainDump.ts`
- [x] `convex/flow/snapshotBuilder.ts`
- [x] `convex/flow/flowRunner.ts`
- [x] `convex/flow/batching.ts`
- [ ] `convex/flow/clarificationPackBuilder.ts`
- [x] `convex/flow/validation/types.ts`
- [x] `convex/flow/validation/readiness.ts`
- [x] `convex/flow/validation/validateG0Brief.ts`
- [x] `convex/flow/validation/validateG1Elements.ts`
- [x] `convex/flow/validation/validateG2Tasks.ts`
- [x] `convex/flow/validation/validateG3Accounting.ts`
- [x] `convex/flow/validation/validateG4Pricing.ts`
- [x] `convex/flow/validation/validateG5TasksEnrichment.ts`
- [x] `convex/flow/validation/validateG6OpsCompleteness.ts`
- [x] `convex/flow/validation/validateG7PricingRecheck.ts`
- [x] `convex/flow/validation/validateG8Quote.ts`
- [x] `convex/flow/validation/validateG9Audit.ts`

## Convex files to update
- [x] `convex/schema.ts` (add flow tables + project fields)
- [ ] `convex/skills/runner.ts` (Phase 6 context manager integration)

---

# Notes / design decisions (repo-specific)
- Use `agentConversations` for Flow Agent as well (avoid legacy `conversations/messages`).
- Keep ChangeSets as the only write mechanism; FlowRunner can only request skills and then block for approval.
- Prefer minimal schema changes early: store v1 reports as `any` and tighten later.
- Avoid "deletes" by using existing `archived` statuses where available.
