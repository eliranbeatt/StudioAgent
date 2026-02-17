# SDK Agent Context Optimization — Full Dev Plan

**Date:** 2026-02-17  
**Status:** PLANNING  
**Goal:** Cut LLM input tokens by 50-70%, reduce errors from context overload, keep prompts short and concise.

---

## Current State Summary

### What exists today

| Component | File | Role |
|-----------|------|------|
| **Orchestrator system prompt** | `sdk/prompts.ts` → `ORCHESTRATOR_SYSTEM` | ~300 lines, sent every LLM call |
| **17 sub-skill prompts** | `sdk/prompts.ts` → `FULL_PROMPTS.*` | Each 40-120 lines, each with full JSON output schema inline |
| **Context fetcher** | `sdk/context.ts` → `get` | Pulls project data by pack names, returns raw JSON objects |
| **Bootstrap builder** | `sdk/dispatch.ts` → `buildBootstrapPrompt()` | Converts context to text for system message. Already uses knowledge doc + compact counts |
| **Context recipes** | `contextManager/recipes.ts` | Skill-aware pack selection (already trimmed from blanket BASE_PACKS) |
| **Project core view** | `contextManager/views/projectCore.ts` | DB queries for packs; already has compact field selection |
| **Knowledge doc** | `sdk/knowledge.ts` | Single source of truth: `memoryDocs(kind='PROJECT_CONTEXT')` — structured Hebrew markdown |
| **Tool result summarizer** | `sdk/dispatch.ts` → `summarizeToolResult()` | Already compresses context.get results, clips large JSON to 2000 chars |
| **Prompt builder** | `contextManager/promptBuilder.ts` | Converts packs to markdown (tables/bullets) instead of raw JSON — used by contextManager only |

### What's already good (don't break these)
1. `buildBootstrapPrompt()` — already uses knowledge doc as primary, shows entity counts, element titles only
2. `summarizeToolResult()` — already compresses context.get, knowledge updates, agent.data
3. `recipes.ts` — already does skill-aware pack selection (not blanket BASE_PACKS)
4. `promptBuilder.ts` — already converts packs to markdown tables
5. `packsForIntent()` in `chatPolicy.ts` — already selects packs based on chat intent
6. Chat mode already uses `buildBootstrapPrompt()` with compact format

### What's still broken / bloated

#### Problem 1: `context.ts` QA pack — 22+ fields per QA pair
```
sdk/context.ts line ~162: res.recentQA = qaPairs.map(qa => ({
  id, projectId, elementId, questionHe, questionText, questionKey,
  answerHe, answerText, status, questionType, options, answer,
  scopeType, scopeKey, sectionPath, blockingLevel, orderKey,
  createdFrom, followUp, triggeredBy, dedupeKey, version, source, createdAt
}))
```
**Impact:** 50 QA pairs × 22 fields = massive JSON blob.  
**Fix:** Trim to 5 essential fields.

#### Problem 2: `context.ts` pricing pack — 200 global records, duplicated
```
sdk/context.ts line ~152: res.pricingCatalog = pricingCatalog;
                          res.pricingLogs = pricingCatalog;  // SAME DATA TWICE
```
**Impact:** Same 200 records sent as both `pricingCatalog` AND `pricingLogs`.  
**Fix:** Remove `pricingLogs` duplicate. Limit to 50 records.

#### Problem 3: `context.ts` workLines — duplicate fields
```
sdk/context.ts line ~90:
  plannedQuantityDays: line.plannedQuantity,  // duplicate of plannedQuantity
  plannedDayRate: line.plannedUnitCost,       // duplicate of plannedUnitCost
```
**Impact:** 4 extra fields per work line that repeat existing values.  
**Fix:** Remove the duplicate aliases.

#### Problem 4: `context.ts` vendors — 200 global records, no project filter
```
sdk/context.ts line ~188: const vendors = await ctx.db.query('vendors').order('desc').take(200);
```
**Impact:** Full vendor dump on every call requesting vendors.  
**Fix:** This pack is unused by current recipes. Remove or scope to project.

