import { action, internalMutation, internalQuery } from './_generated/server'
import { v } from 'convex/values'
import { Id } from './_generated/dataModel'
import { internal } from './_generated/api'

const resourceValidator = v.union(
  v.literal('project'),
  v.literal('elements'),
  v.literal('tasks'),
  v.literal('materialLines'),
  v.literal('workLines'),
  v.literal('files'),
  v.literal('qaPairs'),
  v.literal('memoryDocs'),
  v.literal('projects') // For querying multiple projects
)

const filtersValidator = v.object({
  projectId: v.optional(v.id('projects')), // For cross-project queries
  elementId: v.optional(v.id('elements')),
  taskId: v.optional(v.id('tasks')),
  status: v.optional(v.string()),
  blockingLevel: v.optional(v.string()),
  scopeKey: v.optional(v.string()),
  questionKey: v.optional(v.string()),
  orderKey: v.optional(v.string()),
  text: v.optional(v.string()),
  dateFrom: v.optional(v.string()),
  dateTo: v.optional(v.string()),
  kind: v.optional(v.string()), // For memoryDocs filtering
})

const LIMIT_DEFAULT = 50
const LIMIT_MAX = 200

const ALLOWED_FIELDS: Record<string, string[]> = {
  project: [
    'id',
    'name',
    'status',
    'clientName',
    'customerId',
    'customerName',
    'description',
    'overviewSummary',
    'details',
    'eventDate',
    'createdAt',
    'updatedAt',
  ],
  elements: [
    'id',
    'projectId',
    'title',
    'description',
    'type',
    'status',
    'tags',
    'order',
    'rev',
    'createdAt',
    'updatedAt',
  ],
  tasks: [
    'id',
    'projectId',
    'elementId',
    'title',
    'description',
    'status',
    'priority',
    'category',
    'startDate',
    'endDate',
    'dueDate',
    'estimatedHours',
    'estimatedMinutes',
    'assignee',
    'dependencies',
    'stage',
    'workType',
    'workTypeLabelHe',
    'plannedStartDate',
    'plannedEndDate',
    'checklist',
    'createdAt',
    'updatedAt',
  ],
  materialLines: [
    'id',
    'projectId',
    'elementId',
    'taskId',
    'title',
    'itemName',
    'spec',
    'quantity',
    'uomCode',
    'plannedUnitCost',
    'plannedTotalCost',
    'vendorName',
    'sectionKey',
    'sectionLabelHe',
    'createdAt',
    'updatedAt',
  ],
  workLines: [
    'id',
    'projectId',
    'elementId',
    'taskId',
    'title',
    'roleHe',
    'plannedQuantity',
    'plannedUnitCost',
    'plannedTotalCost',
    'status',
    'assignee',
    'sectionKey',
    'sectionLabelHe',
    'createdAt',
    'updatedAt',
  ],
  files: [
    'id',
    'projectId',
    'fileName',
    'contentType',
    'size',
    'summary',
    'extractedInfo',
    'createdAt',
  ],
  qaPairs: [
    'id',
    'projectId',
    'elementId',
    'questionHe',
    'questionText',
    'questionKey',
    'answerHe',
    'answerText',
    'status',
    'questionType',
    'options',
    'answer',
    'scopeType',
    'scopeKey',
    'sectionPath',
    'blockingLevel',
    'orderKey',
    'createdFrom',
    'followUp',
    'triggeredBy',
    'dedupeKey',
    'version',
    'createdAt',
  ],
  memoryDocs: [
    'id',
    'projectId',
    'elementId',
    'kind',
    'title_he',
    'rawText_he',
    'contentMd_he',
    'aiSummary',
    'source',
    'createdAt',
    'updatedAt',
  ],
  projects: [
    'id',
    'name',
    'status',
    'clientName',
    'customerId',
    'customerName',
    'description',
    'overviewSummary',
    'details',
    'eventDate',
    'createdAt',
    'updatedAt',
  ],
}

const DEFAULT_FIELDS: Record<string, string[]> = {
  project: ['id', 'name', 'status', 'clientName', 'overviewSummary', 'updatedAt'],
  elements: ['id', 'title', 'status', 'type', 'updatedAt'],
  tasks: ['id', 'title', 'status', 'stage', 'workType', 'plannedStartDate', 'plannedEndDate', 'updatedAt'],
  materialLines: ['id', 'itemName', 'quantity', 'plannedUnitCost', 'plannedTotalCost', 'sectionKey', 'taskId'],
  workLines: ['id', 'roleHe', 'plannedQuantity', 'plannedUnitCost', 'plannedTotalCost', 'sectionKey', 'taskId'],
  files: ['id', 'fileName', 'summary', 'createdAt'],
  qaPairs: ['id', 'questionHe', 'answerHe', 'status', 'blockingLevel', 'orderKey', 'createdAt'],
  memoryDocs: ['id', 'kind', 'title_he', 'contentMd_he', 'createdAt'],
  projects: ['id', 'name', 'status', 'clientName', 'overviewSummary', 'updatedAt'],
}

