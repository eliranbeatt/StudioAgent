import { Id } from '../_generated/dataModel'

export type ProjectSnapshotV1 = {
  projectId: Id<'projects'>
  project: {
    name: string
    description?: string
    notes?: string
    overviewSummary?: string
    brainDumpRaw?: string
    updatedAt: number
    createdAt: number
  }
  elements: Array<{
    id: Id<'elements'>
    title: string
    type: string
    status: string
    updatedAt: number
    createdAt: number
  }>
  tasks: Array<{
    id: Id<'tasks'>
    title: string
    elementId?: Id<'elements'>
    description?: string
    status?: string
    stage?: string
    workType?: string
    estimatedHours?: number
    estimatedMinutes?: number
    accountingLinks?: Array<{ lineType: string; lineId: string }>
    updatedAt?: number
    createdAt: number
  }>
  materialLines: Array<{
    id: Id<'materialLines'>
    elementId?: Id<'elements'>
    taskId?: Id<'tasks'>
    sectionKey?: string
    itemName?: string
    quantity?: number
    uomCode?: string
    plannedUnitCost?: number
    plannedTotalCost?: number
    pricingSourceCode?: string
    priceUrl?: string
    priceCheckedAt?: number
    confidence?: number
    actualUnitCost?: number
    actualTotalCost?: number
    workType?: string
    createdAt: number
    updatedAt?: number
  }>
  workLines: Array<{
    id: Id<'workLines'>
    elementId?: Id<'elements'>
    taskId?: Id<'tasks'>
    sectionKey?: string
    roleHe?: string
    plannedQuantity?: number
    plannedUnitCost?: number
    plannedTotalCost?: number
    crewSize?: number
    workType?: string
    isManagement?: boolean
    confidence?: number
    createdAt: number
    updatedAt?: number
  }>
  quoteVersions: Array<{
    id: Id<'quoteVersions'>
    status: string
    version?: number
    currency?: string
    totals?: any
    quoteText_he?: string
    quoteBlocks?: any
    createdAt: number
  }>
  counts: {
    elements: number
    tasks: number
    materialLines: number
    workLines: number
    quoteVersions: number
  }
}

