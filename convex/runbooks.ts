import { mutation, query } from './_generated/server'
import { v } from 'convex/values'
import { Id } from './_generated/dataModel'

function normalizeHeText(value: unknown): string {
  if (typeof value !== 'string') return ''
  return value.trim().replace(/\s+/g, ' ')
}

function stableId(prefix: string, parts: Array<string | number | undefined | null>): string {
  const input = parts
    .filter((p): p is string | number => p !== undefined && p !== null)
    .map((p) => String(p))
    .join('|')
    .toLowerCase()
    .trim()

  let hash = 5381
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 33) ^ input.charCodeAt(i)
  }
  const unsigned = hash >>> 0
  return `${prefix}_${unsigned.toString(36)}`
}

type NormalizedRunbookPhase = {
  phaseId: string
  phaseOrder: number
  nameHe: string
  steps: Array<{
    stepId: string
    textHe: string
    responsibleHe?: string
    durationMins?: number
    kind: 'step' | 'checkpoint'
  }>
}

type NormalizedRunbook = {
  titleHe: string
  summaryHe?: string
  phases: NormalizedRunbookPhase[]
  bringListHe: string[]
  safetyHe: string[]
  quickFixKitHe: string[]
  checkpointsHe: string[]
  assumptionsHe: string[]
  approvalsRequired?: boolean
  approvalStages?: string[]
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((x) => normalizeHeText(x))
    .filter((x) => x.length > 0)
}

function normalizeRunbookBlock(block: any): NormalizedRunbook {
  const titleHe =
    normalizeHeText(block?.titleHe ?? block?.title_he) || 'רנבוק התקנה'
  const summaryHe = normalizeHeText(block?.summaryHe ?? block?.summary_he) || undefined

  const bringListHe = normalizeStringArray(block?.bringListHe ?? block?.bringList_he)
  const safetyHe = normalizeStringArray(block?.safetyHe ?? block?.safety_he)
  const quickFixKitHe = normalizeStringArray(block?.quickFixKitHe ?? block?.quickFixKit_he)
  const checkpointsHe = normalizeStringArray(block?.checkpointsHe ?? block?.checkpoints_he)
  const assumptionsHe = normalizeStringArray(block?.assumptionsHe ?? block?.assumptions_he)

  const rawPhases = Array.isArray(block?.phases) ? block.phases : []

  const phases: NormalizedRunbookPhase[] = rawPhases
    .map((raw: any, phaseIndex: number) => {
      const nameHe =
        normalizeHeText(raw?.nameHe ?? raw?.name_he) || `שלב ${phaseIndex + 1}`
      const phaseId =
        normalizeHeText(raw?.phaseId ?? raw?.phase_id) || stableId('phase', [nameHe, phaseIndex])

      const rawSteps = raw?.steps ?? raw?.stepsHe ?? raw?.steps_he
      const stepsArr = Array.isArray(rawSteps) ? rawSteps : []

      // Legacy: phase.rolesHe can be a parallel array. We’ll pair by index.
      const legacyRoles = normalizeStringArray(raw?.rolesHe ?? raw?.roles_he)

      const steps = stepsArr
        .map((s: any, stepIndex: number) => {
          if (typeof s === 'string') {
            const textHe = normalizeHeText(s)
            const stepId = stableId('step', [phaseId, textHe, stepIndex])
            const responsibleHe = legacyRoles[stepIndex]
              ? normalizeHeText(legacyRoles[stepIndex])
              : undefined
            return {
              stepId,
              textHe,
              responsibleHe,
              kind: 'step' as const,
            }
          }

          const textHe = normalizeHeText(s?.textHe ?? s?.text_he ?? s?.titleHe ?? s?.title_he)
          if (!textHe) return null

          const stepId =
            normalizeHeText(s?.stepId ?? s?.step_id) || stableId('step', [phaseId, textHe, stepIndex])

          const responsibleHe = normalizeHeText(
            s?.responsibleHe ?? s?.responsible_he ?? s?.roleHe ?? s?.role_he
          )

          const durationMinsRaw = s?.durationMins ?? s?.duration_mins ?? s?.estimatedMinutes
          const durationMins = typeof durationMinsRaw === 'number' ? durationMinsRaw : undefined

          const isCheckpoint = Boolean(s?.isCheckpoint ?? s?.is_checkpoint)

          return {
            stepId,
            textHe,
            responsibleHe: responsibleHe || undefined,
            durationMins,
            kind: isCheckpoint ? ('checkpoint' as const) : ('step' as const),
          }
        })
        .filter((x): x is NonNullable<typeof x> => Boolean(x && x.textHe))

      return {
        phaseId,
        phaseOrder: typeof raw?.phaseOrder === 'number' ? raw.phaseOrder : phaseIndex,
        nameHe,
        steps,
      }
    })
    .filter((p) => p.steps.length > 0 || p.nameHe.length > 0)

  const approvalsRequiredRaw = block?.approvalsRequired ?? block?.approvals_required
  const approvalsRequired = typeof approvalsRequiredRaw === 'boolean' ? approvalsRequiredRaw : undefined

  const approvalStages = normalizeStringArray(block?.approvalStages ?? block?.approval_stages)

  return {
    titleHe,
    summaryHe,
    phases,
    bringListHe,
    safetyHe,
    quickFixKitHe,
    checkpointsHe,
    assumptionsHe,
    approvalsRequired,
    approvalStages: approvalStages.length ? approvalStages : undefined,
  }
}

