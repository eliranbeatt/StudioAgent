# True Agent (Flow Agent) — Test Plan v1 (Full Coverage)

Date: 2026-01-19

## 1) Purpose
This test plan validates the **Flow Agent** end-to-end experience (new tab + resumable runs + deterministic gates/validators + clarification loop + ChangeSet approvals), including **feature flags**, **data integrity invariants**, **pricing pipeline**, and **context/prompt performance**.

## 2) In-Scope Features (by phase)
### Phase 0 — Foundations
- Feature flags stored in `appSettings` as `key="featureFlags"` with JSON `value`.
- Shared type system for gates/issues/reports (as implemented).

### Phase 1 — Flow Agent tab + FlowRuns skeleton + Brain Dump
- New route: `/projects/[id]/flow-agent`.
- Tab visibility gated by `ff_flow_agent_tab`.
- Backend APIs gated by `ff_flow_agent_backend`.
- Resumable `flowRuns` and `flowSteps` persisted across refresh.
- Brain Dump panel:
  - Append and update behavior on `projects.brainDumpRaw`.
  - Free-text addendum always available; appends to `brainDumpRaw`.
  - Logs to `memoryDocs.kind="USER_INPUT_LOG"` (append + replace; replace may truncate log text).
  - Triggers re-validation (or schedules it).

### Phase 2 — Snapshot builder + deterministic validators v1 + extractor
- Deterministic snapshot building.
- Deterministic validation reports (typed IssueKeys, stable ordering).
- Readiness scoring formula is correct and stable.
- Minimal brain dump extractor writes `projects.brainDumpStructuredDraft` without breaking determinism.

### Phase 3 — Consolidated Clarification Pack + unknown/assumptions persistence
- One consolidated QuestionsBlock (max 6 required + 0–2 optional).
- Multi-round clarification loop until readiness >= 0.95 or user forces proceed.
- Answer persistence via `qaPairs` (questionKey = IssueKey).
- Unknown/assumption acceptance persistence in project.
- Suggestions lane: “never suggest again” (dismiss) only (adopt not implemented in UI).

### Phase 4 — FlowRunner v1 (gates + skills + ChangeSet stop points + batching)
- Deterministic gate order G0..G9.
- Skills produce ChangeSets only; canon changes only after explicit approval.
- Draft → proposed → approved → applied lifecycle.
- Batch selection is deterministic and stable.
- Runner supports “Run next”, “Auto-run” toggle, “Use web search” toggle.
- After every apply: re-validate then proceed.

### Phase 5 — Pricing + Ops/Overhead completeness gates
- Strict pricing sequence: catalog → web (optional) → fallback.
- Writes provenance + `checkedAt` + confidence + evidence (where available).
- Staleness rules + validator IssueKeys for stale/missing.
- Ops completeness checklist enforced (transport, meals, tools, consumables, buffer, teardown/returns).

### Phase 6 — Context Packs + prompt caching + telemetry
- Context Packs (`ctx.pull`) and manifest ordering.
- Prompt caching keys and optional 24h retention for `gpt-5.2`.
- Tracing shows cache hits and `cached_tokens`.

### Phase 7 — Wizard brain dump (optional)
- New project wizard brain dump step behind `ff_wizard_brain_dump`.

## 3) Out of Scope
- Performance tuning beyond validating telemetry correctness.
- Admin-only RBAC hardening (noted as “future” in spec) unless already implemented.
- Automated test suite creation if repo has none; this plan can be executed manually and/or via ad-hoc scripts.

## 3.1) Implementation-aligned notes (as of 2026-01-20)
- `flowRuns.start` does not de-dupe active runs; multiple concurrent runs can be created.
- Default toggles for new runs: `autoRun=false`, `useWebSearch=false`.
- `useWebSearch` is forced to `false` when `ff_flow_web_pricing` is off.
- Clarification QuestionsBlock only filters by blocking issues; suggestions come from `report.opportunities` and support “never suggest again” only.
- Readiness penalties for “unknown accepted” only apply if validators emit `metrics.unknownAcceptedCriticalCount` (currently not set).
- “Force proceed below readiness” is not exposed in the UI yet.
- Flow Agent UI includes English labels for “Auto-run” and “Web search” (localization gap).

