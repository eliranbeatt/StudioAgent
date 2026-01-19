Epic: Context Manager + Prompt Caching + Progressive Disclosure
Goals
Reduce prompt size (stop stuffing full project state).
Improve accuracy (skills get exact IDs only when needed).
Reduce latency + cost via prompt caching:
caching works on prompts ≥ 1024 tokens
cache hits need exact prefix match (tools/images too)
docs note “up to 80% latency / 90% input cost reduction” when cached
in-memory retention ~ 5–10 minutes inactivity, up to 1 hour
optional 24h retention available for models including gpt-5.2 via prompt_cache_retention:"24h"
1) Where this is implemented in your system
1.1 New “Context Manager” layer (server-side)
Add a dedicated layer used by every skill call:

Flow Runner → Skill Runner → Context Manager → OpenAI API

The Context Manager owns:

prompt assembly (static prefix first)
manifest creation + canonicalization
context pack pulling rules (recipes)
prompt_cache_key strategy
optional prompt_cache_retention:"24h" for supported models
telemetry (prompt size, cached_tokens)
1.2 What changes in your existing epics
Wizard + Agent tab: no major UI changes required, but you’ll add “Context Packs used” debug.
Validators/Gates: unchanged (still code + deterministic).
Skills: updated to support two-pass (Plan → Apply) when needed.
2) Core architecture decisions
2.1 “Progressive Disclosure” contract (deterministic)
You will always send:

Static Prefix (large, cache-friendly)
Minimal Manifest (small JSON)
User ask + run params (last)
Context Packs only when explicitly pulled
Cache hits require exact prefix matching, so static content + tool schemas must remain identical across requests .

2.2 Two-pass pattern (Plan → Apply) for write skills
Pass A: PLAN (tiny input)

Input: static prefix + manifests only
Output (strict JSON): scope + requiredViews + “why”
No IDs invented. No ChangeSet yet.
Pass B: APPLY (exact slices)

Orchestrator validates scope
Calls ctx.pull() deterministically
Sends only pulled Context Packs
Model outputs ChangeSet referencing only provided IDs
This is the key to: small prompts + exact IDs + determinism.

3) Context Views (the finite enum)
Create a versioned enum of views. No free-form queries.

v1 ContextView enum (starter set)
Manifests

project_manifest_v1
elements_manifest_v1
Element slices

element_full_v1 (by elementId)
elements_full_v1 (by elementIds[])
Tasks

tasks_by_element_v1 (elementIds[])
tasks_manifest_v1 (counts + lastRevision)
Accounting

labor_lines_by_element_v1
material_lines_by_element_v1
service_lines_by_project_v1
accounting_manifest_v1
Quote

quote_manifest_v1
quote_lines_by_element_v1
Catalog & vendors

vendor_catalog_lookup_v1 (by normalizedKey)
catalog_item_v1 (by catalogItemId)
Ops completeness

ops_defaults_v1 (your studio standard defaults/templates)
Determinism requirements
Each view has:
fixed schema
stable ordering (sort by _id)
canonical key order (stable JSON)
revision metadata placed at the end (to preserve cache prefix stability)
4) Tool: ctx.pull(view, args) (server tool)
4.1 Tool schema (strict)
view must be one of the enum strings
args validated:
IDs exist
array limits (e.g., max 10 elementIds per call)
maxItems bounds
4.2 Response envelope (canonical)
view
argsEcho
revision (per domain slice)
data (stable ordering)
schemaVersion (e.g. "ctxpack_v1")
4.3 Canonicalization rules (critical for caching + diffing)
stable object key ordering
stable array ordering
never include timestamps early
include only fields declared in that view schema
5) Skill Context Recipes (server-side map)
Add:

type SkillContextRecipe = {
  skillId: string;
  fieldsVersion: string;              // bump when you change schemas
  toolBundleId: "core"|"pricing_web"|"print_qa"|...; // fixed tool list
  planViews: ContextView[];            // tiny, always
  applyViews: (scope: Scope) => ContextViewRequest[]; // per-element scope
  supportsTwoPass: boolean;
}
Key rule for caching
Each skill has a fixed tool bundle (tools list must be identical between calls for cache hits) .

6) Prompt builder (the caching-first assembly)
6.1 Prompt segments (always in same order)
StudioOps Constitution (static)
Block schemas + ChangeSet schema (static)
Tool schemas (static, from toolBundle)
Skill spec (static per skill)
Manifest JSON (dynamic but small; still after static prefix)
Run header (gateId, batchId, toggles)
User input / task request (last)
This directly follows the docs: cache hits depend on exact prefix; static first, variable last .

