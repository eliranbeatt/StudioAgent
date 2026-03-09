# 15 — Implementation Blueprint: Smart Agent Unification

> **Status**: Future target. Requires planning approval before execution.

## Problem Statement

Two co-existing agent systems create maintenance burden:
- **SDK Agent**: 27 tools in `sdk/registry.ts`, 25 prompts in `sdk/prompts.ts`
- **Skills System**: 37 skills in `skills/registry.ts`, 37 addons in `skills/prompts.ts`

Both systems:
- Share the same database tables
- Have overlapping capabilities (elements, tasks, accounting, pricing, audit)
- Use different context-loading mechanisms (`context.get` vs `agent.data()`)
- Have different prompt architectures (standalone vs shared-header+addon)

## Migration Strategy

### Phase 1: Registry Unification

1. Create unified `ToolDefinition` interface that covers both `sdk/registry.ts` and `skills/registry.ts`
2. Merge tool/skill catalogs into a single registry
3. Keep backward-compatible IDs (existing conversation/run references must still work)

### Phase 2: Prompt Consolidation

1. Extract common rules into a shared prompt layer (like skills' `SHARED_HEADER`)
2. Convert SDK standalone prompts into header+addon format
3. Version prompt library for A/B testing

### Phase 3: Context Layer Unification

1. Merge `context.get` (pack-based) and `agent.data()` (resource+filter) into a single API
2. Support both calling shapes for backward compatibility
3. Optimize data loading with lazy resolution

### Phase 4: Pipeline Manager

1. Replace hardcoded planning flow in `dispatch.ts` with configurable stage pipeline
2. Absorb V3 flow skills into the unified pipeline
3. Support custom pipelines per project type

### Phase 5: Clean Up

1. Remove deprecated code paths
2. Update frontend to use unified agent API
3. Archive old prompt versions

## Key Design Decisions

| Decision | Preferred Option | Rationale |
|----------|-----------------|-----------|
| Tool ID format | Keep existing IDs | Backward compatibility with run history |
| Prompt architecture | Header + addon | More maintainable, proven in skills system |
| Context loading | Pack-based with filter support | Best of both worlds |
| Pipeline config | Stage-based with skip/reorder | Flexible per project type |
| Model selection | Per-tool config (current) | Allows optimization per task complexity |

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Breaking existing runs | High | Keep backward-compatible entry points |
| Prompt regression | Medium | A/B testing with shadowed prompts |
| Data model changes | Low | No schema changes needed |
| Frontend breakage | Medium | Feature flag for gradual rollout |

## Success Criteria

- [ ] Single registry serving both planning and chat modes
- [ ] No duplicate prompt content across files
- [ ] Unified context loading API
- [ ] All existing features functional
- [ ] No increase in average response latency
- [ ] Run telemetry backwards compatible
