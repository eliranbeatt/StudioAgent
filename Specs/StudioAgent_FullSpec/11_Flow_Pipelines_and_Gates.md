# 11 — Flow Pipelines and Gates

## SDK Planning Flow (PLANNING_FLOW Mode)

The structured planning pipeline operates through `dispatch.ts` and is triggered when a user enters via the SDK Agent tab.

### Pipeline Stages

```mermaid
graph LR
    BD["Brain Dump / Brief"] --> DRAFT["draft.plan_and_questions"]
    DRAFT --> QS["Question Sets (phased)"]
    QS --> ANSWER["User Answers"]
    ANSWER --> MORE{More questions?}
    MORE -->|Yes| QS
    MORE -->|No| BUILD["Build Plan"]
    BUILD --> COMPILE["changeset.compile"]
    COMPILE --> REVIEW["changeset.review"]
    REVIEW --> APPROVE["User Approval"]
    APPROVE --> APPLY["changeset.apply"]
```

### draft.plan_and_questions (Entry Agent)

The planning flow entry point generates:
1. An initial plan skeleton (elements + tasks outline)
2. Phased question sets to refine the plan

Question phases follow a priority order:
1. **Project anchors**: What, where, when, budget, access
2. **Build logic**: Construction methods, materials, finishes
3. **Operations**: Transport, install, teardown, safety
4. **Polish**: Dedup policies, approval gates

### Answer Processing

When the user submits answers:
1. Answers are stored as `qaPairs` in the database
2. The pipeline checks if more questions are needed for the current phase
3. If complete, advances to the build phase
4. The build phase generates changeset ops for elements, tasks, and optionally accounting

## VNext Pipeline (V3 Flow Skills)

A parallel pipeline using the Skills System, operating through 5 defined stages:

```mermaid
graph TD
    subgraph "Stage A — Intake"
        QA["V3_Q_A_INTAKE"] --> BA["V3_BUILD_A_MEMORYDOCS"]
    end
    subgraph "Stage B — Plan"
        QB["V3_Q_B_PLAN"] --> BB["V3_BUILD_B_PLAN"]
        QB --> BBC["V3_BUILD_BC_COMBINED"]
    end
    subgraph "Stage C — Cost"
        QC["V3_Q_C_COST"] --> BC["V3_BUILD_C_ACCOUNTING"]
    end
    subgraph "Stage D — Polish"
        QD["V3_Q_D_POLISH_APPROVALS"] --> BD["V3_BUILD_D_POLISH"]
    end
    subgraph "Stage E — Quote"
        QE["V3_Q_E_QUOTE"] --> BE["V3_BUILD_E_QUOTE"]
    end

    BA --> QB
    BB --> QC
    BBC --> QC
    BC --> QD
    BD --> QE
```

### Stage Details

| Stage | Key | Question Focus | Build Output |
|-------|-----|---------------|--------------|
| A | `brief` | Project anchors, budget, timeline | Memory docs (PROJECT_CONTEXT, QA_DIGEST) |
| B | `scope` / `concept` | Elements, construction methods, materials | Element + Task changeset |
| C | `tasks` / `budget` | Sourcing, install window, crew, transport | Material + Work line changeset |
| D | `pricing` / `ops` | Dedup policy, delete policy, relink, rename | Polish changeset (patch/archive/neutralize) |
| E | `quote` / `audit` | VAT, breakdown, exclusions, payment terms | Quote draft payload |

### VNext Contracts (Typed)

```typescript
const VNEXT_STAGE_ORDER = [
  'brief', 'scope', 'concept', 'tasks', 'budget',
  'pricing', 'ops', 'quote', 'audit', 'compile'
] as const;

type VNextStageKey = (typeof VNEXT_STAGE_ORDER)[number];

type StageArtifactMap = Record<VNextStageKey, {
  questions?: QuestionBlock[];
  answers?: Record<string, string>;
  changeset?: ChangeSetOps;
  metadata?: Record<string, unknown>;
}>;
```

## Skill Execution Gating

### Clarification Gate Flow

```mermaid
graph LR
    REQ["Skill Request"] --> CHECK{requiresClarifications?}
    CHECK -->|Yes| GATE["CLARIFICATIONS_GATE"]
    GATE --> QS["3–8 high-leverage questions"]
    QS --> ANS["User answers"]
    ANS --> RUN["Run target skill"]
    CHECK -->|No| RUN
    RUN --> OUT{outputContract?}
    OUT -->|changeset| CS["Generate ChangeSet"]
    OUT -->|blocks| BL["Render UI Blocks"]
    OUT -->|suggestions| SG["Show Suggestions"]
```

### Gate Priority Rules

1. **Construction method / materials first** — always before logistics
2. **No repeats** — check `qaPairs` + `memoryDocs` for existing answers
3. **Include ≥1 open-ended question** covering missing domains
4. **Stable ASCII `topicKey`** per question for dedup

## Scheduling / Suggestion Engine

Skills declare scheduling hints:

```typescript
scheduling: {
  suggestAfter: ["TASKS_BUILDER_FULL"],   // Show after these skills run
  suggestAtStage: ["planning", "review"]   // Show at these project stages
}
```

The orchestrator uses these hints to populate `SuggestionsBlock` recommendations.