type Filters = {
  projectId?: Id<'projects'>
  elementId?: Id<'elements'>
  taskId?: Id<'tasks'>
  status?: string
  blockingLevel?: string
  scopeKey?: string
  questionKey?: string
  orderKey?: string
  text?: string
  dateFrom?: string
  dateTo?: string
  kind?: string
}

function clampLimit(limit?: number) {
  const raw = Number.isFinite(limit) ? Number(limit) : LIMIT_DEFAULT
  return Math.min(Math.max(raw, 1), LIMIT_MAX)
}

function normalizeFields(resource: string, fields?: string[]) {
  const allowlist = ALLOWED_FIELDS[resource] ?? []
  if (!Array.isArray(fields) || fields.length === 0) return DEFAULT_FIELDS[resource] ?? []
  const set = new Set(allowlist)
  const filtered = fields.filter((field) => set.has(field))
  return filtered.length > 0 ? filtered : DEFAULT_FIELDS[resource] ?? []
}

function pickFields(source: Record<string, any>, fields: string[]) {
  const next: Record<string, any> = {}
  for (const field of fields) {
    if (Object.prototype.hasOwnProperty.call(source, field)) {
      next[field] = source[field]
    }
  }
  return next
}

function toMillis(dateText?: string) {
  if (!dateText) return undefined
  const parsed = Date.parse(dateText)
  return Number.isNaN(parsed) ? undefined : parsed
}

function textMatch(value: string | undefined, search: string) {
  if (!value) return false
  return value.toLowerCase().includes(search)
}

function applyTextFilter(resource: string, doc: any, search: string) {
  switch (resource) {
    case 'project':
      return textMatch(doc.name, search) || textMatch(doc.description, search) || textMatch(doc.overviewSummary, search)
    case 'elements':
      return textMatch(doc.title, search) || textMatch(doc.description, search)
    case 'tasks':
      return textMatch(doc.title, search) || textMatch(doc.description, search)
    case 'materialLines':
      return textMatch(doc.itemName, search) || textMatch(doc.title, search) || textMatch(doc.spec, search)
    case 'workLines':
      return textMatch(doc.roleHe, search) || textMatch(doc.title, search)
    case 'files':
      return textMatch(doc.fileName, search) || textMatch(doc.summary, search)
    case 'qaPairs':
      return (
        textMatch(doc.questionHe, search) ||
        textMatch(doc.questionText, search) ||
        textMatch(doc.answerHe, search) ||
        textMatch(doc.answerText, search)
      )
    case 'memoryDocs':
      return textMatch(doc.title_he, search) || textMatch(doc.contentMd_he, search) || textMatch(doc.rawText_he, search)
    case 'projects':
      return textMatch(doc.name, search) || textMatch(doc.description, search) || textMatch(doc.overviewSummary, search)
    default:
      return true
  }
}

function normalizeProject(project: any) {
  if (!project) return null
  return {
    id: project._id,
    name: project.name,
    status: project.status,
    clientName: project.clientName,
    customerId: project.customerId,
    customerName: project.customerName,
    description: project.description,
    overviewSummary: project.overviewSummary,
    details: project.details,
    eventDate: project.details?.eventDate ?? project.eventDate,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  }
}

function normalizeElement(element: any) {
  return {
    id: element._id,
    projectId: element.projectId,
    title: element.title,
    description: element.description,
    type: element.type,
    status: element.status,
    tags: element.tags,
    order: element.order,
    rev: element.rev,
    createdAt: element.createdAt,
    updatedAt: element.updatedAt,
  }
}

function normalizeTask(task: any) {
  return {
    id: task._id,
    projectId: task.projectId,
    elementId: task.elementId,
    title: task.title,
    description: task.description,
    status: task.status,
    priority: task.priority,
    category: task.category,
    startDate: task.startDate,
    endDate: task.endDate,
    dueDate: task.dueDate,
    estimatedHours: task.estimatedHours,
    estimatedMinutes: task.estimatedMinutes,
    assignee: task.assignee,
    dependencies: task.dependencies,
    stage: task.stage,
    workType: task.workType,
    workTypeLabelHe: task.workTypeLabelHe,
    plannedStartDate: task.plannedStartDate,
    plannedEndDate: task.plannedEndDate,
    checklist: task.checklist,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  }
}