## 4) Non-Negotiable Invariants to Validate
1) Fixed gate order and deterministic progression.
2) Validators return typed IssueKeys; no free-form “missing” labels.
3) Skills never write canon directly; they return ChangeSets (+ optional Questions).
4) Canon changes only after explicit user approval (line-by-line allowed).
5) After every apply: re-validate and proceed.
6) No deletes (archive only).
7) Every task links to `elementId` OR explicit project-global scope.
8) Every accounting line links to `elementId` OR explicit overhead scope.
9) Pricing includes provenance + `checkedAt` + confidence + evidence (when available).
10) User-facing UI in **Hebrew**; internal prompts/instructions in **English**.

## 5) Test Environments
- Local dev (Next.js + Convex dev): primary.
- Staging: verify flags, resumability across deploy.
- Production (feature-flagged): smoke-only until enabled.

### Required toggles / feature flags
- `ff_flow_agent_tab`
- `ff_flow_agent_backend`
- `ff_flow_validators_v1`
- `ff_flow_clarification_pack_v1`
- `ff_flow_runner_v1`
- `ff_flow_pricing_gates`
- `ff_flow_web_pricing`
- `ff_ctx_packs_v1`
- `ff_prompt_cache`
- `ff_prompt_cache_24h`
- `ff_wizard_brain_dump`

## 6) Test Data Setup (Projects)
Create a small set of canonical projects to cover edge cases.

- **P0 Empty**: new project with no elements/tasks/accounting.
- **P1 Minimal**: 1 element, 1 task, minimal accounting lines.
- **P2 Multi-element**: 8–12 elements for deterministic batching tests.
- **P3 Pricing-heavy**: many priceable lines across vendors, with some stale timestamps.
- **P4 Ops-heavy**: install/multi-day scenario requiring meals/logistics/returns.
- **P5 Ambiguous brief**: relies on brain dump/clarifications to reach readiness.

## 7) Execution Modes
- Manual UI validation (primary).
- Direct Convex function validation via dashboard / scripts where applicable.
- Optional: Playwright/Cypress (only if already present; otherwise not required).

## 8) Test Matrix

### A) Feature Flags
**FF-01** Default flags all false
- Preconditions: `appSettings.featureFlags` missing or empty.
- Steps: Load project layout.
- Expected:
  - Flow Agent tab hidden.
  - Direct navigation to `/flow-agent` shows “disabled” state.

**FF-02** UI enabled, backend disabled
- Preconditions: `ff_flow_agent_tab=true`, `ff_flow_agent_backend=false`.
- Steps: Open Flow Agent tab; click Start.
- Expected: Friendly error; no run created.

**FF-03** Backend enabled, UI disabled
- Preconditions: `ff_flow_agent_tab=false`, `ff_flow_agent_backend=true`.
- Steps: Navigate directly to Flow Agent route.
- Expected: disabled UI state (still), despite backend available.

**FF-04** Validator gating
- Preconditions: backend enabled; `ff_flow_validators_v1=false`.
- Steps: Start run; attempt validation compute.
- Expected: validation endpoints reject or no-op deterministically (per implementation); UI shows safe fallback.

**FF-05** Runner gating
- Preconditions: validators on; `ff_flow_runner_v1=false`.
- Steps: Try “Run next”.
- Expected: blocked with friendly “runner disabled” error; no skill calls.

### B) Flow Agent Tab Routing & UI Basics
**UI-01** Tab appears only when enabled
- Steps: Toggle `ff_flow_agent_tab` on/off.
- Expected: Tab presence matches flag.

**UI-02** Hebrew UI
- Steps: Inspect all user-facing labels/statuses/errors on Flow Agent page.
- Expected: Hebrew strings for statuses and actions; note current English labels for “Auto-run” and “Web search” as localization gaps.

**UI-03** Disabled route state
- Steps: Navigate to `/projects/:id/flow-agent` with tab flag off.
- Expected: simple disabled state; no crash.

### C) FlowRuns Lifecycle (Phase 1)
**RUN-01** Start creates run + initial step
- Steps: Click Start.
- Expected:
  - `flowRuns` created with status `running` (or initial state per implementation).
  - `flowSteps` contains a first step for the current gate.
  - `toggles.autoRun=false`, `toggles.useWebSearch=false`.

**RUN-02** Refresh resumes
- Steps: Start; refresh browser.
- Expected: same active run visible; no duplicate run.

**RUN-03** Pause/resume
- Steps: Start → Pause → Resume.
- Expected: status transitions correct; timestamps update; step history preserved.

**RUN-04** Cancel
- Steps: Start → Cancel.
- Expected: status `cancelled`; runner cannot advance.

**RUN-05** Concurrency safety
- Steps: Open same project in 2 tabs; attempt Start in both.
- Expected: both runs can be created; active run selection resolves to the most recent active run (no hard de-dupe).