6.2 Cache tuning knobs
Always send prompt_cache_key with a stable value like:
studioops::<skillId>::<fieldsVersion>::<toolBundleId>
(so identical prefixes route consistently)
When using gpt-5.2 (or other supported models), optionally set: prompt_cache_retention: "24h" for long workdays on the same skill family
Keep request rate per (prefix+key) reasonable (docs mention overflow above ~15/min harms cache locality)
7) Update your skill flow runner to use Context Manager
7.1 New execution modes per skill
Direct Apply (small scope, scope already known)
Two-pass (scope discovery required or big write skill)
7.2 Deterministic orchestration rules
For write skills:
if batch has ≤ N elements and recipe says “applyViews minimal”: you can skip Plan pass
otherwise run Plan → ctx.pull → Apply
7.3 Server-side post-checks (hard safety)
After model returns ChangeSet:

reject if it references unknown IDs
reject if it references IDs not present in provided Context Packs
reject if it violates invariants (no deletes, elementId required, etc.)
8) UI additions (Wizard + Agent tab + Admin)
8.1 New Project Wizard (minimal additions)
“Brain Dump” stays as planned.
Add a small toggle:
“השתמש בהקשר מצומצם ומהיר (Context Packs)” (default ON)
Step 4 Review: show “Extracted Manifest” summary.
8.2 Agent Tab (debug & trust)
Add a collapsible panel per assistant run:

Manifest size (tokens estimate)
Context Packs pulled (views + counts)
cached_tokens from usage.prompt_tokens_details.cached_tokens
prompt_cache_retention used (“in_memory” or “24h”)
8.3 Admin: “Prompt Context Manager”
Create /admin/context (or extend /admin/skills) with:

ContextView definitions + schema version
Tool Bundles editor (fixed ordering)
SkillContextRecipe editor
Prompt prefix preview (shows what will be cached)
“Diff viewer” between two ctx.pack responses to ensure canonicalization
9) Telemetry + performance instrumentation
Store per LLM call (agentRuns / flowSteps):

model, skillId, gateId
prompt token counts (estimated + actual)
cached_tokens (from API usage)
latency breakdown: prefill vs generation (if available)
ctx.pull counts + bytes
cache hit rate per skill/day
This lets you prove “prompt shrinking” and caching impact.

10) Migration plan (safe rollout)
Phase 1 — Foundations (no skill logic changes yet)
Implement ContextView enum + ctx.pull tool
Canonicalization library for packs
Prompt builder split into segments (static prefix first)
Telemetry of cached_tokens
Phase 2 — Recipes + tool bundles
Define tool bundles (core/pricing_web/etc.) with stable ordering
Add SkillContextRecipe registry
Modify skill runner to build prompts via Context Manager
Phase 3 — Convert 3 high-ROI skills first
Pick:

ACCOUNTING_BOM_AND_LABOR_BATCH
PRICING_LOOKUP_CATALOG_BATCH
TASKS_ENRICH_FROM_ACCOUNTING_BATCH
Convert them to:

minimal manifest input
ctx.pull for scoped elementIds
strict ID rules
Phase 4 — Two-pass for “big/ambiguous” skills
Convert:

Accounting cleanup / dedup / reassignment
Cross-element merge (shared costs/services)
Shopping planner web
Phase 5 — Turn on 24h caching for gpt-5.2 where beneficial
only for long sessions/iterations (same skill family)
keep mini/nano on in-memory if you want (extended list is model-specific)
11) Concrete “where it plugs into your domains”
Elements / Tasks / Accounting / Quote gates
Validators run from manifest + revision counters
When a gate needs writing:
pull only the element slice(s) in scope
apply skill
validate ChangeSet
Pricing / Catalog
Pricing skills pull:
material_lines_by_element_v1
vendor_catalog_lookup_v1 by normalized keys
Web pricing (if enabled) becomes a separate skill/tool bundle to keep cache stability.
Completeness (transport/food/tools/buffer)
completeness validator only needs manifests + install flags
overhead completer pulls only:
service lines + ops defaults
12) Deliverables checklist (implementation-ready)
Backend
[ ] ContextView enum + schemas (versioned)
[ ] ctx.pull(view,args) tool (validated + canonicalized)
[ ] Tool Bundles registry (stable ordering)
[ ] SkillContextRecipe registry
[ ] Prompt builder (static prefix first)
[ ] prompt_cache_key policy + optional 24h retention config
[ ] ChangeSet validator: “IDs must exist in packs”
[ ] Telemetry: cached_tokens, ctx.pull counts
Frontend
[ ] Wizard toggle + manifest preview (small)
[ ] Agent Tab “Context Debug” panel
[ ] Admin Context Manager screen
Skills
[ ] Update top 3 skills to use ctx.pull packs
[ ] Add two-pass templates for complex skills
[ ] Enforce “no invented IDs” prompt guardrail