# 07 — Convex Endpoints Catalog

> Source files: `convex/sdk/*.ts`, `convex/skills/*.ts`, `convex/*.ts`

## SDK Agent Endpoints

### Entry Points (`sdk/dispatch.ts`)

| Export | Type | Purpose |
|--------|------|---------|
| `startRun` | action | Main entry: create run, parse input, execute pipeline |
| `handleUserMessage` | action | Process user message in existing conversation |
| `submitAnswers` | action | Submit QA answers during planning flow |
| `approveChangeSet` | action | Approve pending changeset |
| `rejectChangeSet` | action | Reject pending changeset |
| `cancelRun` | action | Cancel active run |
| `regenerateQuestions` | action | Trigger manual question regeneration |

### LLM Runner (`sdk/runner.ts`)

| Export | Type | Purpose |
|--------|------|---------|
| `runTool` | action | Execute a single tool from REGISTRY |

### ChangeSet (`sdk/changeset.ts`)

| Export | Type | Purpose |
|--------|------|---------|
| `compile` | action | Transform intents → ChangeSet ops |
| `review` | action | Validate compiled ChangeSet |
| `apply` | action | Execute approved ChangeSet (DB writes) |

### Context (`sdk/context.ts`)

| Export | Type | Purpose |
|--------|------|---------|
| `get` | query | Fetch project data by configurable packs |
| `getCounts` | query | Get entity counts for project |
| `addKnowledge` | mutation | DEPRECATED (no-op) |

### Knowledge (`sdk/knowledge.ts`)

| Export | Type | Purpose |
|--------|------|---------|
| `summarizeOrUpdate` | action | Update project knowledge document |

### Telemetry (`sdk/telemetry.ts`)

| Export | Type | Purpose |
|--------|------|---------|
| `createRun` | internalMutation | Create sdkRuns record |
| `updateRunState` | internalMutation | Update run status/stage |
| `clearPendingChangeSet` | internalMutation | Reset approval state |
| `appendMessage` | internalMutation | Insert agentMessages |
| `getRunMessages` | query | Fetch conversation messages |
| `logEvent` | internalMutation | Insert sdkRunEvents |

### Schemas (`sdk/schemas.ts`)

| Export | Type | Purpose |
|--------|------|---------|
| `SDK_SCHEMAS` | Record | 27 Zod schema validators |
| `validateSdkOutput` | function | Validate tool output against schema |
| `assertAsciiKeys` | function | Ensure JSON keys are ASCII only |

## Skills System Endpoints

### Skills Registry (`skills/registry.ts`)

| Export | Type | Purpose |
|--------|------|---------|
| `SKILL_CATALOG` | const | Array of 37 SkillDefinition objects |
| `getSkillCatalog` | query | Fetch skill catalog for frontend |
| `getSkillById` | query | Fetch single skill definition |
| `seedSkills` | mutation | Initialize skills in DB |

### Skills Runner (`skills/actions.ts`)

| Export | Type | Purpose |
|--------|------|---------|
| `runSkill` | action | Execute a skill by ID |
| `runSkillForProject` | action | Execute skill with project context |

## VNext Pipeline (`sdk/vnext/`)

| File | Key Export | Purpose |
|------|-----------|---------|
| `contracts.ts` | `VNEXT_STAGE_ORDER`, types | Stage definitions + typed contracts |
| `compiler.ts` | `compileDeterministicChangeSet` | Deterministic changeset compilation |
| `specBuilder.ts` | `buildTargetPlanSpec` | Build planning spec from project data |
| `pipeline.ts` | Pipeline orchestration | Stage management + artifact tracking |
| `validators.ts` | Validation utilities | Input/output validation |
