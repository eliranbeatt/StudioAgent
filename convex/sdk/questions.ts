import { mutation, query } from '../_generated/server'
import { v } from 'convex/values'
import type { Doc, Id } from '../_generated/dataModel'
import { internal } from '../_generated/api'
import { shouldPreemptWithProjectBlockers } from './regenRules'

type QaPairDoc = Doc<'qaPairs'>
type ElementDoc = Doc<'elements'>

type BlockingLevel = 'blocker' | 'helpful' | 'optional'
type ScopeBucket = 'global' | 'element' | 'other'

function normalizeBlockingLevel(value: unknown): BlockingLevel {
  if (value === 'blocker' || value === 'helpful' || value === 'optional') return value
  return 'helpful'
}

function normalizeScopeBucket(qa: QaPairDoc): ScopeBucket {
  const scopeType = String(qa.scopeType ?? '').toLowerCase()
  if (scopeType === 'global' || scopeType === 'project') return 'global'
  if (scopeType === 'element' || qa.elementId) return 'element'
  return 'other'
}

function qaScopeKey(qa: QaPairDoc): string {
  const bucket = normalizeScopeBucket(qa)
  if (bucket === 'global') return '__global__'
  if (bucket === 'element') {
    return String(qa.scopeKey ?? qa.elementId ?? '__element_unknown__')
  }
  return String(qa.scopeKey ?? '__other__')
}

function hasAnswer(qa: QaPairDoc): boolean {
  if (typeof qa.answerText === 'string' && qa.answerText.trim()) return true
  if (typeof qa.answer_he === 'string' && qa.answer_he.trim()) return true
  if (typeof qa.answer === 'string' && qa.answer.trim()) return true
  if (typeof qa.answer === 'number' || typeof qa.answer === 'boolean') return true
  if (Array.isArray(qa.answer) && qa.answer.length > 0) return true
  return false
}

function isResolvedStatus(status: unknown): boolean {
  return (
    status === 'answered' ||
    status === 'assumed' ||
    status === 'resolved' ||
    status === 'skipped' ||
    status === 'dismissed'
  )
}

function isOpenQuestion(qa: QaPairDoc): boolean {
  if (isResolvedStatus(qa.status)) return false
  if (hasAnswer(qa)) return false
  return true
}

function compareOrderKey(a?: string, b?: string): number {
  const left = String(a ?? '')
  const right = String(b ?? '')
  if (left && right) return left.localeCompare(right)
  if (left) return -1
  if (right) return 1
  return 0
}

function buildElementOrderMap(elements: ElementDoc[]): Map<string, number> {
  const sorted = [...elements].sort((a, b) => {
    const ao = typeof a.order === 'number' ? a.order : Number.MAX_SAFE_INTEGER
    const bo = typeof b.order === 'number' ? b.order : Number.MAX_SAFE_INTEGER
    if (ao !== bo) return ao - bo
    return a.createdAt - b.createdAt
  })
  const map = new Map<string, number>()
  for (let i = 0; i < sorted.length; i += 1) {
    map.set(String(sorted[i]._id), i)
  }
  return map
}

function pickAnchor(unresolved: QaPairDoc[], elementOrderMap: Map<string, number>) {
  const blockers = unresolved.filter((qa) => normalizeBlockingLevel(qa.blockingLevel) === 'blocker')
  const globalBlocker = blockers
    .filter((qa) => normalizeScopeBucket(qa) === 'global')
    .sort((a, b) => compareOrderKey(a.orderKey, b.orderKey))[0]
  if (globalBlocker) {
    return {
      scopeKey: '__global__',
      anchor: globalBlocker,
      blockersExist: true,
    }
  }

  const elementBlocker = blockers
    .filter((qa) => normalizeScopeBucket(qa) === 'element')
    .sort((a, b) => {
      const ae = elementOrderMap.get(String(a.elementId ?? '')) ?? Number.MAX_SAFE_INTEGER
      const be = elementOrderMap.get(String(b.elementId ?? '')) ?? Number.MAX_SAFE_INTEGER
      if (ae !== be) return ae - be
      return compareOrderKey(a.orderKey, b.orderKey)
    })[0]
  if (elementBlocker) {
    return {
      scopeKey: qaScopeKey(elementBlocker),
      anchor: elementBlocker,
      blockersExist: true,
    }
  }

  const fallback = [...unresolved].sort((a, b) => {
    const ab = normalizeBlockingLevel(a.blockingLevel)
    const bb = normalizeBlockingLevel(b.blockingLevel)
    const rank = (x: BlockingLevel) => (x === 'blocker' ? 0 : x === 'helpful' ? 1 : 2)
    if (rank(ab) !== rank(bb)) return rank(ab) - rank(bb)
    const ae = elementOrderMap.get(String(a.elementId ?? '')) ?? Number.MAX_SAFE_INTEGER
    const be = elementOrderMap.get(String(b.elementId ?? '')) ?? Number.MAX_SAFE_INTEGER
    if (ae !== be) return ae - be
    const orderCmp = compareOrderKey(a.orderKey, b.orderKey)
    if (orderCmp !== 0) return orderCmp
    return a.createdAt - b.createdAt
  })[0]

  return {
    scopeKey: fallback ? qaScopeKey(fallback) : '__global__',
    anchor: fallback ?? null,
    blockersExist: blockers.length > 0,
  }
}

