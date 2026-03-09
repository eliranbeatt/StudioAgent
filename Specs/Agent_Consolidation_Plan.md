# Agent Consolidation Plan: Keep Only the SDK Agent

> **Goal:** Remove the Old Agent (v1) and Flow Agent systems entirely, keeping only the SDK Agent.  
> **Risk Level:** High — requires fixing hidden cross-dependencies before any deletion.  
> **Approach:** Fix first, then delete. Never delete before patching dependents.

---

## System Map

### The 3 Agent Systems

| System | Route | In Nav? | Backend | Status |
|---|---|---|---|---|
| **Old Agent (v1)** | `/agent/` | ❌ No | `convex/agent.ts` (2171 lines) | 🗑️ Remove |
| **Flow Agent** | `/flow-agent/` | ❌ No | `convex/flow/` + `convex/flowRuns.ts` | 🗑️ Remove |
| **SDK Agent** | `/sdk-agent/` | ✅ Yes | `convex/sdk/` (28+ files) | ✅ Keep |

---

## ⚠️ Critical Problems the Naive Plan Would Miss

These are the issues that would cause build/runtime errors if you simply started deleting files:

### TRAP 1 — `overview/page.tsx` calls `api.agent.createElementFromStructured`
**File:** `src/app/projects/[id]/overview/page.tsx` (L25, L525)  
**Problem:** The Overview page (a LIVE, USED page) calls `api.agent.createElementFromStructured` — a function in `agent.ts`. Deleting `convex/agent.ts` breaks the Overview page.  
**Fix:** Move `createElementFromStructured` from `convex/agent.ts` → `convex/elements.ts` (alongside other element mutations), then update the import in `overview/page.tsx`.

---

### TRAP 2 — `studio/page.tsx` calls 8 functions from `api.agent.*`
**File:** `src/app/projects/[id]/studio/page.tsx` (L42–L58)  
**Problem:** The `/studio/` page calls `api.agent.listConversations`, `createConversation`, `appendUserMessage`, `cancelRunningAgent`, `agentRespond`, etc. This is a full-featured page using the old agent.  
**Fix options:**
- **Option A (Recommended):** Delete the `/studio/` route — it is likely the old agent's UI reimplemented. Check if it is accessible from navigation before deciding.
- **Option B:** Refactor to use SDK agent APIs.

Check `layout.tsx` to confirm if `/studio/` is in nav before choosing.

---

### TRAP 3 — `ChangeSetReviewDrawer` lives inside `/agent/` but is imported by `/flow-agent/`
**File:** `src/app/projects/[id]/flow-agent/page.tsx` (L13) and `_components/FlowChat.tsx` (L16)  
**Problem:** The `ChangeSetReviewDrawer` component lives at `agent/_components/ChangeSetReviewDrawer.tsx`. If you delete the `/agent/` folder while the `/flow-agent/` route still exists, you get import errors.  
**Fix:** Move `ChangeSetReviewDrawer.tsx` to `src/app/projects/[id]/_components/` before deleting `/agent/`. Update both import sites.

---

### TRAP 4 — `test_chat.ts` and `test_hello_world.ts` call `internal.skills.registry.seedSkills`
**Files:** `convex/test_chat.ts` (L27), `convex/test_hello_world.ts` (L17)  
**Problem:** These Convex functions call `internal.skills.registry.seedSkills`. Deleting `convex/skills/` will cause Convex to fail to bundle.  
**Fix:** Delete or refactor both test files before removing `convex/skills/`.

---

### TRAP 5 — `convex/skills/runner.ts` references `internal.flow.flowRunner.tick`
**File:** `convex/skills/runner.ts` (L998)  
**Problem:** The skills runner calls into the flow runner. This is an internal cross-reference. When both are deleted together this is fine, but the order matters — delete `skills/` and `flow/` in the same Convex deployment (or `skills/` first).

---

