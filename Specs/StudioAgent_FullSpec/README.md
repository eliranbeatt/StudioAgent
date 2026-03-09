# StudioAgent — Full Spec Documentation

> **Version**: 2.0.0 | **Generated**: 2026-02-21 | **Source**: Code-derived (not hand-written)

Comprehensive architecture documentation for StudioAgent — an AI-powered project management platform for Emi Studio (סטודיו נוי), a Tel-Aviv set-design & fabrication studio.

## Quick Start

| If you want to understand… | Read this |
|---------------------------|-----------|
| What the system does | [00 — System Overview](00_System_Overview.md) |
| How a request flows end-to-end | [01 — Runtime Architecture](01_Runtime_Architecture.md) |
| What pages exist | [02 — App Routes](02_App_Routes_and_User_Flows.md) |
| How the two agent systems compare | [03 — Agent Stacks](03_Agent_Stacks_Comparison.md) |
| What tools the orchestrator has | [04 — Orchestrator Design](04_Orchestrator_Design_Current.md) |
| The database schema | [06 — Data Model](06_Data_Model_Full.md) |
| All 27 SDK tools | [08 — SDK Registry](08_SDK_Registry_and_Tooling.md) |
| All 37 skills | [09 — Skills Registry](09_Skills_Registry_and_Gating.md) |
| All prompts | [10 — Prompts Reference](10_Prompts_Reference.md) |
| Agent pipelines & flows | [11 — Flow Pipelines](11_Flow_Pipelines_and_Gates.md) |
| How changes reach the DB | [12 — ChangeSet Model](12_ChangeSet_and_Approval_Model.md) |
| Accounting in depth | [Appendix C](appendices/C_Accounting_Deep_Dive.md) |

## Contents

### Core Specs (17 files)

| # | File | Description |
|---|------|-------------|
| 00 | [System Overview](00_System_Overview.md) | Architecture, entities, lifecycle, run modes |
| 01 | [Runtime Architecture](01_Runtime_Architecture.md) | Request flow, dispatch, runner, context, telemetry |
| 02 | [App Routes](02_App_Routes_and_User_Flows.md) | 33 routes, 3 user flow diagrams |
| 03 | [Agent Stacks](03_Agent_Stacks_Comparison.md) | SDK Agent vs Skills System, V3 bridge |
| 04 | [Orchestrator (Current)](04_Orchestrator_Design_Current.md) | 27 tools, delegation policy |
| 05 | [Smart Engine (Target)](05_Orchestrator_Design_Target_SmartEngine.md) | Future unified agent vision |
| 06 | [Data Model](06_Data_Model_Full.md) | ~60 tables, ER diagram, enums |
| 07 | [Endpoints Catalog](07_Convex_Endpoints_Catalog.md) | All Convex API endpoints |
| 08 | [SDK Registry](08_SDK_Registry_and_Tooling.md) | 27 tools with models and schemas |
| 09 | [Skills Registry](09_Skills_Registry_and_Gating.md) | 37 skills, gating, scheduling |
| 10 | [Prompts Reference](10_Prompts_Reference.md) | 25 SDK + 37 skill prompts mapped |
| 11 | [Flow Pipelines](11_Flow_Pipelines_and_Gates.md) | Planning flow, V3 pipeline, gates |
| 12 | [ChangeSet Model](12_ChangeSet_and_Approval_Model.md) | 11 ops, compilation, approval |
| 13 | [Telemetry](13_Observability_and_Run_Telemetry.md) | Run lifecycle, events, monitoring |
| 14 | [Security & Config](14_Security_Secrets_and_Config.md) | Auth, secrets, validation |
| 15 | [Smart Agent Blueprint](15_Implementation_Blueprint_Smart_Agent.md) | Unification migration plan |
| 16 | [Acceptance Criteria](16_Acceptance_Criteria_and_Test_Scenarios.md) | 30+ test scenarios |

### Appendices (3 files)

| File | Description |
|------|-------------|
| [A — UI Block Types](appendices/A_UI_Block_Types.md) | 10 block types with JSON schemas |
| [B — Work Types & Stages](appendices/B_Work_Types_and_Stages.md) | Canonical enums with Hebrew labels |
| [C — Accounting Deep Dive](appendices/C_Accounting_Deep_Dive.md) | Line types, pricing, budget aggregation |

### Machine-Readable Snapshots (10 JSON files)

| File | Source | Content |
|------|--------|---------|
| [sdk_registry](snapshots/sdk_registry.snapshot.json) | `sdk/registry.ts` | 27 tools |
| [skills_catalog](snapshots/skills_catalog.snapshot.json) | `skills/registry.ts` | 37 skills + V3 |
| [prompts_inventory](snapshots/prompts_inventory.snapshot.json) | `sdk/prompts.ts` | 25 + 37 prompts |
| [schema_tables](snapshots/schema_tables.snapshot.json) | `schema.ts` | ~60 tables |
| [changeset_ops](snapshots/changeset_ops.snapshot.json) | `changeset.ts` | 15 op kinds |
| [enums](snapshots/enums.snapshot.json) | Multiple | All canonical enums |
| [vnext_contracts](snapshots/vnext_contracts.snapshot.json) | `vnext/contracts.ts` | V3 pipeline |
| [dispatch_functions](snapshots/dispatch_functions.snapshot.json) | `dispatch.ts` | Public + internal functions |
| [app_routes](snapshots/app_routes.snapshot.json) | `src/app/` | 33 routes |
| [sdk_schemas](snapshots/sdk_schemas.snapshot.json) | `schemas.ts` | 27 Zod schemas |

## Statistics

| Metric | Count |
|--------|-------|
| Spec files | 17 |
| Appendices | 3 |
| JSON snapshots | 10 |
| **Total documentation files** | **31** |
| SDK tools documented | 27 |
| Skills documented | 37 + 11 V3 |
| Prompts mapped | 62 |
| Schema tables | ~60 |
| App routes | 33 |
| UI block types | 10 |
| ChangeSet op kinds | 15 |
| Test scenarios | 30+ |
