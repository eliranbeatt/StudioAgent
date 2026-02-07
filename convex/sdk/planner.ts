import { internalMutation } from '../_generated/server'
import { v } from 'convex/values'

function normalizeBlockingRank(value: unknown): number {
  if (value === 'blocker') return 0
  if (value === 'helpful') return 1
  return 2
}

function normalizeScopeRank(value: unknown): number {
  const scope = String(value ?? '').toLowerCase()
  if (scope === 'global' || scope === 'project') return 0
  if (scope === 'element') return 1
  return 2
}

function qaIsResolved(qa: any) {
  return (
    qa?.status === 'answered' ||
    qa?.status === 'assumed' ||
    qa?.status === 'resolved' ||
    qa?.status === 'skipped' ||
    qa?.status === 'dismissed'
  )
}

function stableHash(input: string) {
  let h = 2166136261
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return `h${(h >>> 0).toString(16)}`
}

function normalizeSectionPath(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => String(item ?? '').trim())
    .filter(Boolean)
    .map((item) => item.replace(/[^\w.\-]/g, '_'))
}

function normalizeScopeType(value: unknown): 'global' | 'project' | 'element' | 'task' | 'section' {
  const scope = String(value ?? '').toLowerCase()
  if (scope === 'project') return 'project'
  if (scope === 'element') return 'element'
  if (scope === 'task') return 'task'
  if (scope === 'section') return 'section'
  return 'global'
}

function normalizeBlockingLevel(value: unknown): 'blocker' | 'helpful' | 'optional' {
  if (value === 'blocker' || value === 'helpful' || value === 'optional') return value
  return 'helpful'
}

function computeOrderBucket(scopeType: string, blockingLevel: 'blocker' | 'helpful' | 'optional') {
  const isProjectScope = scopeType === 'global' || scopeType === 'project'
  if (isProjectScope && blockingLevel === 'blocker') return 'PB'
  if (!isProjectScope && blockingLevel === 'blocker') return 'EB'
  if (isProjectScope && blockingLevel === 'helpful') return 'PH'
  if (!isProjectScope && blockingLevel === 'helpful') return 'EH'
  if (isProjectScope && blockingLevel === 'optional') return 'PO'
  return 'EO'
}

function buildElementOrderMap(elements: any[]) {
  const sorted = [...elements].sort((a, b) => {
    const ao = typeof a.order === 'number' ? a.order : Number.MAX_SAFE_INTEGER
    const bo = typeof b.order === 'number' ? b.order : Number.MAX_SAFE_INTEGER
    if (ao !== bo) return ao - bo
    return Number(a.createdAt ?? 0) - Number(b.createdAt ?? 0)
  })
  const map = new Map<string, number>()
  for (let i = 0; i < sorted.length; i += 1) {
    map.set(String(sorted[i]._id), i + 1)
  }
  return map
}

function isQaOpen(qa: any) {
  const status = String(qa?.status ?? '')
  if (status === 'answered' || status === 'assumed' || status === 'resolved' || status === 'skipped' || status === 'dismissed') {
    return false
  }
  const answerText = String(qa?.answerText ?? qa?.answer_he ?? '').trim()
  return answerText.length === 0
}

