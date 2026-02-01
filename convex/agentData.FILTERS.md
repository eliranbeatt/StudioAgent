# agentData.ts Filter Logic - TypeScript Reference

## Filter Type Definition

```typescript
const filtersValidator = v.object({
  projectId: v.optional(v.id('projects')), // For cross-project queries
  elementId: v.optional(v.id('elements')),
  taskId: v.optional(v.id('tasks')),
  status: v.optional(v.string()),
  text: v.optional(v.string()),
  dateFrom: v.optional(v.string()),
  dateTo: v.optional(v.string()),
  kind: v.optional(v.string()), // For memoryDocs filtering
})

type Filters = {
  projectId?: string
  elementId?: string
  taskId?: string
  status?: string
  text?: string
  dateFrom?: string
  dateTo?: string
  kind?: string
}
```

## Resource → Filter Switch Logic

```typescript
handler: async (ctx, args) => {
  // Determine the effective projectId (from args or filters)
  const effectiveProjectId = args.projectId || filters.projectId

  // ═══════════════════════════════════════════════════
  // RESOURCE: project (single)
  // ═══════════════════════════════════════════════════
  if (args.resource === 'project') {
    if (!effectiveProjectId) {
      throw new Error('projectId is required for resource "project"')
    }
    const project = await ctx.db.get(effectiveProjectId)
    // Returns single project, NO filters applied (except text search at end)
  }

  // ═══════════════════════════════════════════════════
  // RESOURCE: projects (multiple)  ⭐ NEW
  // ═══════════════════════════════════════════════════
  if (args.resource === 'projects') {
    // No projectId required - queries all projects
    const query = filters.status
      ? ctx.db.query('projects').withIndex('by_status', q => q.eq('status', filters.status))
      : ctx.db.query('projects').withIndex('by_updatedAt', q => q)
    // Supported filters: status
    // Text search: name, description, overviewSummary
  }

  // ═══════════════════════════════════════════════════
  // RESOURCE: elements
  // ═══════════════════════════════════════════════════
  if (args.resource === 'elements') {
    if (filters.status) {
      query = ctx.db
        .query('elements')
        .withIndex('by_project_status', q =>
          q.eq('projectId', effectiveProjectId).eq('status', filters.status)
        )
    } else {
      query = ctx.db
        .query('elements')
        .withIndex('by_project', q => q.eq('projectId', effectiveProjectId))
    }
    // Supported filters: status
    // Ignored filters: elementId, taskId, kind
    // Text search: title, description
  }

  // ═══════════════════════════════════════════════════
  // RESOURCE: tasks
  // ═══════════════════════════════════════════════════
  if (args.resource === 'tasks') {
    if (filters.elementId) {
      query = ctx.db
        .query('tasks')
        .withIndex('by_project_element', q =>
          q.eq('projectId', effectiveProjectId).eq('elementId', filters.elementId)
        )
    } else if (filters.status) {
      query = ctx.db
        .query('tasks')
        .withIndex('by_project_status', q =>
          q.eq('projectId', effectiveProjectId).eq('status', filters.status)
        )
    } else {
      query = ctx.db
        .query('tasks')
        .withIndex('by_project', q => q.eq('projectId', effectiveProjectId))
    }
    // Supported filters: elementId, status (priority: elementId > status)
    // Ignored filters: taskId, kind
    // Text search: title, description
  }

  // ═══════════════════════════════════════════════════
  // RESOURCE: materialLines
  // ═══════════════════════════════════════════════════
  if (args.resource === 'materialLines') {
    if (filters.taskId) {
      query = ctx.db.query('materialLines').withIndex('by_task', q => q.eq('taskId', filters.taskId))
    } else if (filters.elementId) {
      query = ctx.db
        .query('materialLines')
        .withIndex('by_element', q => q.eq('elementId', filters.elementId))
    } else {
      query = ctx.db
        .query('materialLines')
        .withIndex('by_project', q => q.eq('projectId', effectiveProjectId))
    }
    // Supported filters: taskId, elementId (priority: taskId > elementId)
    // Ignored filters: status, kind
    // Text search: itemName, title, spec
  }

  // ═══════════════════════════════════════════════════
  // RESOURCE: workLines
  // ═══════════════════════════════════════════════════
  if (args.resource === 'workLines') {
    if (filters.taskId) {
      query = ctx.db.query('workLines').withIndex('by_task', q => q.eq('taskId', filters.taskId))
    } else if (filters.elementId) {
      query = ctx.db.query('workLines').withIndex('by_element', q => q.eq('elementId', filters.elementId))
    } else {
      query = ctx.db.query('workLines').withIndex('by_project', q => q.eq('projectId', effectiveProjectId))
    }
    // Supported filters: taskId, elementId (priority: taskId > elementId)
    // Special: status filter applied AFTER query (see below)
    // Ignored filters: kind
    // Text search: roleHe, title
  }

  // ═══════════════════════════════════════════════════
  // RESOURCE: files
  // ═══════════════════════════════════════════════════
  if (args.resource === 'files') {
    query = ctx.db.query('projectFiles').withIndex('by_project', q => q.eq('projectId', effectiveProjectId))
    // Supported filters: NONE (only projectId)
    // Ignored filters: elementId, taskId, status, kind
    // Text search: fileName, summary
  }

  // ═══════════════════════════════════════════════════
  // RESOURCE: qaPairs  ⭐ ENHANCED
  // ═══════════════════════════════════════════════════
  if (args.resource === 'qaPairs') {
    if (filters.elementId) {
      query = ctx.db.query('qaPairs').withIndex('by_project_element', q =>
        q.eq('projectId', effectiveProjectId).eq('elementId', filters.elementId)
      )
    } else {
      query = ctx.db.query('qaPairs').withIndex('by_project', q => q.eq('projectId', effectiveProjectId))
    }
    // Supported filters: elementId
    // Ignored filters: taskId, status, kind
    // Text search: questionHe, answerHe
  }

  // ═══════════════════════════════════════════════════
  // RESOURCE: memoryDocs  ⭐ NEW
  // ═══════════════════════════════════════════════════
  if (args.resource === 'memoryDocs') {
    if (filters.kind && filters.elementId) {
      query = ctx.db.query('memoryDocs').withIndex('by_project_element_kind', q =>
        q.eq('projectId', effectiveProjectId).eq('elementId', filters.elementId).eq('kind', filters.kind)
      )
    } else if (filters.kind) {
      query = ctx.db.query('memoryDocs').withIndex('by_project_kind', q =>
        q.eq('projectId', effectiveProjectId).eq('kind', filters.kind)
      )
    } else {
      query = ctx.db.query('memoryDocs').withIndex('by_project', q => q.eq('projectId', effectiveProjectId))
    }
    // Supported filters: kind, elementId (priority: kind+elementId > kind)
    // Ignored filters: taskId, status
    // Text search: title_he, contentMd_he, rawText_he
    // kind values: 'SOURCE_DOC', 'RUNNING_MEMORY', 'QA_DIGEST', 'USER_INPUT_LOG', 'PROJECT_CONTEXT'
  }

  // ═══════════════════════════════════════════════════
  // POST-QUERY FILTERS (applied after initial query)
  // ═══════════════════════════════════════════════════
  
  // When taskId or elementId is used, ensure projectId still matches
  if (filters.taskId || filters.elementId) {
    query = query.filter(q => q.eq(q.field('projectId'), effectiveProjectId))
  }

  // workLines supports status filter (applied post-query)
  if (filters.status && args.resource === 'workLines') {
    query = query.filter(q => q.eq(q.field('status'), filters.status))
  }

  // dateFrom/dateTo applied to ALL resources (except 'project' and 'projects')
  if (dateFrom !== undefined) {
    query = query.filter(q => q.gte(q.field('createdAt'), dateFrom))
  }
  if (dateTo !== undefined) {
    query = query.filter(q => q.lte(q.field('createdAt'), dateTo))
  }

  // Text search applied in-memory AFTER pagination
  const filtered = search
    ? mapped.filter(doc => applyTextFilter(args.resource, doc, search))
    : mapped
}
```