function isProjectBlocker(qa: QaPairDoc): boolean {
  if (normalizeBlockingLevel(qa.blockingLevel) !== 'blocker') return false
  const scope = normalizeScopeBucket(qa)
  return scope === 'global'
}

function compareQueueOrder(a: QaPairDoc, b: QaPairDoc, elementOrderMap: Map<string, number>) {
  const rank = (x: BlockingLevel) => (x === 'blocker' ? 0 : x === 'helpful' ? 1 : 2)
  const ab = normalizeBlockingLevel(a.blockingLevel)
  const bb = normalizeBlockingLevel(b.blockingLevel)
  if (rank(ab) !== rank(bb)) return rank(ab) - rank(bb)
  const ae = elementOrderMap.get(String(a.elementId ?? '')) ?? Number.MAX_SAFE_INTEGER
  const be = elementOrderMap.get(String(b.elementId ?? '')) ?? Number.MAX_SAFE_INTEGER
  if (ae !== be) return ae - be
  const orderCmp = compareOrderKey(a.orderKey, b.orderKey)
  if (orderCmp !== 0) return orderCmp
  return a.createdAt - b.createdAt
}

function toQuestionDto(qa: QaPairDoc) {
  return {
    id: qa._id,
    questionHe: qa.question_he,
    questionText: qa.question_he,
    questionKey: qa.questionKey ?? null,
    questionType: qa.questionType ?? 'text',
    options: qa.options ?? [],
    suggestedAnswers: (qa as any).suggestedAnswers ?? [],
    allowDontKnow: (qa as any).allowDontKnow ?? true,
    blockingLevel: normalizeBlockingLevel(qa.blockingLevel),
    scopeType: qa.scopeType ?? null,
    scopeKey: qa.scopeKey ?? (qa.elementId ? String(qa.elementId) : null),
    elementId: qa.elementId ?? null,
    orderKey: qa.orderKey ?? null,
    followUp: qa.followUp ?? false,
    status: qa.status ?? 'open',
    createdAt: qa.createdAt,
  }
}