### TRAP 6 — Schema tables are relied on by Convex's `_generated/` types
**Problem:** Convex generates TypeScript types from the schema. Removing table definitions from `schema.ts` while backend code still references those table names (e.g., `ctx.db.insert("conversations", ...)`) causes compile errors.  
**Fix:** Always remove all backend code referencing a table BEFORE removing the table from `schema.ts`. Schema cleanup is always the LAST step.

---

### TRAP 7 — `agent_tasks.ts` imports from `api` but is a standalone file
**File:** `convex/agent_tasks.ts`  
**Problem:** It imports `api` but calls `ctx.db.query("tasks")` directly. It is NOT dependent on `agent.ts`. However, it calls `api` (not `api.agent.*`), so it will survive. It is a standalone mutation file.  
**Fix:** Keep it — it's independent of the agent system.

---

## Execution Order (Phase by Phase)

> **Rule:** Run `npm run build` after every phase. Do NOT proceed to the next phase if there are errors.

---

### Phase 0: Audit the `/studio/` Route

**Before doing anything else,** check whether `/studio/` is in the navigation.

```bash
grep -r "studio" src/app/projects/\[id\]/layout.tsx
```

- **If `/studio/` IS in nav:** This is an active feature. Do NOT delete it. Refactor it to call SDK APIs instead (complex — treat as a separate workstream).
- **If `/studio/` is NOT in nav:** It's a dead route. Safe to delete the entire `src/app/projects/[id]/studio/` folder in Phase 1.

---

### Phase 1: Fix Cross-Imports (Do This Before Any Deletions)

These changes make the codebase safe to delete from.

#### 1a. Move `createElementFromStructured` out of `agent.ts`

1. Find the function in `convex/agent.ts` at line 1839.
2. Copy the full mutation into `convex/elements.ts` (the elements module).
3. In `src/app/projects/[id]/overview/page.tsx` (L25), change:
   ```ts
   // BEFORE
   const createElementFromStructured = useMutation(api.agent.createElementFromStructured);
   // AFTER
   const createElementFromStructured = useMutation(api.elements.createElementFromStructured);
   ```
4. Build and verify the Overview page still works.

#### 1b. Move `ChangeSetReviewDrawer` to shared location

1. Move `src/app/projects/[id]/agent/_components/ChangeSetReviewDrawer.tsx` → `src/app/projects/[id]/_components/ChangeSetReviewDrawer.tsx`
2. Update imports in:
   - `src/app/projects/[id]/flow-agent/page.tsx` (L13): `'../_components/ChangeSetReviewDrawer'`
   - `src/app/projects/[id]/flow-agent/_components/FlowChat.tsx` (L16): `'../../_components/ChangeSetReviewDrawer'`
3. Build to confirm.

#### 1c. Fix `test_chat.ts` and `test_hello_world.ts`

These files call `internal.skills.registry.seedSkills`. Before you delete `convex/skills/`, do one of:
- **Delete both test files** (if they are not part of any test suite you run).
- **Or** comment out the `internal.skills.*` calls.

Check if they are referenced in `package.json` scripts:
```bash
grep -n "test_chat\|test_hello" package.json
```

---

### Phase 2: Delete Old Agent Frontend

All files safe to delete once Phase 1 is done:

```
src/app/projects/[id]/agent/
  page.tsx
  _components/AgentChat.tsx
  _components/SkillsDock.tsx
  _components/ElementsRail.tsx
  _components/ChangeSetReviewDrawer.tsx   ← Already moved in Phase 1
  _components/Blocks/                     ← 10 files
```

> Also delete `src/app/projects/[id]/studio/` if confirmed dead in Phase 0.

**Verify:** `npm run build` must pass.

---

### Phase 3: Delete Flow Agent Frontend