function normalizeMaterialLine(line: any) {
  return {
    id: line._id,
    projectId: line.projectId,
    elementId: line.elementId,
    taskId: line.taskId,
    title: line.title,
    itemName: line.itemName,
    spec: line.spec,
    quantity: line.quantity,
    uomCode: line.uomCode,
    plannedUnitCost: line.plannedUnitCost,
    plannedTotalCost: line.plannedTotalCost,
    vendorName: line.vendorName,
    sectionKey: line.sectionKey,
    sectionLabelHe: line.sectionLabelHe,
    createdAt: line.createdAt,
    updatedAt: line.updatedAt,
  }
}

function normalizeWorkLine(line: any) {
  return {
    id: line._id,
    projectId: line.projectId,
    elementId: line.elementId,
    taskId: line.taskId,
    title: line.title ?? line.roleHe,
    roleHe: line.roleHe,
    plannedQuantity: line.plannedQuantity,
    plannedUnitCost: line.plannedUnitCost,
    plannedTotalCost: line.plannedTotalCost,
    status: line.status,
    assignee: line.assignee,
    sectionKey: line.sectionKey,
    sectionLabelHe: line.sectionLabelHe,
    createdAt: line.createdAt,
    updatedAt: line.updatedAt,
  }
}

function normalizeFile(file: any) {
  return {
    id: file._id,
    projectId: file.projectId,
    fileName: file.fileName,
    contentType: file.contentType,
    size: file.size,
    summary: file.summary,
    extractedInfo: file.extractedInfo,
    createdAt: file.createdAt,
  }
}

function normalizeQaPair(qa: any) {
  const answerText = qa.answerText ?? qa.answer_he
  return {
    id: qa._id,
    projectId: qa.projectId,
    elementId: qa.elementId,
    questionHe: qa.question_he,
    questionText: qa.question_he,
    questionKey: qa.questionKey,
    answerHe: answerText,
    answerText,
    status: qa.status,
    questionType: qa.questionType,
    options: qa.options,
    answer: qa.answer,
    scopeType: qa.scopeType,
    scopeKey: qa.scopeKey,
    sectionPath: qa.sectionPath,
    blockingLevel: qa.blockingLevel,
    orderKey: qa.orderKey,
    createdFrom: qa.createdFrom,
    followUp: qa.followUp,
    triggeredBy: qa.triggeredBy,
    dedupeKey: qa.dedupeKey,
    version: qa.version,
    createdAt: qa.createdAt,
  }
}

function normalizeMemoryDoc(doc: any) {
  return {
    id: doc._id,
    projectId: doc.projectId,
    elementId: doc.elementId,
    kind: doc.kind,
    title_he: doc.title_he,
    rawText_he: doc.rawText_he,
    contentMd_he: doc.contentMd_he,
    aiSummary: doc.aiSummary,
    source: doc.source,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  }
}