#### Problem 5: Non-planning runs still bootstrap with 7 packs
```
sdk/dispatch.ts line ~2068:
  const bootstrapPacks = isChatEditRun
    ? packsForIntent(chatIntent ?? 'project_read_qna', lastUserMsg)
    : ['project', 'elements', 'tasks', 'accounting', 'quote', 'knowledge', 'qa'];
```
**Impact:** Planning mode always loads ALL packs upfront, even though `buildBootstrapPrompt()` only uses knowledge doc + element titles.  
**Fix:** Planning mode bootstrap should also use `['project', 'knowledge', 'elements']` only. Other data via `context.get` tool.

#### Problem 6: `projectCore.ts` sends full task descriptions
```
contextManager/views/projectCore.ts line ~93:
  tasks: tasks.map(t => ({
    ...
    descriptionHe: t.description,  // can be 200+ chars per task
  }))
```
**Impact:** 200 tasks × description = large context in skill calls.  
**Fix:** Clip to 80 chars or omit in compact modes.

#### Problem 7: `projectCore.ts` catalog — 200 templates + 200 variants + 50 prices
```
contextManager/views/projectCore.ts line ~128:
  const materialTemplates = needsCatalog ? await ctx.db.query('materialTemplates').take(200) : []
  const materialVariants = needsCatalog ? await ctx.db.query('materialVariants').take(200) : []
```
**Impact:** Massive catalog dump for pricing-related skills.  
**Fix:** Limit to 20 each for bootstrap, pull more via tool.

#### Problem 8: `runner.ts` sends raw JSON for tool results inside agent loops
```
sdk/runner.ts line ~202:
  messages.push({
    role: 'tool',
    tool_call_id: call.id,
    content: JSON.stringify(result),  // RAW, not summarized like dispatch.ts does
  });
```
**Impact:** Agent sub-tools (clarify, pricing, audit, etc.) accumulate full raw JSON results.  
**Fix:** Use `summarizeToolResult()` in runner.ts too.

#### Problem 9: Orchestrator prompt has 3 overlapping "question behavior" sections
Lines ~60-130 of `ORCHESTRATOR_SYSTEM` contain:
- "Good Question Behavior" section
- "Bad Question Behavior" section  
- "Anti-Generic Question Rules" section
- "The Collaborate Don't Interrogate Rule"

All say the same thing in different ways (~70 lines). Can be 15 lines.

#### Problem 10: Every sub-skill prompt embeds full JSON output schema
Each of the 17 sub-skill prompts contains a full `OUTPUT JSON SHAPE` section with nested schemas that the LLM must parse. These schemas are 15-40 lines each, totaling ~400 lines across all skills.

**Fix:** Move schemas to tool response_format (structured output) or to a separate shared ref doc that the LLM reads only when needed.

---

## Dev Plan: Ordered Implementation

### Phase 1: Data Trim (LOW RISK, HIGH IMPACT) — ~2 hours

These are pure data reduction changes. No prompt or flow logic changes.

#### 1.1 Trim QA pack fields in `context.ts`

**File:** `convex/sdk/context.ts`  
**Lines:** ~162-185 (the `qa` pack)  
**Change:** Reduce from 22 fields to 5:

```ts
// BEFORE (22 fields)
res.recentQA = qaPairs.map((qa) => ({
  id, projectId, elementId, questionHe, questionText, questionKey,
  answerHe, answerText, status, questionType, options, answer,
  scopeType, scopeKey, sectionPath, blockingLevel, orderKey,
  createdFrom, followUp, triggeredBy, dedupeKey, version, source, createdAt
}))

// AFTER (5 fields)
res.recentQA = qaPairs.map((qa) => ({
  questionHe: qa.question_he,
  answerHe: qa.answerText ?? qa.answer_he,
  status: qa.status,
  questionKey: qa.questionKey,
  elementId: qa.elementId,
}))
```

**Also limit count:** `.take(50)` → `.take(20)`

#### 1.2 Remove duplicate fields in workLines

**File:** `convex/sdk/context.ts`  
**Lines:** ~90-105  
**Change:** Remove `plannedQuantityDays` and `plannedDayRate` (they duplicate `plannedQuantity` and `plannedUnitCost`).

#### 1.3 Fix pricing pack duplication