export const listForProject = query({
  args: {
    projectId: v.id('projects'),
    scope: v.optional(v.union(v.literal('project'), v.literal('element'))),
    elementId: v.optional(v.id('elements')),
  },
  handler: async (ctx, args) => {
    const base = ctx.db
      .query('runbooks')
      .withIndex('by_project', (q) => q.eq('projectId', args.projectId))

    const all = await base.collect()

    return all
      .filter((r) => {
        if (args.scope && r.scope !== args.scope) return false
        if (args.elementId !== undefined && r.elementId !== args.elementId) return false
        return true
      })
      .sort((a, b) => b.version - a.version)
  },
})

export const getActiveForProject = query({
  args: { projectId: v.id('projects') },
  handler: async (ctx, args) => {
    const runbook = await ctx.db
      .query('runbooks')
      .withIndex('by_project_scope_status', (q) =>
        q.eq('projectId', args.projectId).eq('scope', 'project').eq('status', 'active')
      )
      .order('desc')
      .first()

    if (!runbook) return null

    const items = await ctx.db
      .query('runbookItems')
      .withIndex('by_runbook', (q) => q.eq('runbookId', runbook._id))
      .collect()

    const listItems = await ctx.db
      .query('runbookListItems')
      .withIndex('by_runbook', (q) => q.eq('runbookId', runbook._id))
      .collect()

    return { runbook, items, listItems }
  },
})

export const getActiveTemplateForElement = query({
  args: { projectId: v.id('projects'), elementId: v.id('elements') },
  handler: async (ctx, args) => {
    const runbook = await ctx.db
      .query('runbooks')
      .withIndex('by_project_scope_status', (q) =>
        q.eq('projectId', args.projectId).eq('scope', 'element').eq('status', 'active')
      )
      .collect()

    const activeForElement = runbook
      .filter((r) => r.elementId === args.elementId)
      .sort((a, b) => b.version - a.version)[0]

    if (!activeForElement) return null

    const items = await ctx.db
      .query('runbookItems')
      .withIndex('by_runbook', (q) => q.eq('runbookId', activeForElement._id))
      .collect()

    const listItems = await ctx.db
      .query('runbookListItems')
      .withIndex('by_runbook', (q) => q.eq('runbookId', activeForElement._id))
      .collect()

    return { runbook: activeForElement, items, listItems }
  },
})

export const getRunbook = query({
  args: { runbookId: v.id('runbooks') },
  handler: async (ctx, args) => {
    const runbook = await ctx.db.get(args.runbookId)
    if (!runbook) return null

    const items = await ctx.db
      .query('runbookItems')
      .withIndex('by_runbook', (q) => q.eq('runbookId', runbook._id))
      .collect()

    const listItems = await ctx.db
      .query('runbookListItems')
      .withIndex('by_runbook', (q) => q.eq('runbookId', runbook._id))
      .collect()

    return { runbook, items, listItems }
  },
})

