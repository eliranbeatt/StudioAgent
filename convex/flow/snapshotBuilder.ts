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
    status?: string
    updatedAt?: number
    createdAt: number
  }>
  counts: {
    elements: number
    tasks: number
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

  return {
    projectId,
    project: {
      name: project.name,
      description: project.description,
      notes: project.notes,
      overviewSummary: project.overviewSummary,
      brainDumpRaw: project.brainDumpRaw,
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
      status: t.status,
      updatedAt: t.updatedAt,
      createdAt: t.createdAt,
    })),
    counts: {
      elements: elements.length,
      tasks: tasks.length,
    },
  }
}