**File:** `convex/sdk/context.ts`  
**Lines:** ~152-155  
**Change:**  
```ts
// BEFORE
res.pricingCatalog = pricingCatalog;
res.pricingLogs = pricingCatalog;  // SAME DATA

// AFTER
res.pricingCatalog = pricingCatalog;
// pricingLogs removed — was duplicate of pricingCatalog
```

Also reduce `.take(200)` to `.take(50)`.

#### 1.4 Trim vendors pack

**File:** `convex/sdk/context.ts`  
**Lines:** ~188-192  
**Change:** Reduce `.take(200)` → `.take(30)`. Remove fields not needed for LLM context.

#### 1.5 Trim catalog limits in projectCore.ts

**File:** `convex/contextManager/views/projectCore.ts`  
**Lines:** ~128-130  
**Change:**  
```ts
// BEFORE
const materialTemplates = needsCatalog ? await ctx.db.query('materialTemplates').take(200) : []
const materialVariants = needsCatalog ? await ctx.db.query('materialVariants').take(200) : []

// AFTER
const materialTemplates = needsCatalog ? await ctx.db.query('materialTemplates').take(30) : []
const materialVariants = needsCatalog ? await ctx.db.query('materialVariants').take(30) : []
```

#### 1.6 Clip task descriptions in projectCore.ts

**File:** `convex/contextManager/views/projectCore.ts`  
**Lines:** ~93-104 (tasks mapping)  
**Change:** Add description clipping:
```ts
descriptionHe: t.description ? t.description.slice(0, 80) : undefined,
```

---

### Phase 2: Bootstrap Lazy Loading (MEDIUM RISK, HIGH IMPACT) — ~2 hours

Make the orchestrator bootstrap lean and teach it to pull data via tools.

#### 2.1 Slim down planning mode bootstrap packs

**File:** `convex/sdk/dispatch.ts`  
**Lines:** ~2068-2070  
**Change:** Planning mode uses same logic as chat mode:

```ts
// BEFORE
const bootstrapPacks = isChatEditRun
  ? packsForIntent(chatIntent ?? 'project_read_qna', lastUserMsg)
  : ['project', 'elements', 'tasks', 'accounting', 'quote', 'knowledge', 'qa'];

// AFTER
const bootstrapPacks = isChatEditRun
  ? packsForIntent(chatIntent ?? 'project_read_qna', lastUserMsg)
  : ['project', 'knowledge', 'elements'];
```

**Reasoning:** `buildBootstrapPrompt()` already only uses:
- `knowledgeDoc` → primary project context
- `elements` → titles for linking
- `project` → name/stage fallback
- Entity counts → but for counts, we can compute them from the 3 above

The orchestrator has `context.get` as a tool and can pull tasks/accounting/qa/quote when it needs them.

#### 2.2 Add count-only query for bootstrap

**File:** `convex/sdk/context.ts`  
**Change:** Add a new lightweight query:

```ts
export const getCounts = query({
  args: { projectId: v.id('projects') },
  handler: async (ctx, args) => {
    const tasks = await ctx.db.query('tasks')
      .withIndex('by_project', q => q.eq('projectId', args.projectId))
      .collect()
    const materialLines = await ctx.db.query('materialLines')
      .withIndex('by_project', q => q.eq('projectId', args.projectId))
      .collect()
    const workLines = await ctx.db.query('workLines')
      .withIndex('by_project', q => q.eq('projectId', args.projectId))
      .collect()
    const qaPairs = await ctx.db.query('qaPairs')
      .withIndex('by_project', q => q.eq('projectId', args.projectId))
      .collect()
    return {
      tasks: tasks.length,
      materialLines: materialLines.length,
      workLines: workLines.length,
      qaPairs: qaPairs.length,
    }
  }
})
```

Use this in `buildBootstrapPrompt()` so it can show counts without loading full data.

#### 2.3 Enhance `buildBootstrapPrompt()` with pull instruction

**File:** `convex/sdk/dispatch.ts`  
**Change:** Make the "USE context.get" instruction more explicit:

```ts
// Add at end of buildBootstrapPrompt():
parts.push('')
parts.push('CONTEXT STRATEGY: This is a summary-only bootstrap.')
parts.push('To get detailed entity data (tasks, accounting, QA, quote), call context.get with the needed packs.')
parts.push('Available packs: project, elements, tasks, accounting, materialLines, workLines, qa, knowledge, quote, pricing, vendors, receipts, runbook')
```

---

### Phase 3: Prompt Compression (LOW RISK, MEDIUM IMPACT) — ~3 hours

Shrink system prompts without changing behavior.

#### 3.1 Consolidate question behavior in orchestrator prompt

**File:** `convex/sdk/prompts.ts`  
**Lines:** ~60-130 of `ORCHESTRATOR_SYSTEM`  
**Change:** Replace the 4 sections (~70 lines):
- "CONVERSATION STYLE (BE A HELPFUL ASSISTANT)" 
- "Good Question Behavior"
- "Bad Question Behavior"  
- "Question Purpose Check"
- "Anti-Generic Question Rules"
- "The Collaborate Don't Interrogate Rule"

With ONE consolidated section (~15 lines):

```
## QUESTION RULES (STRICT)
- Ask 1-3 focused questions per turn. If you need more, produce a draft first and ask after.
- Before asking: "Will knowing this change what I produce?" YES → ask. NO → assume and proceed.
- Never ask generic questions. Always propose a default assumption and ask for confirmation.
  BAD: "מה הגודל?" → GOOD: "אני מניח 3x3 מטר. נכון?"
- State WHY the question matters for the next step.
- Use QuestionsBlock for structured questions. Don't ask in plain text.
- After 2 rounds on same topic: assume and move forward. Tell user your assumption.
```

#### 3.2 Extract shared reference enums to a compact block

Currently duplicated across many prompts:
- Work types (9 items) — repeated in ORCHESTRATOR, PLAN_TASKS, COST_BUDGET
- Stage keys (8 items) — repeated in PLAN_TASKS, PLAN_PHASES, CLARIFY
- Section keys — repeated in COST_BUDGET

**Change:** Create a `SHARED_REF` block at top of prompts.ts:

```ts
export const SHARED_REF = {
  WORK_TYPES: `carpentry→נגרות | metal_fab→מסגרות | paint_finish→צביעה | printing_graphics→גרפיקה | props_sculpt→אביזרים | rigging_install→הקמה | transport_logistics→הובלה | purchasing→רכש | management→ניהול`,
  STAGE_KEYS: `prep | build | finish | qa | pack | transport | install | teardown | management`,
  SECTION_KEYS: `materials_wood | materials_metal | materials_paint | materials_print | materials_props | consumables | packaging | transport | meals | equipment_rental | permits | storage | teardown | management`,
}
```

Then in each prompt that references them:
```
WORK_TYPES: ${SHARED_REF.WORK_TYPES}
```

Instead of the 10-line formatted list.

#### 3.3 Compress output JSON schemas in sub-skill prompts

For each sub-skill, the `OUTPUT JSON SHAPE` section takes 15-40 lines.  

**Strategy:** Don't remove schemas entirely (LLM needs them), but compress to compact inline format:

```
// BEFORE (15 lines):
OUTPUT JSON SHAPE
{
  "elements": [
    {
      "tempId": string,
      "titleHe": string,
      "descriptionHe": string,
      ...12 more fields...
    }
  ],
  "meta": { ... },
  "intent": { ... }
}

// AFTER (5 lines):
OUTPUT: JSON object with:
- elements[]: tempId, titleHe, descriptionHe, categoryHe?, priority(hero|support|optional), buildStrategy(build|buy|rent|subcontract|unknown), dimensions{wCm,hCm,dCm,notesHe}, materialsHe[], finishHe?, constructionMethodHe?, installMethodHe?, safetyNotesHe[], openQuestionsHe[]
- meta: { elementCount, hasUnknownCriticalSpecs }
- intent: { type: "plan.elements_intent", payload: (full elements+meta) }
```

Apply this to all 17 sub-skill prompts. ~300 lines of savings total.

#### 3.4 Trim the COMPLETENESS CHECKLIST in orchestrator

Lines ~210-220: The `COMPLETENESS CHECKLIST (STUDIO REALITY)` section lists items the agent should consider. It's good content but can be compressed:

```
// BEFORE (9 lines with bullets)
// AFTER (2 lines)
COMPLETENESS: Plans must cover when applicable: packaging/protection, loading/unloading, transport, install constraints (access/approvals/rigging), teardown/returns, consumables (tape/screws/adhesives), safety (child/load-bearing/overhead).
```

---

### Phase 4: Tool Result Compression (LOW RISK, MEDIUM IMPACT) — ~1 hour

#### 4.1 Apply `summarizeToolResult()` in runner.ts

**File:** `convex/sdk/runner.ts`  
**Lines:** ~202  
**Change:**

```ts
// BEFORE
messages.push({
  role: 'tool',
  tool_call_id: call.id,
  content: JSON.stringify(result),
});

// AFTER
messages.push({
  role: 'tool',
  tool_call_id: call.id,
  content: summarizeToolResultCompact(toolName, result),
});
```

Add a new `summarizeToolResultCompact()` to a shared util or import the one from dispatch.ts.

#### 4.2 Intent collection summary instead of raw JSON

When the orchestrator tool loop accumulates intents, the `AUTO TOOL RESULT` messages contain full intent payloads. Change to summaries:

**File:** `convex/sdk/dispatch.ts`  
**Lines:** ~2580 (AUTO TOOL RESULT)  

```ts
// BEFORE
content: `AUTO TOOL RESULT (changeset.compile): ${JSON.stringify(compileResult)}`

// AFTER
content: `AUTO TOOL RESULT (changeset.compile): ${compileResult?.changeSetId 
  ? `ChangeSet created (${compileResult.changeSet?.ops?.length ?? 0} ops). ChangeSetId: ${compileResult.changeSetId}` 
  : `Error: ${compileResult?.error ?? 'unknown'}`}`
```

Do the same for `AUTO TOOL RESULT (plan.tasks)`:
```ts
// BEFORE
content: `AUTO TOOL RESULT (plan.tasks): ${JSON.stringify(taskBackfillResult)}`

// AFTER
content: `AUTO TOOL RESULT (plan.tasks): Generated ${taskBackfillResult?.tasks?.length ?? 0} tasks. Intents collected.`
```

---

### Phase 5: History Compression (LOW RISK, LOW-MEDIUM IMPACT) — ~1 hour

#### 5.1 Reduce history window for orchestrator

**File:** `convex/sdk/dispatch.ts`  
**Lines:** ~2050  

```ts
// BEFORE
const historyLimit = 50;

// AFTER
const historyLimit = isChatEditRun ? 15 : 20;
```

50 messages is excessive — especially since each past assistant message can contain full block JSON.

#### 5.2 Strip blocks from history messages

**File:** `convex/sdk/dispatch.ts` — `toPromptMessage()`  
**Lines:** ~970  

Already partially done for chat mode (`summarizeBlocksForPrompt`). Extend to planning mode too:

```ts
// BEFORE
function toPromptMessage(m: any, isChatEditRun: boolean) {
  const text = String(m?.text ?? '').trim();
  if (text) return { role: m.role, content: text };
  if (!isChatEditRun && m?.blocks) {
    return { role: m.role, content: JSON.stringify(m.blocks) };  // ← RAW JSON for planning
  }
  ...
}

// AFTER
function toPromptMessage(m: any, isChatEditRun: boolean) {
  const text = String(m?.text ?? '').trim();
  if (text) return { role: m.role, content: text };
  // Always use compact block summary, never raw JSON
  const blocks = Array.isArray(m?.blocks) ? m.blocks : [];
  const chatLike = summarizeBlocksForPrompt(blocks);
  return { role: m.role, content: chatLike || '' };
}
```

---

### Phase 6: Future / Optional Improvements

#### 6.1 Structured output via `response_format`

Instead of embedding JSON schemas in system prompts, use OpenAI's `response_format: { type: "json_schema", json_schema: ... }` parameter. This moves schema enforcement to the API level and removes ~300 lines from prompts.

**Effort:** High — requires defining JSON schemas programmatically and testing each skill.  
**Benefit:** ~300 lines of prompt savings + more reliable JSON output.

#### 6.2 Unify context.ts and contextManager

