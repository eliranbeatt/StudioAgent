# agent.data() API Reference

## Overview
The `agent.data()` tool provides structured access to project data with filtering, pagination, and field selection.

**Signature:**
```typescript
agent.data({ resource, projectId?, filters?, fields?, limit?, cursor? })
```

## Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `resource` | string | Yes | The type of data to fetch (see Resources below) |
| `projectId` | Id<"projects"> | No* | Project ID for scoped queries (*required for most resources) |
| `filters` | object | No | Filter criteria (see Filters below) |
| `fields` | string[] | No | Fields to return (defaults provided per resource) |
| `limit` | number | No | Max results (default: 50, max: 200) |
| `cursor` | string \| null | No | Pagination cursor |

## Resources

### 1. `project` - Single Project
**ProjectId**: Required (in args or filters)
**Returns**: Single project details

**Default Fields**: `id`, `name`, `status`, `clientName`, `overviewSummary`, `updatedAt`
**All Fields**: `id`, `name`, `status`, `clientName`, `customerId`, `customerName`, `description`, `overviewSummary`, `details`, `eventDate`, `createdAt`, `updatedAt`

**Supported Filters**:
- `text`: Search in name, description, overviewSummary

---

### 2. `projects` - Multiple Projects (NEW)
**ProjectId**: Not used
**Returns**: List of all projects

**Default Fields**: `id`, `name`, `status`, `clientName`, `overviewSummary`, `updatedAt`
**All Fields**: Same as `project`

**Supported Filters**:
- `status`: Filter by project status
- `text`: Search in name, description, overviewSummary
- `dateFrom`, `dateTo`: Filter by createdAt

**Use Case**: Pull context from other projects

**Example**:
```javascript
// Get all active projects for context
agent.data({ 
  resource: 'projects',
  filters: { status: 'active' },
  limit: 10
})
```

---

### 3. `elements` - Project Elements
**ProjectId**: Required
**Returns**: List of elements

**Default Fields**: `id`, `title`, `status`, `type`, `updatedAt`
**All Fields**: `id`, `projectId`, `title`, `description`, `type`, `status`, `tags`, `order`, `rev`, `createdAt`, `updatedAt`

**Supported Filters**:
- `status`: Filter by element status (uses index)
- `text`: Search in title, description
- `dateFrom`, `dateTo`: Filter by createdAt

---

### 4. `tasks` - Project Tasks
**ProjectId**: Required
**Returns**: List of tasks

**Default Fields**: `id`, `title`, `status`, `stage`, `workType`, `plannedStartDate`, `plannedEndDate`, `updatedAt`
**All Fields**: `id`, `projectId`, `elementId`, `title`, `description`, `status`, `priority`, `category`, `startDate`, `endDate`, `dueDate`, `estimatedHours`, `estimatedMinutes`, `assignee`, `dependencies`, `stage`, `workType`, `workTypeLabelHe`, `plannedStartDate`, `plannedEndDate`, `checklist`, `createdAt`, `updatedAt`

**Supported Filters**:
- `elementId`: Filter by element (uses index, higher priority)
- `status`: Filter by status (uses index if elementId not provided)
- `text`: Search in title, description
- `dateFrom`, `dateTo`: Filter by createdAt

---

### 5. `materialLines` - Material/BOM Lines
**ProjectId**: Required
**Returns**: List of material lines

**Default Fields**: `id`, `itemName`, `quantity`, `plannedUnitCost`, `plannedTotalCost`, `sectionKey`, `taskId`
**All Fields**: `id`, `projectId`, `elementId`, `taskId`, `title`, `itemName`, `spec`, `quantity`, `uomCode`, `plannedUnitCost`, `plannedTotalCost`, `vendorName`, `sectionKey`, `sectionLabelHe`, `createdAt`, `updatedAt`

**Supported Filters**:
- `taskId`: Filter by task (uses index, highest priority)
- `elementId`: Filter by element (uses index if taskId not provided)
- `text`: Search in itemName, title, spec
- `dateFrom`, `dateTo`: Filter by createdAt