async function buildNextSet(args: {
  ctx: any
  projectId: Id<'projects'>
  runId?: Id<'sdkRuns'>
  limit?: number
}) {
  const [qaPairs, elements] = await Promise.all([
    args.ctx.db
      .query('qaPairs')
      .withIndex('by_project', (q: any) => q.eq('projectId', args.projectId))
      .collect(),
    args.ctx.db
      .query('elements')
      .withIndex('by_project', (q: any) => q.eq('projectId', args.projectId))
      .collect(),
  ])

  const unresolved = qaPairs.filter(isOpenQuestion)
  const unresolvedCount = unresolved.length
  if (unresolvedCount === 0) {
    return {
      setId: null,
      scopeKey: null,
      hasBlockers: false,
      unresolvedCount: 0,
      questions: [],
      canFinalize: true,
    }
  }

  const elementOrderMap = buildElementOrderMap(elements)
  let run: Doc<'sdkRuns'> | null = null
  if (args.runId) {
    run = await args.ctx.db.get(args.runId)
  }
  const cursor = typeof run?.lastServedOrderKey === 'string' ? run.lastServedOrderKey : null
  const normalizedLimit = Math.max(1, Math.min(Number(args.limit ?? 6), 12))

  const projectBlockers = unresolved
    .filter(isProjectBlocker)
    .sort((a, b) => compareQueueOrder(a, b, elementOrderMap))

  let activeScopeKey = '__global__'
  let blockersExist = projectBlockers.length > 0
  if (projectBlockers.length > 0) {
    activeScopeKey = '__global__'
  } else {
    const sortedQueue = [...unresolved].sort((a, b) => compareQueueOrder(a, b, elementOrderMap))
    let anchor = sortedQueue[0] ?? null
    if (cursor) {
      const afterCursor = sortedQueue.find((qa) => {
        const key = String(qa.orderKey ?? '')
        return shouldPreemptWithProjectBlockers({
          hasProjectBlockers: false,
          cursorOrderKey: cursor,
          candidateOrderKey: key,
        })
      })
      anchor = afterCursor ?? sortedQueue[0] ?? null
    }
    if (!anchor) {
      const fallback = pickAnchor(unresolved, elementOrderMap)
      activeScopeKey = fallback.scopeKey
      blockersExist = fallback.blockersExist
    } else {
      activeScopeKey = qaScopeKey(anchor)
      blockersExist = unresolved.some((qa) => normalizeBlockingLevel(qa.blockingLevel) === 'blocker')
    }
  }

  const scoped = unresolved.filter((qa) => qaScopeKey(qa) === activeScopeKey)
  const scopedAfterCursor =
    projectBlockers.length === 0 && cursor
      ? scoped.filter((qa) => {
        const key = String(qa.orderKey ?? '')
        return key && key.localeCompare(cursor) > 0
      })
      : scoped
  const effectiveScoped = scopedAfterCursor.length > 0 ? scopedAfterCursor : scoped
  const sortedScoped = [...effectiveScoped].sort((a, b) => {
    return compareQueueOrder(a, b, elementOrderMap)
  })

  const selected = sortedScoped.slice(0, normalizedLimit)
  const lastServedOrderKey = selected[selected.length - 1]?.orderKey

  return {
    setId: `qa:${String(args.projectId)}:${Date.now()}`,
    scopeKey: activeScopeKey,
    hasBlockers: blockersExist,
    unresolvedCount,
    questions: selected.map(toQuestionDto),
    lastServedOrderKey: lastServedOrderKey ?? null,
    canFinalize: true,
  }
}

export const peekNextSet = query({
  args: {
    projectId: v.id('projects'),
    runId: v.optional(v.id('sdkRuns')),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await buildNextSet({
      ctx,
      projectId: args.projectId,
      runId: args.runId,
      limit: args.limit,
    })
  },
})

export const nextSet = mutation({
  args: {
    projectId: v.id('projects'),
    runId: v.optional(v.id('sdkRuns')),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const result = await buildNextSet({
      ctx,
      projectId: args.projectId,
      runId: args.runId,
      limit: args.limit,
    })

    if (args.runId) {
      await ctx.db.patch(args.runId, {
        lastServedOrderKey: result.lastServedOrderKey ?? undefined,
        lastServedAt: Date.now(),
        updatedAt: Date.now(),
      })
    }

    return result
  },
})