## Text Search Logic Per Resource

```typescript
function applyTextFilter(resource: string, doc: any, search: string) {
  switch (resource) {
    case 'project':
      return textMatch(doc.name, search) || 
             textMatch(doc.description, search) || 
             textMatch(doc.overviewSummary, search)
    
    case 'projects':
      return textMatch(doc.name, search) || 
             textMatch(doc.description, search) || 
             textMatch(doc.overviewSummary, search)
    
    case 'elements':
      return textMatch(doc.title, search) || 
             textMatch(doc.description, search)
    
    case 'tasks':
      return textMatch(doc.title, search) || 
             textMatch(doc.description, search)
    
    case 'materialLines':
      return textMatch(doc.itemName, search) || 
             textMatch(doc.title, search) || 
             textMatch(doc.spec, search)
    
    case 'workLines':
      return textMatch(doc.roleHe, search) || 
             textMatch(doc.title, search)
    
    case 'files':
      return textMatch(doc.fileName, search) || 
             textMatch(doc.summary, search)
    
    case 'qaPairs':
      return textMatch(doc.questionHe, search) || 
             textMatch(doc.answerHe, search)
    
    case 'memoryDocs':
      return textMatch(doc.title_he, search) || 
             textMatch(doc.contentMd_he, search) || 
             textMatch(doc.rawText_he, search)
    
    default:
      return true
  }
}

function textMatch(value: string | undefined, search: string) {
  if (!value) return false
  return value.toLowerCase().includes(search)
}
```