**RUN-06** Error surfacing
- Steps: Force backend error (e.g., invalid projectId).
- Expected: status becomes `failed` with readable error; UI displays blocking reason.

### D) Brain Dump + Free Text Addendum (Phase 1)
**BD-01** Append brain dump
- Steps: Enter text; click Add.
- Expected: `projects.brainDumpRaw` appended (preserving existing); updated timestamp shown.

**BD-02** Update brain dump
- Steps: Click Update/Replace (if supported).
- Expected: `projects.brainDumpRaw` set to exact new content; audit expectations met.

**BD-03** Addendum always available
- Steps: During any run status, submit addendum.
- Expected: append performed; UI remains responsive.

**BD-04** Re-validation trigger
- Steps: Add addendum while blocked.
- Expected: validators recompute (immediate or queued), and blocking issues update deterministically.

**BD-05** Optional user input log
- Steps: Submit addendum.
- Expected: `memoryDocs` entry created with kind `USER_INPUT_LOG`.

### E) Snapshot Builder Determinism (Phase 2)
**SNAP-01** Stable ordering
- Steps: Build snapshot twice for same project state.
- Expected: identical JSON (byte-equivalent) or identical semantic ordering (explicitly defined).

**SNAP-02** Ignores non-canonical noise
- Steps: Add unrelated docs/logs.
- Expected: snapshot unchanged (unless intended).

### F) Validators v1 (Phase 2)
**VAL-01** Empty project emits stable IssueKeys
- Project: P0 Empty.
- Expected: known set of IssueKeys with stable ordering and severities.

**VAL-02** Partial project improves readiness deterministically
- Project: P1 Minimal.
- Expected: readinessScore increases; removed issues are not present.

**VAL-03** Readiness scoring formula
- Steps: Construct a report with known severities and contradictions.
- Expected: readinessScore matches formula:
  - CRITICAL -0.25, HIGH -0.12, MEDIUM -0.06, LOW -0.02
  - contradictions -0.20 (when `metrics.contradictionCount > 0`)
  - unknownAccepted on CRITICAL -0.10 only when `metrics.unknownAcceptedCriticalCount` is present (currently not emitted by validators)

**VAL-04** Gate-specific invariants
- G1 Elements: elements coverage rules enforced.
- G2 Tasks: tasks exist and link to elementId or project-global explicitly.
- G3 Accounting: all lines link to elementId or overhead scope.
- G4 Pricing: missing/stale prices produce typed IssueKeys.
- G6 Ops: missing overhead checklist items produce typed IssueKeys.

### G) Brain Dump Extractor v1 (Phase 2)
**EXT-01** Extractor writes draft
- Steps: Run extractor.
- Expected: `projects.brainDumpStructuredDraft` is updated.

**EXT-02** Extractor determinism
- Steps: Run extractor twice with same brainDumpRaw.
- Expected: same structured output.

**EXT-03** Validators remain deterministic
- Steps: Run validators before/after extractor.
- Expected: validator results only change if they are defined to read structured draft; no nondeterministic drift.

### H) Clarification Pack + Multi-round Loop (Phase 3)
**CL-01** Consolidated pack limits
- Preconditions: multiple blocking issues.
- Expected: <= 6 required questions; optional suggestions 0–2.

**CL-02** Stable selection rules
- Steps: Same snapshot; rebuild pack.
- Expected: same questions in same order.

**CL-03** Submit answers persists
- Steps: Answer all required.
- Expected: `qaPairs` written with `questionKey=IssueKey`; run revalidates.

**CL-04** Not re-asked after answer
- Steps: Recompute pack.
- Expected: answered IssueKeys are not asked again.

**CL-05** Accept unknown on CRITICAL
- Steps: Choose “לא יודע” for a CRITICAL issue.
- Expected: stored in `projects.unknownAcceptedKeys`; readiness penalty only applies if validators set `metrics.unknownAcceptedCriticalCount` (currently not wired).

**CL-06** Accept assumption
- Steps: Accept assumption value (Hebrew).
- Expected: stored in `projects.assumptionsAccepted` with timestamp; issue not re-asked.

**CL-07** Force proceed below readiness
- Steps: User chooses to proceed despite readiness < 0.95.
- Expected: not available in UI yet; verify absence or treat as future behavior.

**CL-08** Suggestions dismiss / never suggest again
- Steps: Click “לא להציע שוב”.
- Expected: `dismissedOppKeys` updated; suggestion not shown again.

### I) FlowRunner v1 + Skills + ChangeSets (Phase 4)
**FR-01** Fixed gate order
- Steps: Run through multiple gates.
- Expected: cannot skip; deterministic `currentGateId` progression.