export const createFromRunbookBlock = mutation({
  args: {
    projectId: v.id('projects'),
    scope: v.union(v.literal('project'), v.literal('element')),
    elementId: v.optional(v.id('elements')),
    runbookBlock: v.any(),
    source: v.optional(v.union(v.literal('ai'), v.literal('manual'), v.literal('mixed'))),
  },
  handler: async (ctx, args) => {
    if (args.scope === 'element' && !args.elementId) {
      throw new Error('elementId is required when scope="element"')
    }

    const normalized = normalizeRunbookBlock(args.runbookBlock)

    const existing = await ctx.db
      .query('runbooks')
      .withIndex('by_project_scope', (q) => q.eq('projectId', args.projectId).eq('scope', args.scope))
      .collect()

    const nextVersion = (existing.reduce((max, r) => Math.max(max, r.version ?? 0), 0) || 0) + 1

    const identity = await ctx.auth.getUserIdentity()
    const createdBy = identity?.email ?? identity?.name ?? undefined

    const now = Date.now()

    const runbookId = await ctx.db.insert('runbooks', {
      projectId: args.projectId,
      scope: args.scope,
      elementId: args.elementId,
      titleHe: normalized.titleHe,
      summaryHe: normalized.summaryHe,
      status: 'draft',
      version: nextVersion,
      source: args.source ?? 'ai',
      approvalsRequired: normalized.approvalsRequired,
      approvalStages: normalized.approvalStages,
      approvalRecords: [],
      createdBy,
      createdAt: now,
      updatedAt: now,
    })

    // Items
    for (const phase of normalized.phases) {
      for (let i = 0; i < phase.steps.length; i++) {
        const step = phase.steps[i]
        await ctx.db.insert('runbookItems', {
          projectId: args.projectId,
          runbookId,
          phaseId: phase.phaseId,
          phaseOrder: phase.phaseOrder,
          phaseNameHe: phase.nameHe,
          orderIndex: i,
          kind: step.kind,
          textHe: step.textHe,
          responsibleHe: step.responsibleHe,
          durationMins: step.durationMins,
          status: 'todo',
          createdAt: now,
          updatedAt: now,
        })
      }
    }

    const insertList = async (listType: any, items: string[]) => {
      for (let i = 0; i < items.length; i++) {
        const textHe = normalizeHeText(items[i])
        if (!textHe) continue
        await ctx.db.insert('runbookListItems', {
          projectId: args.projectId,
          runbookId,
          listType,
          orderIndex: i,
          textHe,
          checked: false,
          createdAt: now,
          updatedAt: now,
        })
      }
    }

    await insertList('bringList', normalized.bringListHe)
    await insertList('safety', normalized.safetyHe)
    await insertList('quickFixKit', normalized.quickFixKitHe)
    await insertList('checkpoints', normalized.checkpointsHe)
    await insertList('assumptions', normalized.assumptionsHe)

    return { runbookId: runbookId as Id<'runbooks'> }
  },
})

export const setActiveRunbook = mutation({
  args: { projectId: v.id('projects'), runbookId: v.id('runbooks') },
  handler: async (ctx, args) => {
    const runbook = await ctx.db.get(args.runbookId)
    if (!runbook) throw new Error('Runbook not found')
    if (runbook.projectId !== args.projectId) throw new Error('Runbook does not belong to project')
    if (runbook.scope !== 'project') throw new Error('Only project-scope runbooks can be set active from Tasks')

    const now = Date.now()

    const currentActive = await ctx.db
      .query('runbooks')
      .withIndex('by_project_scope_status', (q) =>
        q.eq('projectId', args.projectId).eq('scope', 'project').eq('status', 'active')
      )
      .collect()

    for (const r of currentActive) {
      if (r._id === args.runbookId) continue
      await ctx.db.patch(r._id, { status: 'archived', updatedAt: now })
    }

    await ctx.db.patch(args.runbookId, { status: 'active', updatedAt: now })
  },
})