export const upsertPlanAndSeed = internalMutation({
  args: {
    projectId: v.id('projects'),
    runId: v.optional(v.id('sdkRuns')),
    conversationId: v.optional(v.id('agentConversations')),
    planMd: v.string(),
    summaryHe: v.optional(v.string()),
    assumptionsHe: v.optional(v.array(v.string())),
    questions: v.array(v.any()),
  },
  handler: async (ctx, args) => {
    const now = Date.now()
    const existingDoc = await ctx.db
      .query('memoryDocs')
      .withIndex('by_project_kind', (q) =>
        q.eq('projectId', args.projectId).eq('kind', 'PROJECT_CONTEXT')
      )
      .first()

    const prevVersion = typeof existingDoc?.schemaVersion === 'number' ? existingDoc.schemaVersion : 0
    const nextVersion = prevVersion + 1
    const payload = {
      type: 'fast_plan',
      planVersion: nextVersion,
      summaryHe: args.summaryHe ?? '',
      planMd: args.planMd,
      assumptionsHe: Array.isArray(args.assumptionsHe) ? args.assumptionsHe : [],
      updatedAt: now,
    }

    if (existingDoc) {
      const existingDocFresh = await ctx.db.get(existingDoc._id)
      if (existingDocFresh) {
        await ctx.db.patch(existingDoc._id, {
          contentMd_he: JSON.stringify(payload),
          schemaVersion: nextVersion,
          updatedAt: now,
        })
      } else {
        await ctx.db.insert('memoryDocs', {
          projectId: args.projectId,
          kind: 'PROJECT_CONTEXT',
          title_he: 'Project Context Plan',
          contentMd_he: JSON.stringify(payload),
          schemaVersion: nextVersion,
          createdAt: now,
          updatedAt: now,
        })
      }
    } else {
      await ctx.db.insert('memoryDocs', {
        projectId: args.projectId,
        kind: 'PROJECT_CONTEXT',
        title_he: 'Project Context Plan',
        contentMd_he: JSON.stringify(payload),
        schemaVersion: nextVersion,
        createdAt: now,
        updatedAt: now,
      })
    }

    const [existingQaPairs, elements, projectState] = await Promise.all([
      ctx.db
        .query('qaPairs')
        .withIndex('by_project', (q) => q.eq('projectId', args.projectId))
        .collect(),
      ctx.db
        .query('elements')
        .withIndex('by_project', (q) => q.eq('projectId', args.projectId))
        .collect(),
      ctx.db
        .query('sdkProjectState')
        .withIndex('by_project', (q) => q.eq('projectId', args.projectId))
        .first(),
    ])
    const elementOrderMap = buildElementOrderMap(elements)

    const openByKey = new Set<string>()
    const resolvedByDedupe = new Set<string>()
    for (const qa of existingQaPairs) {
      const key = String(qa.questionKey ?? '').trim()
      if (!key) continue
      if (isQaOpen(qa)) openByKey.add(key)
      const dedupeKey = String(qa.dedupeKey ?? '').trim()
      if (dedupeKey && qaIsResolved(qa)) resolvedByDedupe.add(`${dedupeKey}::${String(qa.scopeKey ?? '__global__')}`)
    }

    const openByDedupe = new Set<string>()
    for (const qa of existingQaPairs) {
      const dedupeKey = String(qa.dedupeKey ?? '').trim()
      if (!dedupeKey || !isQaOpen(qa)) continue
      openByDedupe.add(`${dedupeKey}::${String(qa.scopeKey ?? '__global__')}`)
    }

    let nextOrdinal = Number(projectState?.nextQuestionOrdinal ?? 1)
    const ensureStateId = async () => {
      if (projectState?._id) return projectState._id
      const insertedId = await ctx.db.insert('sdkProjectState', {
        projectId: args.projectId,
        nextQuestionOrdinal: nextOrdinal,
        createdAt: now,
        updatedAt: now,
      })
      return insertedId
    }

    const sortedQuestions = [...args.questions]
      .filter((q) => typeof q?.questionHe === 'string' && q.questionHe.trim())
      .sort((a, b) => {
        const blockingCmp = normalizeBlockingRank(a?.blockingLevel) - normalizeBlockingRank(b?.blockingLevel)
        if (blockingCmp !== 0) return blockingCmp
        const scopeCmp = normalizeScopeRank(a?.scopeType) - normalizeScopeRank(b?.scopeType)
        if (scopeCmp !== 0) return scopeCmp
        const aOrder = String(a?.orderKey ?? '')
        const bOrder = String(b?.orderKey ?? '')
        if (aOrder && bOrder) return aOrder.localeCompare(bOrder)
        if (aOrder) return -1
        if (bOrder) return 1
        return 0
      })

    let inserted = 0
    for (let i = 0; i < sortedQuestions.length; i += 1) {
      const question = sortedQuestions[i]
      const questionKey = String(question?.questionKey ?? '').trim()
      if (questionKey && openByKey.has(questionKey)) continue
      const scopeType = normalizeScopeType(question?.scopeType)
      const scopeKey =
        typeof question?.scopeKey === 'string' && question.scopeKey.trim()
          ? question.scopeKey.trim()
          : scopeType === 'element'
            ? '__element_unknown__'
            : '__global__'
      const dedupeKeyRaw =
        String(question?.dedupeKey ?? '').trim() ||
        questionKey ||
        stableHash(`${scopeType}:${scopeKey}:${String(question?.questionHe ?? '').trim().toLowerCase()}`)
      const dedupeScopeRef = `${dedupeKeyRaw}::${scopeKey}`
      if (openByDedupe.has(dedupeScopeRef)) continue
      const followUp = Boolean(question?.followUp)
      if (resolvedByDedupe.has(dedupeScopeRef) && !followUp) continue

      const blockingLevel = normalizeBlockingLevel(question?.blockingLevel)
      const bucket = computeOrderBucket(scopeType, blockingLevel)
      const elementOrder =
        scopeType === 'element'
          ? String(elementOrderMap.get(scopeKey) ?? 999).padStart(3, '0')
          : '000'
      const sectionPath = normalizeSectionPath(question?.sectionPath)
      const sectionToken = sectionPath.length > 0 ? sectionPath.join('.') : 'general'
      const createdOrdinal = nextOrdinal
      nextOrdinal += 1
      const orderKey = `${bucket}/${elementOrder}/${sectionToken}/${String(createdOrdinal).padStart(6, '0')}`

      await ctx.db.insert('qaPairs', {
        projectId: args.projectId,
        question_he: String(question.questionHe),
        questionKey: questionKey || undefined,
        answer_he: undefined,
        status: 'open',
        questionType: question?.questionType,
        options: Array.isArray(question?.options) ? question.options : undefined,
        answer: undefined,
        answerText: undefined,
        scopeType,
        scopeKey,
        sectionPath,
        blockingLevel,
        orderKey,
        createdFrom: 'seed',
        followUp,
        triggeredBy: typeof question?.triggeredBy === 'string' ? question.triggeredBy : undefined,
        dedupeKey: dedupeKeyRaw,
        createdOrdinal,
        version: 1,
        source: {
          sourceType: 'CLARIFICATION_BLOCK',
          conversationId: args.conversationId ?? undefined,
        },
        createdAt: now,
      })
      if (questionKey) openByKey.add(questionKey)
      openByDedupe.add(dedupeScopeRef)
      inserted += 1
    }

    const stateId = await ensureStateId()
    const stateFresh = await ctx.db.get(stateId)
    if (stateFresh) {
      await ctx.db.patch(stateId, {
        nextQuestionOrdinal: nextOrdinal,
        updatedAt: now,
      })
    } else {
      await ctx.db.insert('sdkProjectState', {
        projectId: args.projectId,
        nextQuestionOrdinal: nextOrdinal,
        createdAt: now,
        updatedAt: now,
      })
    }

    if (args.runId) {
      const runFresh = await ctx.db.get(args.runId)
      if (runFresh) {
        await ctx.db.patch(args.runId, {
          planDocVersion: nextVersion,
          updatedAt: now,
          lastServedAt: now,
        })
      }
    }

    return {
      planVersion: nextVersion,
      insertedQuestions: inserted,
      totalQuestions: sortedQuestions.length,
    }
  },
})