export const submitAnswers = mutation({
  args: {
    runId: v.id('sdkRuns'),
    answers: v.array(v.object({
      qaPairId: v.id('qaPairs'),
      answer: v.optional(v.string()),
      answerSource: v.optional(v.union(
        v.literal('typed'),
        v.literal('option'),
        v.literal('suggestion'),
        v.literal('dont_know'),
      )),
      answerValue: v.optional(v.string()),
    })),
    intent: v.optional(v.union(v.literal('answer'), v.literal('ask_more'), v.literal('skip'))),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId)
    if (!run) throw new Error('Run not found')
    if (run.regenStatus === 'running') {
      return {
        ok: false,
        reason: 'regen_running',
        count: 0,
        applied: [],
        lastServedOrderKey: run.lastServedOrderKey ?? null,
      }
    }
    const planDoc = await ctx.db
      .query('memoryDocs')
      .withIndex('by_project_kind', (q) =>
        q.eq('projectId', run.projectId).eq('kind', 'PROJECT_CONTEXT')
      )
      .first()

    const now = Date.now()
    let maxOrderKey: string | undefined
    const applied: Array<{ qaPairId: Id<'qaPairs'>; status: string }> = []

    for (const item of args.answers) {
      const qa = await ctx.db.get(item.qaPairId)
      if (!qa) continue
      if (qa.projectId !== run.projectId) continue
      if (!isOpenQuestion(qa)) continue

      const answerText = String(item.answer ?? '').trim()
      const hasText = Boolean(answerText)
      const nextStatus =
        args.intent === 'skip'
          ? 'skipped'
          : hasText
            ? 'answered'
            : args.intent === 'ask_more'
              ? 'open'
              : 'skipped'

      const nextVersion = typeof qa.version === 'number' ? qa.version + 1 : 1
      const resolvedSource = item.answerSource
        ?? (answerText === '__dont_know__' ? 'dont_know' as const : undefined)
      // answerValue captures the structured/raw value from a chip selection,
      // while answerText captures the display text.
      const resolvedAnswerValue = item.answerValue ?? (hasText ? answerText : undefined)
      await ctx.db.patch(item.qaPairId, {
        status: nextStatus,
        answerText: hasText ? answerText : qa.answerText,
        answer_he: hasText ? answerText : qa.answer_he,
        answer: hasText ? answerText : qa.answer,
        answerSource: resolvedSource,
        answerValue: resolvedAnswerValue,
        version: nextVersion,
      })

      if (qa.orderKey && (!maxOrderKey || qa.orderKey.localeCompare(maxOrderKey) > 0)) {
        maxOrderKey = qa.orderKey
      }
      applied.push({ qaPairId: item.qaPairId, status: nextStatus, answerSource: resolvedSource })
    }

    await ctx.db.patch(args.runId, {
      lastServedOrderKey: maxOrderKey ?? run.lastServedOrderKey,
      lastServedAt: now,
      dirtyAnswersCount: Math.max(0, Number(run.dirtyAnswersCount ?? 0) + applied.length),
      updatedAt: now,
    })

    // Source-mode telemetry breakdown
    const sourceCounts: Record<string, number> = { typed: 0, option: 0, suggestion: 0, dont_know: 0 }
    for (const item of applied) {
      const src = item.answerSource ?? 'typed'
      sourceCounts[src] = (sourceCounts[src] ?? 0) + 1
    }

    await ctx.db.insert('sdkRunEvents', {
      runId: args.runId,
      type: 'sdk_questions_answer_submit',
      payload: {
        intent: args.intent ?? 'answer',
        count: applied.length,
        applied,
        sourceCounts,
      },
      createdAt: now,
    })

    if (applied.length > 0) {
      await ctx.scheduler.runAfter(0, internal['sdk/rebase'].rebaseFromAnswersAsync, {
        runId: args.runId,
        answeredQaPairIds: applied.map((item) => item.qaPairId),
        expectedPlanVersion: typeof planDoc?.schemaVersion === 'number' ? planDoc.schemaVersion : undefined,
      })

      // ── vNext bridge: propagate answers to sdkStageDecisions ──
      // Collect answered qaPairs whose questionKey starts with "vnext."
      // and append as stage decisions so the pipeline gate can see them.
      const vnextAnswersByStage: Record<string, Record<string, string>> = {}
      for (const item of applied) {
        if (item.status !== 'answered' && item.status !== 'skipped') continue
        const qa = await ctx.db.get(item.qaPairId)
        if (!qa?.questionKey || !qa.questionKey.startsWith('vnext.')) continue
        // questionKey format: vnext.<stageKey>.<semanticId>
        const parts = qa.questionKey.split('.')
        if (parts.length < 3) continue
        const stageKey = parts[1]
        const semanticId = parts.slice(2).join('.')
        const answerValue = item.status === 'skipped'
          ? '__dont_know__'
          : String(qa.answerText ?? qa.answer_he ?? qa.answer ?? '').trim() || '__dont_know__'
        if (!vnextAnswersByStage[stageKey]) vnextAnswersByStage[stageKey] = {}
        vnextAnswersByStage[stageKey][semanticId] = answerValue
      }

      for (const [stageKey, answersById] of Object.entries(vnextAnswersByStage)) {
        if (Object.keys(answersById).length === 0) continue
        await ctx.runMutation(internal['sdk/vnext/artifacts'].appendStageDecision, {
          runId: args.runId,
          conversationId: run.conversationId,
          stageKey,
          decisionType: 'answers',
          payload: { answersById },
        })
      }
    }

    return {
      ok: true,
      count: applied.length,
      applied,
      lastServedOrderKey: maxOrderKey ?? run.lastServedOrderKey ?? null,
    }
  },
})