export const fetchInternal = internalQuery({
  args: {
    resource: resourceValidator,
    projectId: v.optional(v.id('projects')), // Now optional to support cross-project queries
    filters: v.optional(filtersValidator),
    fields: v.optional(v.array(v.string())),
    limit: v.optional(v.number()),
    cursor: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    const limit = clampLimit(args.limit)
    const cursor = args.cursor ?? null
    const filters: Filters = args.filters ?? {}
    const fields = normalizeFields(args.resource, args.fields)
    const dateFrom = toMillis(filters.dateFrom)
    const dateTo = toMillis(filters.dateTo)
    const search = filters.text ? filters.text.toLowerCase() : undefined

    // Determine the effective projectId (from args or filters)
    const effectiveProjectId = args.projectId || filters.projectId

    const metaBase = {
      source: 'convex',
      fetchedAt: new Date().toISOString(),
    }

    if (args.resource === 'project') {
      if (!effectiveProjectId) {
        throw new Error('projectId is required for resource "project"')
      }
      const project = await ctx.db.get(effectiveProjectId)
      const normalized = normalizeProject(project)
      return {
        data: normalized ? [pickFields(normalized, fields)] : [],
        nextCursor: null,
        meta: metaBase,
      }
    }

    // For 'projects' resource - query multiple projects
    if (args.resource === 'projects') {
      const query = filters.status
        ? ctx.db.query('projects').withIndex('by_status', (q: any) => q.eq('status', filters.status))
        : ctx.db.query('projects').withIndex('by_updatedAt', (q: any) => q)

      const page = await query.order('desc').paginate({ numItems: limit, cursor })
      const mapped = page.page.map((doc: any) => normalizeProject(doc))
      const filtered = search
        ? mapped.filter((doc: any) => applyTextFilter(args.resource, doc, search))
        : mapped
      const data = filtered.map((doc: any) => pickFields(doc, fields))

      return {
        data,
        nextCursor: page.isDone ? null : page.continueCursor,
        meta: metaBase,
      }
    }

    // For all other resources, projectId is required
    if (!effectiveProjectId) {
      throw new Error(`projectId is required for resource "${args.resource}"`)
    }

    let query: any
    if (args.resource === 'elements') {
      if (filters.status) {
        query = ctx.db
          .query('elements')
          .withIndex('by_project_status', (q: any) =>
            q.eq('projectId', effectiveProjectId).eq('status', filters.status)
          )
      } else {
        query = ctx.db
          .query('elements')
          .withIndex('by_project', (q: any) => q.eq('projectId', effectiveProjectId))
      }
    }

    if (args.resource === 'tasks') {
      if (filters.elementId) {
        query = ctx.db
          .query('tasks')
          .withIndex('by_project_element', (q: any) =>
            q.eq('projectId', effectiveProjectId).eq('elementId', filters.elementId)
          )
      } else if (filters.status) {
        query = ctx.db
          .query('tasks')
          .withIndex('by_project_status', (q: any) =>
            q.eq('projectId', effectiveProjectId).eq('status', filters.status)
          )
      } else {
        query = ctx.db
          .query('tasks')
          .withIndex('by_project', (q: any) => q.eq('projectId', effectiveProjectId))
      }
    }

    if (args.resource === 'materialLines') {
      if (filters.taskId) {
        query = ctx.db.query('materialLines').withIndex('by_task', (q: any) => q.eq('taskId', filters.taskId))
      } else if (filters.elementId) {
        query = ctx.db
          .query('materialLines')
          .withIndex('by_element', (q: any) => q.eq('elementId', filters.elementId))
      } else {
        query = ctx.db
          .query('materialLines')
          .withIndex('by_project', (q: any) => q.eq('projectId', effectiveProjectId))
      }
    }

    if (args.resource === 'workLines') {
      if (filters.taskId) {
        query = ctx.db.query('workLines').withIndex('by_task', (q: any) => q.eq('taskId', filters.taskId))
      } else if (filters.elementId) {
        query = ctx.db.query('workLines').withIndex('by_element', (q: any) => q.eq('elementId', filters.elementId))
      } else {
        query = ctx.db.query('workLines').withIndex('by_project', (q: any) => q.eq('projectId', effectiveProjectId))
      }
    }

    if (args.resource === 'files') {
      query = ctx.db.query('projectFiles').withIndex('by_project', (q: any) => q.eq('projectId', effectiveProjectId))
    }

    if (args.resource === 'qaPairs') {
      if (filters.elementId) {
        query = ctx.db.query('qaPairs').withIndex('by_project_element', (q: any) =>
          q.eq('projectId', effectiveProjectId).eq('elementId', filters.elementId)
        )
      } else if (filters.questionKey) {
        query = ctx.db.query('qaPairs').withIndex('by_project_questionKey', (q: any) =>
          q.eq('projectId', effectiveProjectId).eq('questionKey', filters.questionKey)
        )
      } else if (filters.status) {
        query = ctx.db.query('qaPairs').withIndex('by_project_status', (q: any) =>
          q.eq('projectId', effectiveProjectId).eq('status', filters.status)
        )
      } else if (filters.blockingLevel) {
        query = ctx.db.query('qaPairs').withIndex('by_project_blockingLevel', (q: any) =>
          q.eq('projectId', effectiveProjectId).eq('blockingLevel', filters.blockingLevel)
        )
      } else if (filters.scopeKey) {
        query = ctx.db.query('qaPairs').withIndex('by_project_scopeKey', (q: any) =>
          q.eq('projectId', effectiveProjectId).eq('scopeKey', filters.scopeKey)
        )
      } else if (filters.orderKey) {
        query = ctx.db.query('qaPairs').withIndex('by_project_orderKey', (q: any) =>
          q.eq('projectId', effectiveProjectId).eq('orderKey', filters.orderKey)
        )
      } else {
        query = ctx.db.query('qaPairs').withIndex('by_project', (q: any) => q.eq('projectId', effectiveProjectId))
      }
    }

    if (args.resource === 'memoryDocs') {
      if (filters.kind && filters.elementId) {
        query = ctx.db.query('memoryDocs').withIndex('by_project_element_kind', (q: any) =>
          q.eq('projectId', effectiveProjectId).eq('elementId', filters.elementId).eq('kind', filters.kind)
        )
      } else if (filters.kind) {
        query = ctx.db.query('memoryDocs').withIndex('by_project_kind', (q: any) =>
          q.eq('projectId', effectiveProjectId).eq('kind', filters.kind)
        )
      } else {
        query = ctx.db.query('memoryDocs').withIndex('by_project', (q: any) => q.eq('projectId', effectiveProjectId))
      }
    }

    if (!query) {
      return { data: [], nextCursor: null, meta: metaBase }
    }

    if (filters.taskId || filters.elementId) {
      query = query.filter((q: any) => q.eq(q.field('projectId'), effectiveProjectId))
    }

    if (filters.status && args.resource === 'workLines') {
      query = query.filter((q: any) => q.eq(q.field('status'), filters.status))
    }

    if (args.resource === 'qaPairs') {
      if (filters.status) {
        query = query.filter((q: any) => q.eq(q.field('status'), filters.status))
      }
      if (filters.blockingLevel) {
        query = query.filter((q: any) => q.eq(q.field('blockingLevel'), filters.blockingLevel))
      }
      if (filters.scopeKey) {
        query = query.filter((q: any) => q.eq(q.field('scopeKey'), filters.scopeKey))
      }
      if (filters.orderKey) {
        query = query.filter((q: any) => q.eq(q.field('orderKey'), filters.orderKey))
      }
    }

    if (dateFrom !== undefined) {
      query = query.filter((q: any) => q.gte(q.field('createdAt'), dateFrom))
    }
    if (dateTo !== undefined) {
      query = query.filter((q: any) => q.lte(q.field('createdAt'), dateTo))
    }

    const page = await query.order('desc').paginate({ numItems: limit, cursor })

    const mapped = page.page.map((doc: any) => {
      switch (args.resource) {
        case 'elements':
          return normalizeElement(doc)
        case 'tasks':
          return normalizeTask(doc)
        case 'materialLines':
          return normalizeMaterialLine(doc)
        case 'workLines':
          return normalizeWorkLine(doc)
        case 'files':
          return normalizeFile(doc)
        case 'qaPairs':
          return normalizeQaPair(doc)
        case 'memoryDocs':
          return normalizeMemoryDoc(doc)
        default:
          return doc
      }
    })

    const filtered = search
      ? mapped.filter((doc: any) => applyTextFilter(args.resource, doc, search))
      : mapped

    const data = filtered.map((doc: any) => pickFields(doc, fields))

    return {
      data,
      nextCursor: page.isDone ? null : page.continueCursor,
      meta: metaBase,
    }
  },
})