```
src/app/projects/[id]/flow-agent/
  page.tsx
  _components/FlowRunHeader.tsx
  _components/FlowTimeline.tsx
  _components/FlowDebugPanel.tsx
  _components/FlowQuestionsLane.tsx
  _components/FlowElementsHealthPanel.tsx
  _components/FlowWorkflowGpsPanel.tsx
  _components/FlowChat.tsx
  _components/Blocks/                     ← 4 files
```

**Verify:** `npm run build` must pass.

---

### Phase 4: Delete Backend — Skills System

Delete in this order (skills first, since it depends on flow):

```
convex/skills/
  runner.ts    ← 43.7 KB
  actions.ts   ← 46 KB
  prompts.ts   ← 50.3 KB
  registry.ts  ← 35.6 KB
  recommender.ts
  tags.ts
```

**Prerequisite:** Phase 1c must be complete (test files fixed).  
**Verify:** `npx convex dev` must show no bundling errors.

---

### Phase 5: Delete Backend — Flow Agent

Delete all flow-related backend files:

**Root-level files:**
```
convex/flowRuns.ts          ← 33 KB
convex/flowAnswers.ts       ← 8.5 KB
convex/flowSteps.ts
convex/flowNodeRuns.ts
convex/flowChangeSetApplyLogs.ts
convex/brainDump.ts
```

**Directory:**
```
convex/flow/
  flowRunner.ts
  flowRunnerV3.ts
  orchestrator.ts
  clarificationPackBuilder.ts
  snapshotBuilder.ts
  brainDumpExtractor.ts       ← No longer needed after brainDump.ts is gone
  api.ts
  audit.ts
  chat.ts
  questionSets.ts
  artifactRevisions.ts
  nodeRunners.ts
  planning.ts
  graph.ts
  gates.ts
  validation/                 ← 12 files
  + any remaining files
```

**Verify:** `npx convex dev` must show no bundling errors.

---

### Phase 6: Delete Backend — Old Agent Core

Delete remaining old agent backend files (all calls to these were patched in Phase 1):

```
convex/agent.ts             ← 2,171 lines — the big one
convex/agentData.ts         ← 22 KB
convex/agentData.FILTERS.md
convex/agentData.README.md
```

**Verify:** `npm run build` AND `npx convex dev` must both pass cleanly.

---

### Phase 7: Schema Cleanup (Separate Deployment — Data is Destructive)

> ⚠️ **WARN BEFORE THIS PHASE.** Removing tables from `schema.ts` permanently drops all existing data in those tables. Back up any data of value first.

**Tables to remove from `convex/schema.ts`:**

| Table | Why Remove |
|---|---|
| `conversations` | Old agent chat sessions |
| `conversationMessages` | Old agent messages |
| `messages` | Legacy messages (old agent) |
| `structuredAnswers` | Old agent Q&A |
| `flowRuns` | Flow agent |
| `flowSteps` | Flow agent |
| `flowArtifactRevisions` | Flow agent |
| `flowNodeRuns` | Flow agent |
| `flowAnswerEvents` | Flow agent |
| `flowQuestionSets` | Flow agent |
| `flowQuestionSetResponses` | Flow agent |
| `flowChangeSetApplyLogs` | Flow agent |
| `flowAuditRuns` | Flow agent |
| `flowRunTimelineEvents` | Flow agent |
| `skills` | Skills system |
| `skillRuns` | Skills system |
| `clarificationSessions` | Skills system |

**Tables to KEEP:**

| Table | Reason |
|---|---|
| `agentConversations` | SDK Agent primary sessions |
| `agentMessages` | SDK Agent messages |
| `sdkRuns` | SDK Agent runs |
| `sdkRunEvents` | SDK run events |
| `sdkStageArtifacts` | SDK stage artifacts |
| `sdkStageDecisions` | SDK stage decisions |
| `sdkProjectState` | SDK per-project state |
| `qaPairs` | SDK planning Q&A |
| `changeSets` | Core — used system-wide |
| `memoryDocs` | Knowledge system |
| `llmTraces` | Observability |
| `agentDataLogs` | Query logging |
| `skillToolLogs` | Tool call logs (referenced by SDK) |
| `projectLinks`, `projectDigests` | Overview / knowledge system |