## Key Behavior Summary

| Resource | projectId | Index Filters | Post-Query Filters | Text Search Fields |
|----------|-----------|--------------|--------------------|--------------------|
| **project** | Required (args/filters) | ❌ None | ❌ None | name, description, overviewSummary |
| **projects** | ❌ Not used | ✅ status | ✅ dateFrom, dateTo | name, description, overviewSummary |
| **elements** | Required (args/filters) | ✅ status | ✅ dateFrom, dateTo | title, description |
| **tasks** | Required (args/filters) | ✅ elementId, status | ✅ dateFrom, dateTo | title, description |
| **materialLines** | Required (args/filters) | ✅ taskId, elementId | ✅ dateFrom, dateTo | itemName, title, spec |
| **workLines** | Required (args/filters) | ✅ taskId, elementId | ✅ status, dateFrom, dateTo | roleHe, title |
| **files** | Required (args/filters) | ❌ None | ✅ dateFrom, dateTo | fileName, summary |
| **qaPairs** | Required (args/filters) | ✅ elementId | ✅ dateFrom, dateTo | questionHe, answerHe |
| **memoryDocs** | Required (args/filters) | ✅ kind, elementId | ✅ dateFrom, dateTo | title_he, contentMd_he, rawText_he |

## Critical Implementation Notes

1. **projectId Resolution**:
   ```typescript
   const effectiveProjectId = args.projectId || filters.projectId
   ```
   - Can be provided in EITHER `args.projectId` OR `filters.projectId`
   - `filters.projectId` enables cross-project queries
   - Required for all resources except `projects`

2. **Filter Priority**:
   - Index filters are checked in order (if-else chain)
   - First matching filter wins
   - Example for tasks: `elementId` > `status` > default

3. **Text Filter**:
   - **ALWAYS applied in-memory** after pagination
   - Case-insensitive
   - May return fewer results than `limit`

4. **Date Filters**:
   - Applied as query filters (before pagination)
   - Work on ALL resources except `project` (single) and `projects`
   - Use milliseconds internally: `Date.parse(dateString)`

5. **Status on workLines**:
   - Applied as **post-query filter** (not indexed)
   - This is different from `tasks` and `elements` where status uses an index

6. **memoryDocs kind Values**:
   - `'SOURCE_DOC'` - Uploaded source documents
   - `'RUNNING_MEMORY'` - Ongoing context tracking
   - `'QA_DIGEST'` - Q&A summaries
   - `'USER_INPUT_LOG'` - User input history
   - `'PROJECT_CONTEXT'` - Project-wide context files

## New Capabilities (v2.0)

### ✅ Cross-Project Queries
```typescript
agent.data({
  resource: 'elements',
  filters: { 
    projectId: 'j97otherproject',
    status: 'approvedForQuote'
  }
})
```

### ✅ Query All Projects
```typescript
agent.data({
  resource: 'projects',
  filters: { status: 'active' },
  limit: 50
})
```

### ✅ Access Memory Docs
```typescript
agent.data({
  resource: 'memoryDocs',
  projectId: ctx.projectId,
  filters: { kind: 'PROJECT_CONTEXT' }
})
```

### ✅ Enhanced QA Pairs
```typescript
agent.data({
  resource: 'qaPairs',
  projectId: ctx.projectId,
  filters: { elementId: 'j97element123' }
})
```