**FR-02** Skill writes are ChangeSet-only
- Steps: Run a writing gate.
- Expected: skill returns ChangeSet(s); canonical tables unchanged until approval.

**FR-03** Awaiting approval stop point
- Steps: After skill completes.
- Expected: run status `awaiting_approval`; UI shows ChangeSet review.

**FR-04** Apply ChangeSet then re-validate
- Steps: Approve/apply ChangeSet.
- Expected: canonical updates; validators rerun; next gate proceeds.

**FR-05** Reject/Discard ChangeSet
- Steps: Discard proposed ChangeSet.
- Expected: run stays blocked/awaiting; can regenerate deterministically.

**FR-06** Draft lifecycle metadata
- Steps: Generate drafts.
- Expected: metadata is optional; if present, drafts store `dependsOnIssueKeys` and `assumptionsUsed` (not required in current implementation).

**FR-07** Deterministic batching
- Project: P2 Multi-element.
- Steps: Select batch twice.
- Expected: same elementIds batch for same project state.

**FR-08** Auto-run behavior
- Steps: Enable autoRun.
- Expected: runner advances until blocked/awaiting approval; never applies changes automatically.

**FR-09** Web pricing toggle enforcement
- Steps: Enable useWebSearch but disable `ff_flow_web_pricing`.
- Expected: web skills not called; pricing uses catalog/fallback only; validator messaging correct.

### J) Pricing + Ops Gates (Phase 5)
**PR-01** Strict pricing order
- Steps: Run pricing on missing lines.
- Expected: catalog attempted first; only then web (if allowed); then fallback.

**PR-02** Provenance fields
- Expected on each priced line: provenance/source code, `checkedAt`, confidence, evidence (URL/note).

**PR-03** Staleness
- Steps: Set `checkedAt` older than TTL.
- Expected: validator emits typed stale IssueKey; runner rechecks pricing.

**OPS-01** Ops checklist completeness
- Steps: Run ops completeness.
- Expected: missing items generate typed IssueKeys and/or completer ChangeSet proposals.

### K) Context Packs + Prompt Caching + Tracing (Phase 6)
**CTX-01** Packs pulled reflect manifest
- Steps: Run a skill requiring context.
- Expected: trace includes packs pulled, byte counts; prompt built in defined order.

**CACHE-01** Cache key stability
- Steps: Same skill called twice with same static prefix/tool bundle.
- Expected: identical `prompt_cache_key`.

**CACHE-02** 24h retention only for `gpt-5.2`
- Steps: Call with supported model.
- Expected: `prompt_cache_retention: "24h"` only when enabled and model matches.

**TRACE-01** cached_tokens displayed
- Steps: Run repeated calls.
- Expected: tracing UI shows `cached_tokens` increasing on cache hits.

### L) Wizard Brain Dump (Phase 7)
**WZ-01** Wizard step behind flag
- Steps: Toggle `ff_wizard_brain_dump`.
- Expected: wizard step appears/disappears with no impact to existing wizard when off.

## 9) Regression Tests (Existing Agent Tab)
- Ensure `/projects/[id]/agent` remains unchanged:
  - conversations render
  - skills dock runs existing skills
  - ChangeSet drawer works
  - no new flags break the legacy tab

## 10) Negative/Security Tests
- Backend rejects FlowRuns APIs when `ff_flow_agent_backend=false`.
- Unauthorized updates to flags (if admin-only is not implemented yet, record this as a known risk).
- Validate inputs:
  - brainDumpRaw size limits (if any)
  - flowRunId/projectId access control
  - prevent cross-project run access

## 11) Non-Functional Tests
- Resilience:
  - Refresh during running/blocked/awaiting approval.
  - Network interruption during Start/Pause/Resume.
- Determinism:
  - repeatability of validator reports and question packs.
- Performance:
  - snapshot build time on P3/P4.
  - bounded concurrency for pricing lookups.

## 12) Test Reporting Template
For each failure record:
- Test ID
- Project (P0–P5)
- Flags state
- Steps performed
- Actual vs expected
- Screenshots (UI) / trace IDs (backend)
- Proposed fix / suspected module

## 13) Exit Criteria (v1)
- All Phase 1 tests pass on dev.
- Determinism tests (snapshot + validators + question packs) pass on P0–P5.
- No regressions on existing Agent tab.
- Pricing/Ops gates produce typed IssueKeys and correct provenance fields.
- Tracing shows `cached_tokens` and (when enabled) ctxPull metrics.