export const upsertVNextQuestionsBridge = mutation({
  args: {
    projectId: v.id('projects'),
    stageKey: v.string(),
    questions: v.array(v.object({
      id: v.string(),
      textHe: v.string(),
      type: v.union(
        v.literal('text'),
        v.literal('number'),
        v.literal('date'),
        v.literal('single'),
        v.literal('multi'),
        v.literal('toggle')
      ),
      options: v.array(v.object({
        value: v.string(),
        labelHe: v.optional(v.string()),
      })),
      suggestedAnswers: v.optional(v.array(v.object({
        value: v.string(),
        labelHe: v.optional(v.string()),
      }))),
      allowDontKnow: v.optional(v.boolean()),
      blockingLevel: v.union(v.literal('blocker'), v.literal('helpful'), v.literal('optional')),
    })),
  },
  handler: async (ctx, args) => {
    const now = Date.now()
    let created = 0
    let updated = 0
    let reusedResolved = 0

    for (let index = 0; index < args.questions.length; index += 1) {
      const question = args.questions[index]
      const dedupeKey = `vnext:${args.stageKey}:${question.id}`
      const orderKey = `vnext.${args.stageKey}.${String(index + 1).padStart(3, '0')}`
      const existing = await ctx.db
        .query('qaPairs')
        .withIndex('by_project_dedupeKey', (q) =>
          q.eq('projectId', args.projectId).eq('dedupeKey', dedupeKey)
        )
        .first()

      if (existing) {
        if (isResolvedStatus(existing.status)) {
          reusedResolved += 1
          continue
        }
        await ctx.db.patch(existing._id, {
          question_he: question.textHe,
          questionKey: existing.questionKey ?? `vnext.${args.stageKey}.${question.id}`,
          questionType: question.type,
          options: question.options,
          suggestedAnswers: question.suggestedAnswers,
          allowDontKnow: question.allowDontKnow,
          status: existing.status ?? 'open',
          scopeType: 'global',
          scopeKey: '__global__',
          sectionPath: ['vnext', args.stageKey],
          blockingLevel: question.blockingLevel,
          orderKey,
          createdFrom: existing.createdFrom ?? 'system',
          followUp: existing.followUp ?? true,
          triggeredBy: args.stageKey,
          dedupeKey,
          version: typeof existing.version === 'number' ? existing.version + 1 : 1,
        })
        updated += 1
        continue
      }

      await ctx.db.insert('qaPairs', {
        projectId: args.projectId,
        question_he: question.textHe,
        questionKey: `vnext.${args.stageKey}.${question.id}`,
        status: 'open',
        questionType: question.type,
        options: question.options,
        suggestedAnswers: question.suggestedAnswers,
        allowDontKnow: question.allowDontKnow,
        scopeType: 'global',
        scopeKey: '__global__',
        sectionPath: ['vnext', args.stageKey],
        blockingLevel: question.blockingLevel,
        orderKey,
        createdFrom: 'system',
        followUp: true,
        triggeredBy: args.stageKey,
        dedupeKey,
        version: 1,
        createdAt: now,
      })
      created += 1
    }

    return { created, updated, reusedResolved, total: args.questions.length }
  },
})

// Helper: Create a question for project planning
export const createQuestion = mutation({
  args: {
    projectId: v.id('projects'),
    runId: v.id('sdkRuns'),
    questionHe: v.string(),
    groupKey: v.string(),
    groupLabelHe: v.string(),
    questionKey: v.optional(v.string()),
    questionType: v.optional(v.union(v.literal('text'), v.literal('number'), v.literal('date'), v.literal('single'), v.literal('multi'), v.literal('toggle'))),
    sectionPath: v.optional(v.array(v.string())),
    blockingLevel: v.optional(v.string()),
    scopeType: v.optional(v.union(v.literal('global'), v.literal('project'), v.literal('element'), v.literal('task'), v.literal('section'))),
    scopeKey: v.optional(v.string()),
    orderKey: v.optional(v.string()),
    followUp: v.optional(v.boolean()),
    options: v.optional(v.any()),
    suggestedAnswers: v.optional(v.any()),
    allowDontKnow: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const now = Date.now()
    const scopeType = args.scopeType ?? 'global'
    const resolvedScopeKey =
      typeof args.scopeKey === 'string' && args.scopeKey.trim()
        ? args.scopeKey.trim()
        : scopeType === 'element'
          ? 'element_unknown'
          : '__global__'
    await ctx.db.insert('qaPairs', {
      projectId: args.projectId,
      question_he: args.questionHe,
      questionKey: args.questionKey ?? `planning.${args.groupKey}.${now}`,
      status: 'open',
      questionType: args.questionType ?? 'text',
      options: args.options,
      suggestedAnswers: args.suggestedAnswers,
      allowDontKnow: args.allowDontKnow ?? true,
      scopeType,
      scopeKey: resolvedScopeKey,
      sectionPath: args.sectionPath ?? [args.groupKey],
      blockingLevel: args.blockingLevel ?? 'helpful',
      orderKey: args.orderKey,
      createdFrom: 'system',
      followUp: args.followUp ?? true,
      createdAt: now,
      version: 1,
    })
  },
})