Two parallel context-fetching systems exist:
- `sdk/context.ts` → used by orchestrator bootstrap + `context.get` tool
- `contextManager/views/projectCore.ts` → used by vnext pipeline

They have different field selections, different limits, different shapes.

**Fix:** Create a single `contextFetch()` function with a verbosity parameter (`summary | compact | full`) that both systems use.  
**Effort:** High — requires careful migration and testing.

#### 6.3 Token counting instrumentation

Add token counting before each LLM call to log actual input token usage and track optimization impact.

```ts
// Before completionWithTracing:
const estimatedTokens = estimateTokenCount(messages)
await ctx.runMutation(internal.sdk.telemetry.logEvent, {
  runId: args.runId,
  type: 'llm_input_tokens_estimate',
  payload: { estimatedTokens, messageCount: messages.length },
})
```

---

## Implementation Order / Sprint Plan

### Sprint 1 (Do Now — ~4 hours)

| # | Task | File | Impact |
|---|------|------|--------|
| 1.1 | Trim QA fields (22→5) + limit 20 | `sdk/context.ts` | High |
| 1.2 | Remove workLine duplicate fields | `sdk/context.ts` | Low |
| 1.3 | Remove pricingLogs duplicate, limit 50 | `sdk/context.ts` | Medium |
| 1.4 | Trim vendors limit 30 | `sdk/context.ts` | Low |
| 1.5 | Trim catalog limits 30 | `contextManager/views/projectCore.ts` | Medium |
| 1.6 | Clip task descriptions to 80 chars | `contextManager/views/projectCore.ts` | Low |
| 2.1 | Slim planning bootstrap to 3 packs | `sdk/dispatch.ts` | **Very High** |
| 4.1 | Use summarizeToolResult in runner.ts | `sdk/runner.ts` | Medium |
| 5.2 | Strip blocks from history (planning mode) | `sdk/dispatch.ts` | Medium |

**Expected token reduction:** 40-55%

### Sprint 2 (~3 hours)

| # | Task | File | Impact |
|---|------|------|--------|
| 3.1 | Consolidate question behavior sections | `sdk/prompts.ts` | Medium |
| 3.2 | Extract shared ref enums | `sdk/prompts.ts` | Low |
| 3.3 | Compress output JSON schemas | `sdk/prompts.ts` (all 17 skills) | Medium |
| 3.4 | Trim completeness checklist | `sdk/prompts.ts` | Low |
| 4.2 | Compress AUTO TOOL RESULT messages | `sdk/dispatch.ts` | Medium |
| 5.1 | Reduce history limit to 15/20 | `sdk/dispatch.ts` | Low |

**Expected additional token reduction:** 15-25%

### Sprint 3 (When Ready)

| # | Task | Impact |
|---|------|--------|
| 6.1 | Structured output via response_format | Prompt savings + reliability |
| 6.2 | Unify context systems | Maintenance |
| 6.3 | Token counting instrumentation | Observability |

---

## Risk Assessment

| Change | Risk | Mitigation |
|--------|------|------------|
| Slim bootstrap packs (2.1) | Orchestrator may miss data it expected | It has `context.get` tool; prompt tells it to pull |
| QA field trim (1.1) | Some downstream code may read `dedupeKey`, `source` etc. | Check all consumers of `context.get` QA pack |
| History stripping (5.2) | LLM loses past block structure | Block content is already in `text` field; blocks are ephemeral UI |
| Prompt compression (3.x) | LLM behavior may drift | Test common flows after changes |
| Runner tool summarization (4.1) | Agent sub-tools may need full data | Keep full data for intent types, summarize only context fetches |

---

## Measurement Plan

Before/after comparison on a real project run:
1. Count tokens in the `messages` array before each `completionWithTracing` call
2. Compare: bootstrap message size, system prompt size, history size, tool result sizes
3. Track LLM call count per run (should stay same or decrease)
4. Track changeset quality (no regressions)

**Target metrics:**
- Bootstrap context message: **<500 tokens** (from current ~5000-20000)
- System prompt: **<800 tokens** for orchestrator (from current ~3000)
- Per-turn total input: **<8000 tokens** average (from current ~25000-50000)
- Tool loop iterations: **no increase**