---

### 6. `workLines` - Labor/Work Lines
**ProjectId**: Required
**Returns**: List of work lines

**Default Fields**: `id`, `roleHe`, `plannedQuantity`, `plannedUnitCost`, `plannedTotalCost`, `sectionKey`, `taskId`
**All Fields**: `id`, `projectId`, `elementId`, `taskId`, `title`, `roleHe`, `plannedQuantity`, `plannedUnitCost`, `plannedTotalCost`, `status`, `assignee`, `sectionKey`, `sectionLabelHe`, `createdAt`, `updatedAt`

**Supported Filters**:
- `taskId`: Filter by task (uses index, highest priority)
- `elementId`: Filter by element (uses index if taskId not provided)
- `status`: Filter by status (post-query filter)
- `text`: Search in roleHe, title
- `dateFrom`, `dateTo`: Filter by createdAt

---

### 7. `files` - Project Files
**ProjectId**: Required
**Returns**: List of uploaded files

**Default Fields**: `id`, `fileName`, `summary`, `createdAt`
**All Fields**: `id`, `projectId`, `fileName`, `contentType`, `size`, `summary`, `extractedInfo`, `createdAt`

**Supported Filters**:
- `text`: Search in fileName, summary
- `dateFrom`, `dateTo`: Filter by createdAt

**Use Case**: Access uploaded project files, briefs, references

**Example**:
```javascript
// Get all PDF files
agent.data({
  resource: 'files',
  projectId: currentProjectId,
  filters: { text: 'pdf' }
})
```

---

### 8. `qaPairs` - Q&A Pairs (NEW)
**ProjectId**: Required
**Returns**: List of question-answer pairs

**Default Fields**: `id`, `questionHe`, `answerHe`, `createdAt`
**All Fields**: `id`, `projectId`, `elementId`, `questionHe`, `questionKey`, `answerHe`, `createdAt`

**Supported Filters**:
- `elementId`: Filter by element (uses index)
- `text`: Search in questionHe, answerHe
- `dateFrom`, `dateTo`: Filter by createdAt

**Use Case**: Questions agent should always pull these for context

**Example**:
```javascript
// Get all Q&A for context
agent.data({
  resource: 'qaPairs',
  projectId: currentProjectId,
  limit: 200
})
```

---

### 9. `memoryDocs` - Project Context Files (NEW)
**ProjectId**: Required
**Returns**: List of memory documents (context files, running memory, etc.)

**Default Fields**: `id`, `kind`, `title_he`, `contentMd_he`, `createdAt`
**All Fields**: `id`, `projectId`, `elementId`, `kind`, `title_he`, `rawText_he`, `contentMd_he`, `aiSummary`, `source`, `createdAt`, `updatedAt`

**Supported Filters**:
- `kind`: Filter by document kind (uses index, options: `SOURCE_DOC`, `RUNNING_MEMORY`, `QA_DIGEST`, `USER_INPUT_LOG`, `PROJECT_CONTEXT`)
- `elementId`: Filter by element (combined with kind if both provided)
- `text`: Search in title_he, contentMd_he, rawText_he
- `dateFrom`, `dateTo`: Filter by createdAt

**Use Case**: Access project context files, running memory, digests

**Example**:
```javascript
// Get all project context files
agent.data({
  resource: 'memoryDocs',
  projectId: currentProjectId,
  filters: { kind: 'PROJECT_CONTEXT' }
})

// Get element-specific running memory
agent.data({
  resource: 'memoryDocs',
  projectId: currentProjectId,
  filters: { 
    kind: 'RUNNING_MEMORY',
    elementId: 'j97abc123' 
  }
})
```

---

## Filters Object

All filters are optional:

```typescript
{
  projectId?: Id<"projects">,  // For cross-project queries (NEW)
  elementId?: Id<"elements">,  // Filter by element
  taskId?: Id<"tasks">,        // Filter by task
  status?: string,             // Filter by status
  text?: string,               // Text search
  dateFrom?: string,           // ISO date string (inclusive)
  dateTo?: string,             // ISO date string (inclusive)
  kind?: string,               // For memoryDocs filtering (NEW)
}
```

