# Debug: Empty Project Context

## Steps to Diagnose

### 1. Check if PROJECT_CONTEXT doc exists
```javascript
// Run in Convex dashboard
npx convex run sdk/queries:debugProjectContext "{projectId:'YOUR_PROJECT_ID'}"
```

### 2. Check sdkRunEvents for planning flow
```javascript
// Check if upsertPlanAndSeed was called
npx convex run sdk/api:listRunEvents "{runId:'YOUR_RUN_ID', limit:100}"
// Look for events like:
// - 'sdk_vnext_pipeline' (if using vNext)
// - 'sdk_finalize_started'
// - 'stream_knowledge_update_completed'
```

### 3. Check feature flags
```javascript
npx convex run featureFlags:getAll "{}"
// Look for:
// - ff_sdk_vnext_pipeline: true/false
// - ff_sdk_vnext_soft_gates: true/false
```

### 4. Check memoryDocs table directly
```javascript
// In Convex dashboard, run a query:
db.query('memoryDocs')
  .withIndex('by_project_kind', q => 
    q.eq('projectId', 'YOUR_PROJECT_ID')
     .eq('kind', 'PROJECT_CONTEXT')
  )
  .first()
```

### 5. Check raw chat messages for keywords
Look at the actual chat text to see if durable signals were present:
```javascript
npx convex run sdk/api:listMessages "{conversationId:'YOUR_CONV_ID', limit:50}"
```

## Likely Scenarios

1. **vNext is enabled** → Context might be in `stageArtifacts` table instead
2. **Planning flow never called** → Check runEvents for 'draft.plan_and_questions'
3. **All chats skipped** → No durable keywords detected
4. **Schema validation failed** → Check for validation errors in logs
5. **Wrong projectId** → Context might be under different project

## Quick Fix Query

If you need to create a debug query, add this to `convex/sdk/queries.ts`:

```typescript
export const debugProjectContext = query({
  args: { projectId: v.id('projects') },
  handler: async (ctx, args) => {
    const memoryDoc = await ctx.db
      .query('memoryDocs')
      .withIndex('by_project_kind', (q) =>
        q.eq('projectId', args.projectId).eq('kind', 'PROJECT_CONTEXT')
      )
      .first()
    
    const runs = await ctx.db
      .query('sdkRuns')
      .withIndex('by_project', (q) => q.eq('projectId', args.projectId))
      .order('desc')
      .take(5)
    
    const events = await Promise.all(
      runs.map(run => 
        ctx.db.query('sdkRunEvents')
          .withIndex('by_run', q => q.eq('runId', run._id))
          .take(20)
      )
    )
    
    return {
      hasMemoryDoc: !!memoryDoc,
      memoryDoc: memoryDoc ? {
        id: memoryDoc._id,
        schemaVersion: memoryDoc.schemaVersion,
        updatedAt: memoryDoc.updatedAt,
        contentPreview: memoryDoc.contentMd_he?.slice(0, 200)
      } : null,
      recentRuns: runs.map(r => ({
        id: r._id,
        runMode: r.runMode,
        status: r.status,
        stageKey: r.stageKey,
        engine: r.engine
      })),
      eventTypes: events.flat().map(e => e.type)
    }
  }
})
```