export const logAccess = internalMutation({
  args: {
    projectId: v.optional(v.id('projects')), // Optional for cross-project queries
    resource: resourceValidator,
    filters: v.optional(filtersValidator),
    fields: v.optional(v.array(v.string())),
    limit: v.optional(v.number()),
    cursor: v.optional(v.union(v.string(), v.null())),
    resultCount: v.number(),
    status: v.union(v.literal('success'), v.literal('error')),
    latencyMs: v.number(),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert('agentDataLogs', {
      projectId: args.projectId ?? undefined as any, // Allow undefined
      resource: args.resource,
      filters: args.filters,
      fields: args.fields,
      limit: args.limit,
      cursor: args.cursor ?? undefined,
      resultCount: args.resultCount,
      status: args.status,
      latencyMs: args.latencyMs,
      error: args.error,
      createdAt: Date.now(),
    })
  },
})

export const fetch = action({
  args: {
    resource: resourceValidator,
    projectId: v.optional(v.id('projects')), // Optional for cross-project queries
    filters: v.optional(filtersValidator),
    fields: v.optional(v.array(v.string())),
    limit: v.optional(v.number()),
    cursor: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    const startedAt = Date.now()
    try {
      const result = await ctx.runQuery(internal.agentData.fetchInternal, args)
      await ctx.runMutation(internal.agentData.logAccess, {
        projectId: args.projectId,
        resource: args.resource,
        filters: args.filters,
        fields: args.fields,
        limit: args.limit,
        cursor: args.cursor ?? undefined,
        resultCount: result.data.length,
        status: 'success',
        latencyMs: Date.now() - startedAt,
      })
      return result
    } catch (e: any) {
      await ctx.runMutation(internal.agentData.logAccess, {
        projectId: args.projectId,
        resource: args.resource,
        filters: args.filters,
        fields: args.fields,
        limit: args.limit,
        cursor: args.cursor ?? undefined,
        resultCount: 0,
        status: 'error',
        latencyMs: Date.now() - startedAt,
        error: e?.message ?? String(e),
      })
      throw e
    }
  },
})