export const setActiveElementTemplate = mutation({
  args: { projectId: v.id('projects'), elementId: v.id('elements'), runbookId: v.id('runbooks') },
  handler: async (ctx, args) => {
    const runbook = await ctx.db.get(args.runbookId)
    if (!runbook) throw new Error('Runbook not found')
    if (runbook.projectId !== args.projectId) throw new Error('Runbook does not belong to project')
    if (runbook.scope !== 'element') throw new Error('Runbook is not an element template')
    if (runbook.elementId !== args.elementId) throw new Error('Runbook does not belong to element')

    const now = Date.now()

    const candidates = await ctx.db
      .query('runbooks')
      .withIndex('by_project_scope', (q) => q.eq('projectId', args.projectId).eq('scope', 'element'))
      .collect()

    for (const r of candidates) {
      if (r.elementId !== args.elementId) continue
      if (r._id === args.runbookId) continue
      if (r.status === 'archived') continue
      await ctx.db.patch(r._id, { status: 'archived', updatedAt: now })
    }

    await ctx.db.patch(args.runbookId, { status: 'active', updatedAt: now })
  },
})

export const startExecution = mutation({
  args: { runbookId: v.id('runbooks') },
  handler: async (ctx, args) => {
    const runbook = await ctx.db.get(args.runbookId)
    if (!runbook) throw new Error('Runbook not found')
    if (runbook.status !== 'active') throw new Error('Runbook must be active to start execution')

    const now = Date.now()

    await ctx.db.patch(args.runbookId, {
      executionStartedAt: runbook.executionStartedAt ?? now,
      orderingLocked: true,
      updatedAt: now,
    })
  },
})

export const toggleRunbookItemDone = mutation({
  args: {
    runbookItemId: v.id('runbookItems'),
    done: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.runbookItemId)
    if (!item) throw new Error('Runbook item not found')

    const now = Date.now()
    const identity = await ctx.auth.getUserIdentity()
    const doneBy = identity?.email ?? identity?.name ?? undefined

    const targetDone = args.done ?? item.status !== 'done'

    await ctx.db.patch(args.runbookItemId, {
      status: targetDone ? 'done' : 'todo',
      doneAt: targetDone ? now : undefined,
      doneBy: targetDone ? doneBy : undefined,
      updatedAt: now,
    })
  },
})

export const updateRunbookItemText = mutation({
  args: {
    runbookItemId: v.id('runbookItems'),
    textHe: v.string(),
  },
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.runbookItemId)
    if (!item) throw new Error('Runbook item not found')

    const textHe = normalizeHeText(args.textHe)
    if (!textHe) throw new Error('textHe is required')

    await ctx.db.patch(args.runbookItemId, {
      textHe,
      updatedAt: Date.now(),
    })
  },
})

export const toggleRunbookListItemChecked = mutation({
  args: {
    runbookListItemId: v.id('runbookListItems'),
    checked: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.runbookListItemId)
    if (!item) throw new Error('Runbook list item not found')

    const now = Date.now()
    const identity = await ctx.auth.getUserIdentity()
    const checkedBy = identity?.email ?? identity?.name ?? undefined

    const nextChecked = args.checked ?? !item.checked

    await ctx.db.patch(args.runbookListItemId, {
      checked: nextChecked,
      checkedAt: nextChecked ? now : undefined,
      checkedBy: nextChecked ? checkedBy : undefined,
      updatedAt: now,
    })
  },
})

export const signApproval = mutation({
  args: {
    runbookId: v.id('runbooks'),
    stage: v.string(),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const runbook = await ctx.db.get(args.runbookId)
    if (!runbook) throw new Error('Runbook not found')

    const identity = await ctx.auth.getUserIdentity()
    const signedBy = identity?.email ?? identity?.name ?? 'unknown'
    const signedAt = Date.now()

    const existing = Array.isArray(runbook.approvalRecords) ? runbook.approvalRecords : []

    const next = existing.filter((r: any) => r?.stage !== args.stage)
    next.push({
      stage: args.stage,
      signedBy,
      signedAt,
      note: args.note ? normalizeHeText(args.note) : undefined,
    })

    await ctx.db.patch(args.runbookId, {
      approvalRecords: next,
      updatedAt: signedAt,
    })
  },
})