---

### Phase 8: Clean Up Feature Flags

Once everything is removed, clean up the now-dead feature flags.

**In `convex/featureFlags.ts`** (or wherever `DEFAULT_FLAGS` is defined), remove:
- `ff_flow_agent_tab`
- `ff_flow_agent_backend`
- `ff_flow_runner_v1`
- `ff_flow_runner_v2`

Keep:
- `ff_sdk_agent_tab`

---

## File-by-File Summary

### Frontend Files to DELETE

```
src/app/projects/[id]/agent/               ← Entire folder (15 files)
src/app/projects/[id]/flow-agent/          ← Entire folder (12 files)
src/app/projects/[id]/studio/              ← Entire folder (if confirmed dead)
```

### Frontend Files to MODIFY

```
src/app/projects/[id]/overview/page.tsx       L25 — change api.agent.* → api.elements.*
src/app/projects/[id]/_components/            ← New shared folder
  ChangeSetReviewDrawer.tsx                   ← Moved here from agent/_components/
```

### Backend Files to DELETE

```
convex/agent.ts                     ← 2,171 lines
convex/agentData.ts
convex/agentData.FILTERS.md
convex/agentData.README.md
convex/brainDump.ts
convex/flowRuns.ts                  ← 33 KB
convex/flowAnswers.ts
convex/flowSteps.ts
convex/flowNodeRuns.ts
convex/flowChangeSetApplyLogs.ts
convex/skills/                      ← 6 files (~184 KB)
convex/flow/                        ← 30 files (~130 KB)
convex/test_chat.ts                 ← If not in test suite
convex/test_hello_world.ts          ← If not in test suite
```

### Backend Files to MODIFY

```
convex/elements.ts       ← Add migrated createElementFromStructured mutation
convex/schema.ts         ← Remove 17 tables (Phase 7, separate deployment)
convex/featureFlags.ts   ← Remove dead flow flags (Phase 8)
```

### Backend Files to KEEP (SDK Agent — Do Not Touch)

```
convex/sdk/              ← All 28+ files
convex/agentTurns.ts
convex/agent_tasks.ts    ← Independent utility, unrelated to agents
convex/changeSets.ts
convex/elements.ts
convex/tasks.ts
convex/accounting.ts
convex/memory.ts
convex/featureFlags.ts   ← Keep, just remove dead flag entries
```

---

## Verification Checklist

Run these checks after each phase:

- [ ] `npm run build` — zero TypeScript errors
- [ ] `npx convex dev` — schema validates, functions register
- [ ] Navigate to `/projects/[id]/overview` — Elements create button works
- [ ] Navigate to `/projects/[id]/sdk-agent` — both tabs render
- [ ] SDK Agent: Start a Project Planning flow — works end to end
- [ ] SDK Agent: Chat mode — sends message, receives response
- [ ] SDK Agent: ChangeSets — proposal + approval works
- [ ] Navigate to `/projects/[id]/agent` — returns 404 (not 500)
- [ ] Navigate to `/projects/[id]/flow-agent` — returns 404 (not 500)
- [ ] `npm run test:sdk` — passes

---

## Effort Estimate

| Phase | Effort | Risk |
|---|---|---|
| Phase 0: Audit studio route | 15 min | Low |
| Phase 1: Fix cross-imports | 2–3 hrs | High (most critical) |
| Phase 2–3: Frontend deletions | 30 min | Low |
| Phase 4–6: Backend deletions | 1 hr | Medium |
| Phase 7: Schema cleanup | 1 hr | High (irreversible) |
| Phase 8: Feature flag cleanup | 30 min | Low |
| **Total** | **~5–6 hrs** | |