export async function buildProjectSnapshot(
  ctx: any,
  projectId: Id<'projects'>
): Promise<ProjectSnapshotV1> {
  const project = await ctx.db.get(projectId)
  if (!project) throw new Error('Project not found')

  const elements = await ctx.db
    .query('elements')
    .withIndex('by_project', (q: any) => q.eq('projectId', projectId))
    .collect()

  const tasks = await ctx.db
    .query('tasks')
    .withIndex('by_project', (q: any) => q.eq('projectId', projectId))
    .collect()

  const quoteVersions = await ctx.db
    .query('quoteVersions')
    .withIndex('by_project', (q: any) => q.eq('projectId', projectId))
    .collect()

  const materialLines = await ctx.db
    .query('materialLines')
    .withIndex('by_project', (q: any) => q.eq('projectId', projectId))
    .collect()

  const workLines = await ctx.db
    .query('workLines')
    .withIndex('by_project', (q: any) => q.eq('projectId', projectId))
    .collect()

  const elementsSorted = elements
    .slice()
    .sort((a: any, b: any) => {
      const ao = typeof a.order === 'number' ? a.order : Number.MAX_SAFE_INTEGER
      const bo = typeof b.order === 'number' ? b.order : Number.MAX_SAFE_INTEGER
      if (ao !== bo) return ao - bo
      return String(a._id).localeCompare(String(b._id))
    })

  const tasksSorted = tasks
    .slice()
    .sort((a: any, b: any) => {
      const ae = a.elementId ? String(a.elementId) : ''
      const be = b.elementId ? String(b.elementId) : ''
      if (ae !== be) return ae.localeCompare(be)
      return String(a._id).localeCompare(String(b._id))
    })

  const quoteVersionsSorted = quoteVersions
    .slice()
    .sort((a: any, b: any) => {
      const at = typeof a.createdAt === 'number' ? a.createdAt : 0
      const bt = typeof b.createdAt === 'number' ? b.createdAt : 0
      if (at !== bt) return bt - at
      return String(a._id).localeCompare(String(b._id))
    })

  const materialLinesSorted = materialLines
    .slice()
    .sort((a: any, b: any) => {
      const ae = a.elementId ? String(a.elementId) : ''
      const be = b.elementId ? String(b.elementId) : ''
      if (ae !== be) return ae.localeCompare(be)

      const at = a.taskId ? String(a.taskId) : ''
      const bt = b.taskId ? String(b.taskId) : ''
      if (at !== bt) return at.localeCompare(bt)

      return String(a._id).localeCompare(String(b._id))
    })

  const workLinesSorted = workLines
    .slice()
    .sort((a: any, b: any) => {
      const ae = a.elementId ? String(a.elementId) : ''
      const be = b.elementId ? String(b.elementId) : ''
      if (ae !== be) return ae.localeCompare(be)

      const at = a.taskId ? String(a.taskId) : ''
      const bt = b.taskId ? String(b.taskId) : ''
      if (at !== bt) return at.localeCompare(bt)

      return String(a._id).localeCompare(String(b._id))
    })

  const runningMemory = await ctx.db
    .query('memoryDocs')
    .withIndex('by_project_kind', (q: any) => q.eq('projectId', projectId).eq('kind', 'RUNNING_MEMORY'))
    .first()

  return {
    projectId,
    project: {
      name: project.name,
      description: project.description,
      notes: project.notes,
      overviewSummary: project.overviewSummary,
      brainDumpRaw: project.brainDumpRaw || runningMemory?.contentMd_he,
      updatedAt: project.updatedAt,
      createdAt: project.createdAt,
    },
    elements: elementsSorted.map((e: any) => ({
      id: e._id,
      title: e.title,
      type: e.type,
      status: e.status,
      updatedAt: e.updatedAt,
      createdAt: e.createdAt,
    })),
    tasks: tasksSorted.map((t: any) => ({
      id: t._id,
      title: t.title,
      elementId: t.elementId,
      description: t.description,
      status: t.status,
      stage: t.stage,
      workType: t.workType,
      estimatedHours: t.estimatedHours,
      estimatedMinutes: t.estimatedMinutes,
      accountingLinks: Array.isArray(t.accountingLinks)
        ? t.accountingLinks.map((l: any) => ({
          lineType: l?.lineType,
          lineId: l?.lineId,
        }))
        : undefined,
      updatedAt: t.updatedAt,
      createdAt: t.createdAt,
    })),
    materialLines: materialLinesSorted.map((l: any) => ({
      id: l._id,
      elementId: l.elementId,
      taskId: l.taskId,
      sectionKey: l.sectionKey,
      itemName: l.itemName,
      quantity: l.quantity,
      uomCode: l.uomCode,
      plannedUnitCost: l.plannedUnitCost,
      plannedTotalCost: l.plannedTotalCost,
      pricingSourceCode: l.pricingSourceCode,
      priceUrl: l.priceUrl,
      priceCheckedAt: l.priceCheckedAt,
      confidence: l.confidence,
      actualUnitCost: l.actualUnitCost,
      actualTotalCost: l.actualTotalCost,
      workType: l.workType,
      createdAt: l.createdAt,
      updatedAt: l.updatedAt,
    })),
    workLines: workLinesSorted.map((l: any) => ({
      id: l._id,
      elementId: l.elementId,
      taskId: l.taskId,
      sectionKey: l.sectionKey,
      roleHe: l.roleHe,
      plannedQuantity: l.plannedQuantity,
      plannedUnitCost: l.plannedUnitCost,
      plannedTotalCost: l.plannedTotalCost,
      crewSize: l.crewSize,
      workType: l.workType,
      isManagement: l.isManagement,
      confidence: l.confidence,
      createdAt: l.createdAt,
      updatedAt: l.updatedAt,
    })),
    quoteVersions: quoteVersionsSorted.map((q: any) => ({
      id: q._id,
      status: q.status,
      version: q.version,
      currency: q.currency,
      totals: q.totals,
      quoteText_he: q.quoteText_he,
      quoteBlocks: q.quoteBlocks,
      createdAt: q.createdAt,
    })),
    counts: {
      elements: elements.length,
      tasks: tasks.length,
      materialLines: materialLines.length,
      workLines: workLines.length,
      quoteVersions: quoteVersions.length,
    },
  }
}