// Helper: Get all answers for a run
export const getAllAnswers = query({
  args: {
    runId: v.id('sdkRuns'),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run) return [];

    const qas = await ctx.db
      .query('qaPairs')
      .withIndex('by_project', (q) => q.eq('projectId', run.projectId))
      .collect();

    return qas
      .filter((qa) => hasAnswer(qa))
      .map((qa) => ({
        questionHe: qa.question_he ?? '',
        answer: qa.answer ?? qa.answerText ?? qa.answer_he ?? '',
        groupKey: (qa as any).groupKey,
      }));
  },
})

// Helper: Get all resolved answers for a project (used by projectPlanning.initiatePlanning)
export const getResolvedAnswers = query({
  args: {
    projectId: v.id('projects'),
  },
  handler: async (ctx, args) => {
    const qas = await ctx.db
      .query('qaPairs')
      .withIndex('by_project', (q) => q.eq('projectId', args.projectId))
      .collect();

    return qas
      .filter((qa) => isResolvedStatus(qa.status) || hasAnswer(qa))
      .map((qa) => ({
        id: qa._id,
        questionHe: qa.question_he ?? '',
        answer: qa.answer ?? qa.answerText ?? qa.answer_he ?? '',
        status: qa.status ?? 'open',
        groupKey: (qa as any).groupKey,
        blockingLevel: qa.blockingLevel,
        scopeType: qa.scopeType ?? null,
        elementId: qa.elementId ?? null,
      }));
  },
})

// Helper: Get all QA pairs for a project (used by projectPlanning.regenerateQuestions)
export const getAllQAPairs = query({
  args: {
    projectId: v.id('projects'),
  },
  handler: async (ctx, args) => {
    const qas = await ctx.db
      .query('qaPairs')
      .withIndex('by_project', (q) => q.eq('projectId', args.projectId))
      .collect();

    return qas.map((qa) => ({
      id: qa._id,
      questionHe: qa.question_he ?? '',
      answer: qa.answer ?? qa.answerText ?? qa.answer_he ?? '',
      status: qa.status ?? 'open',
      groupKey: (qa as any).groupKey,
      blockingLevel: qa.blockingLevel,
    }));
  },
})

// Helper: Dismiss all questions for a run
export const dismissAllForRun = mutation({
  args: {
    runId: v.id('sdkRuns'),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run) return;

    const qas = await ctx.db
      .query('qaPairs')
      .withIndex('by_project', (q) => q.eq('projectId', run.projectId))
      .filter((q) => q.eq(q.field('status'), 'open'))
      .collect();

    for (const qa of qas) {
      await ctx.db.patch(qa._id, { status: 'dismissed' });
    }
  },
});

export const listOpenForProject = query({
  args: {
    projectId: v.id('projects'),
  },
  handler: async (ctx, args) => {
    const qas = await ctx.db
      .query('qaPairs')
      .withIndex('by_project', (q) => q.eq('projectId', args.projectId))
      .filter((q) => q.eq(q.field('status'), 'open'))
      .collect()

    return qas.map((qa) => ({
      id: qa._id,
    }))
  },
})

export const dismissQuestionById = mutation({
  args: {
    qaPairId: v.id('qaPairs'),
  },
  handler: async (ctx, args) => {
    const qa = await ctx.db.get(args.qaPairId)
    if (!qa || qa.status === 'dismissed') return
    await ctx.db.patch(args.qaPairId, {
      status: 'dismissed',
    })
  },
})