## Cross-Project Queries

You can now query data from **other projects** for context:

### Option 1: Use `filters.projectId`
```javascript
agent.data({
  resource: 'elements',
  filters: { projectId: 'j97otherproject' }
})
```

### Option 2: Use `projects` resource
```javascript
agent.data({
  resource: 'projects',
  filters: { status: 'active' },
  limit: 20
})
```

This is useful for:
- Building recommendations based on past projects
- Pulling pricing data from similar events
- Learning from historical patterns

---

## Filter Priority & Index Usage

Understanding index usage helps optimize queries:

| Resource | Filter Priority | Index Used |
|----------|----------------|------------|
| **elements** | status | `by_project_status` or `by_project` |
| **tasks** | elementId > status | `by_project_element` > `by_project_status` > `by_project` |
| **materialLines** | taskId > elementId | `by_task` > `by_element` > `by_project` |
| **workLines** | taskId > elementId | `by_task` > `by_element` > `by_project` |
| **files** | None | `by_project` |
| **qaPairs** | elementId | `by_project_element` or `by_project` |
| **memoryDocs** | kind+elementId > kind | `by_project_element_kind` > `by_project_kind` > `by_project` |
| **projects** | status | `by_status` or `by_updatedAt` |

**Post-Query Filters** (applied after pagination):
- `text`: Always applied in-memory
- `dateFrom`/`dateTo`: Applied as query filter for ALL resources
- `status` for workLines: Applied in-memory (not indexed)

---

## Response Format

```typescript
{
  data: Array<Record<string, any>>,  // Array of normalized docs
  nextCursor: string | null,         // For pagination
  meta: {
    source: string,                  // "convex"
    fetchedAt: string                // ISO timestamp
  }
}
```

---

## Complete Examples

### Example 1: Get Questions for Current Project
```javascript
const qa = await agent.data({
  resource: 'qaPairs',
  projectId: ctx.projectId,
  limit: 200
})
```

### Example 2: Get Project Context Files
```javascript
const context = await agent.data({
  resource: 'memoryDocs',
  projectId: ctx.projectId,
  filters: { kind: 'PROJECT_CONTEXT' }
})
```

### Example 3: Cross-Project Element Search
```javascript
const similarElements = await agent.data({
  resource: 'elements',
  filters: { 
    projectId: 'j97pastproject',
    status: 'approvedForQuote',
    text: 'backdrop'
  },
  limit: 10
})
```

### Example 4: Get All Files with Pagination
```javascript
let allFiles = []
let cursor = null

do {
  const response = await agent.data({
    resource: 'files',
    projectId: ctx.projectId,
    limit: 50,
    cursor
  })
  
  allFiles = [...allFiles, ...response.data]
  cursor = response.nextCursor
} while (cursor)
```

### Example 5: Get Tasks for Specific Element
```javascript
const tasks = await agent.data({
  resource: 'tasks',
  projectId: ctx.projectId,
  filters: { elementId: 'j97element123' },
  fields: ['id', 'title', 'status', 'plannedStartDate']
})
```

---

## Important Notes

1. **ProjectId Handling**:
   - Can be provided in `args.projectId` OR `filters.projectId`
   - Required for all resources except `projects`
   - `filters.projectId` takes precedence for cross-project queries

2. **Text Search**:
   - Case-insensitive
   - Applied **after** pagination (may return fewer results than limit)
   - Searches multiple fields per resource (see each resource's details)

3. **Pagination**:
   - Always use cursor for large datasets
   - `limit` is clamped to [1, 200], default 50
   - Text filtering happens after pagination

4. **Field Selection**:
   - If `fields` is empty/omitted, uses default fields
   - Invalid fields are silently ignored
   - `id` field is always available

5. **Cross-Project Usage**:
   - Use sparingly for performance
   - Great for recommendations and context
   - Consider caching results when possible
