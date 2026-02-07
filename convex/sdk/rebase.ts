import { internalMutation, internalQuery } from '../_generated/server'
import { v } from 'convex/values'
import {
  applyRegenCaps,
  canApplyPlanDocCas,
  isResolvedQaStatus,
  shouldAllowStatusTransition,
  shouldInsertQuestionFromDedupe,
} from './regenRules'

function parseDoc(raw?: string) {
  if (!raw) return {}
  try {
    return JSON.parse(raw)
  } catch {
    return { raw }
  }
}

function extractAnswerText(qa: any): string {
  const text = String(qa?.answerText ?? qa?.answer_he ?? '').trim()
  if (text) return text
  if (typeof qa?.answer === 'string') return qa.answer.trim()
  if (typeof qa?.answer === 'number' || typeof qa?.answer === 'boolean') return String(qa.answer)
  if (Array.isArray(qa?.answer)) return qa.answer.join(', ')
  return ''
}

function normalizeQuestionType(raw: unknown): 'text' | 'number' | 'date' | 'single' | 'multi' | 'toggle' {
  const value = String(raw ?? '').trim().toLowerCase()
  if (value === 'number') return 'number'
  if (value === 'date') return 'date'
  if (value === 'multi') return 'multi'
  if (value === 'toggle') return 'toggle'
  if (value === 'choice' || value === 'single') return 'single'
  if (value === 'shorttext' || value === 'longtext' || value === 'fileref' || value === 'text') return 'text'
  return 'text'
}

function normalizeBlockingLevel(raw: unknown): 'blocker' | 'helpful' | 'optional' {
  if (raw === 'blocker' || raw === 'helpful' || raw === 'optional') return raw
  return 'helpful'
}

function normalizeScopeType(raw: unknown): 'project' | 'element' {
  const value = String(raw ?? '').toLowerCase()
  return value === 'element' ? 'element' : 'project'
}

function normalizeSectionPath(raw: unknown): string[] {
  const value = String(raw ?? '').trim()
  if (!value) return ['general']
  const tokens = value
    .split(/[/.>]+/g)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => item.replace(/[^\w.\-]/g, '_'))
  return tokens.length > 0 ? tokens : ['general']
}

function computeBucket(scopeType: 'project' | 'element', blockingLevel: 'blocker' | 'helpful' | 'optional') {
  if (scopeType === 'project' && blockingLevel === 'blocker') return 'PB'
  if (scopeType === 'element' && blockingLevel === 'blocker') return 'EB'
  if (scopeType === 'project' && blockingLevel === 'helpful') return 'PH'
  if (scopeType === 'element' && blockingLevel === 'helpful') return 'EH'
  if (scopeType === 'project' && blockingLevel === 'optional') return 'PO'
  return 'EO'
}

function stableHash(input: string) {
  let h = 2166136261
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return `h${(h >>> 0).toString(16)}`
}

export const rebaseFromAnswersAsync = internalMutation({
  args: {
    runId: v.id('sdkRuns'),
    answeredQaPairIds: v.array(v.id('qaPairs')),
    expectedPlanVersion: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId)
    if (!run) return { ok: false, reason: 'run_not_found' }

    const planDoc = await ctx.db
      .query('memoryDocs')
      .withIndex('by_project_kind', (q) =>
        q.eq('projectId', run.projectId).eq('kind', 'PROJECT_CONTEXT')
      )
      .first()

    if (!planDoc) {
      return { ok: false, reason: 'plan_doc_not_found' }
    }

    const currentVersion = typeof planDoc.schemaVersion === 'number' ? planDoc.schemaVersion : 0
    const versionMismatch =
      typeof args.expectedPlanVersion === 'number' && args.expectedPlanVersion !== currentVersion

    const qaPairs = await Promise.all(args.answeredQaPairIds.map((qaId) => ctx.db.get(qaId)))
    const answeredRows = qaPairs
      .filter(Boolean)
      .filter((qa: any) => qa.projectId === run.projectId)
      .map((qa: any) => ({
        qaPairId: qa._id,
        questionKey: qa.questionKey ?? null,
        questionHe: qa.question_he,
        answerText: extractAnswerText(qa),
        updatedAt: Date.now(),
      }))
      .filter((row: any) => row.answerText)

    const parsed = parseDoc(planDoc.contentMd_he)
    const priorRebased = Array.isArray((parsed as any).rebasedAnswers) ? (parsed as any).rebasedAnswers : []
    const mergedRebased = [...priorRebased, ...answeredRows]

    const planMd = typeof (parsed as any).planMd === 'string' ? (parsed as any).planMd : ''
    const answerAppendix = answeredRows.length > 0
      ? [
          '',
          '## Latest Confirmed Answers',
          ...answeredRows.map((row: any) => `- ${row.questionHe}: ${row.answerText}`),
        ].join('\n')
      : ''

    const nextPayload = {
      ...(typeof parsed === 'object' && parsed ? parsed : {}),
      planVersion: currentVersion + 1,
      rebasedAnswers: mergedRebased,
      planMd: planMd ? `${planMd}${answerAppendix}` : planMd,
      updatedAt: Date.now(),
    }

    await ctx.db.patch(planDoc._id, {
      contentMd_he: JSON.stringify(nextPayload),
      schemaVersion: currentVersion + 1,
      updatedAt: Date.now(),
    })

    const openByKey = new Map<string, any[]>()
    const allQa = await ctx.db
      .query('qaPairs')
      .withIndex('by_project', (q) => q.eq('projectId', run.projectId))
      .collect()
    for (const qa of allQa) {
      const key = String(qa.questionKey ?? '').trim()
      if (!key) continue
      if (isResolvedQaStatus(qa.status)) continue
      const arr = openByKey.get(key) ?? []
      arr.push(qa)
      openByKey.set(key, arr)
    }

    for (const [, rows] of openByKey.entries()) {
      if (rows.length <= 1) continue
      rows.sort((a, b) => a.createdAt - b.createdAt)
      const keep = rows[0]
      for (const row of rows) {
        if (row._id === keep._id) continue
        await ctx.db.patch(row._id, {
          status: 'dismissed',
          triggeredBy: `dedupe:${String(keep._id)}`,
        })
      }
    }

    await ctx.db.patch(args.runId, {
      planDocVersion: currentVersion + 1,
      updatedAt: Date.now(),
    })

    await ctx.db.insert('sdkRunEvents', {
      runId: args.runId,
      type: 'sdk_rebase_from_answers',
      payload: {
        answeredCount: answeredRows.length,
        previousPlanVersion: currentVersion,
        nextPlanVersion: currentVersion + 1,
        versionMismatch,
      },
      createdAt: Date.now(),
    })

    return {
      ok: true,
      answeredCount: answeredRows.length,
      previousPlanVersion: currentVersion,
      nextPlanVersion: currentVersion + 1,
      versionMismatch,
    }
  },
})

export const acquireManualRegenLock = internalMutation({
  args: {
    runId: v.id('sdkRuns'),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId)
    if (!run) return { ok: false, reason: 'run_not_found' as const }
    if (run.regenStatus === 'running') {
      return {
        ok: true,
        alreadyRunning: true,
        regenRunId: run.regenRunId ?? null,
      }
    }

    const now = Date.now()
    const regenRunId = `${String(args.runId)}:${now}`
    await ctx.db.patch(args.runId, {
      regenStatus: 'running',
      regenRunId,
      regenRequestedAt: now,
      updatedAt: now,
      lastError: undefined,
    })
    await ctx.db.insert('sdkRunEvents', {
      runId: args.runId,
      type: 'sdk_regen_requested',
      payload: {
        regenRunId,
      },
      createdAt: now,
    })
    return {
      ok: true,
      alreadyRunning: false,
      regenRunId,
    }
  },
})

export const getManualRegenInputs = internalQuery({
  args: {
    projectId: v.id('projects'),
    runId: v.id('sdkRuns'),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId)
    if (!run || run.projectId !== args.projectId) return null

    const [planDoc, elements, qaPairs] = await Promise.all([
      ctx.db
        .query('memoryDocs')
        .withIndex('by_project_kind', (q) =>
          q.eq('projectId', args.projectId).eq('kind', 'PROJECT_CONTEXT')
        )
        .first(),
      ctx.db
        .query('elements')
        .withIndex('by_project', (q) => q.eq('projectId', args.projectId))
        .collect(),
      ctx.db
        .query('qaPairs')
        .withIndex('by_project', (q) => q.eq('projectId', args.projectId))
        .collect(),
    ])

    const sortedElements = [...elements].sort((a, b) => {
      const ao = typeof a.order === 'number' ? a.order : Number.MAX_SAFE_INTEGER
      const bo = typeof b.order === 'number' ? b.order : Number.MAX_SAFE_INTEGER
      if (ao !== bo) return ao - bo
      return a.createdAt - b.createdAt
    })

    const elementIndex = sortedElements.map((element, index) => ({
      stableKey: String(element._id),
      nameHe: String(element.title ?? ''),
      orderIndex: index + 1,
    }))

    return {
      run: {
        _id: run._id,
        conversationId: run.conversationId,
        dirtyAnswersCount: Number(run.dirtyAnswersCount ?? 0),
        lastServedOrderKey: run.lastServedOrderKey ?? null,
      },
      planDoc: {
        id: planDoc?._id ?? null,
        version: Number(planDoc?.schemaVersion ?? 0),
        markdown: String(parseDoc(planDoc?.contentMd_he)?.planMd ?? ''),
      },
      elementIndex,
      qaPairs: qaPairs.map((qa) => ({
        id: qa._id,
        questionHe: qa.question_he,
        questionKey: qa.questionKey ?? null,
        status: qa.status ?? 'open',
        questionType: qa.questionType ?? 'text',
        answerText: extractAnswerText(qa),
        scopeType: qa.scopeType ?? null,
        scopeKey: qa.scopeKey ?? null,
        blockingLevel: qa.blockingLevel ?? 'helpful',
        orderKey: qa.orderKey ?? null,
        dedupeKey: qa.dedupeKey ?? null,
        followUp: Boolean(qa.followUp),
      })),
    }
  },
})

export const applyRegenerationPatch = internalMutation({
  args: {
    projectId: v.id('projects'),
    runId: v.id('sdkRuns'),
    regenRunId: v.string(),
    expectedPlanVersion: v.number(),
    newPlanDocMarkdown: v.string(),
    questionOps: v.object({
      add: v.array(v.any()),
      dismiss: v.array(v.any()),
      promote: v.array(v.any()),
      dedupe: v.array(v.any()),
    }),
  },
  handler: async (ctx, args) => {
    const now = Date.now()
    const run = await ctx.db.get(args.runId)
    if (!run) return { ok: false, reason: 'run_not_found' as const }
    if (run.projectId !== args.projectId) return { ok: false, reason: 'run_project_mismatch' as const }
    if (run.regenStatus !== 'running' || run.regenRunId !== args.regenRunId) {
      return { ok: false, reason: 'regen_lock_lost' as const }
    }

    const planDoc = await ctx.db
      .query('memoryDocs')
      .withIndex('by_project_kind', (q) =>
        q.eq('projectId', args.projectId).eq('kind', 'PROJECT_CONTEXT')
      )
      .first()
    if (!planDoc) return { ok: false, reason: 'plan_doc_not_found' as const }
    const currentVersion = Number(planDoc.schemaVersion ?? 0)
    if (!canApplyPlanDocCas(args.expectedPlanVersion, currentVersion)) {
      return {
        ok: false,
        reason: 'cas_mismatch' as const,
        expectedPlanVersion: args.expectedPlanVersion,
        currentPlanVersion: currentVersion,
      }
    }

    const parsed = parseDoc(planDoc.contentMd_he)
    const nextPlanVersion = currentVersion + 1
    const nextPayload = {
      ...(typeof parsed === 'object' && parsed ? parsed : {}),
      planVersion: nextPlanVersion,
      planMd: args.newPlanDocMarkdown,
      updatedAt: now,
      lastRegenAt: now,
      lastRegenRunId: args.regenRunId,
    }
    await ctx.db.patch(planDoc._id, {
      contentMd_he: JSON.stringify(nextPayload),
      schemaVersion: nextPlanVersion,
      updatedAt: now,
    })

    const [allQa, elements] = await Promise.all([
      ctx.db
        .query('qaPairs')
        .withIndex('by_project', (q) => q.eq('projectId', args.projectId))
        .collect(),
      ctx.db
        .query('elements')
        .withIndex('by_project', (q) => q.eq('projectId', args.projectId))
        .collect(),
    ])

    const maxAddsPerRegen = 40
    const maxNewBlockersPerRegen = 10

    const byId = new Map(allQa.map((qa) => [String(qa._id), qa]))
    const openByDedupe = new Set<string>()
    const resolvedByDedupe = new Set<string>()
    for (const qa of allQa) {
      const key = String(qa.dedupeKey ?? '').trim()
      if (!key) continue
      const scopeRef = String(qa.scopeKey ?? '__global__')
      const dedupeScope = `${key}::${scopeRef}`
      if (isResolvedQaStatus(qa.status)) {
        resolvedByDedupe.add(dedupeScope)
      } else {
        openByDedupe.add(dedupeScope)
      }
    }

    let dismissedCount = 0
    for (const op of args.questionOps.dismiss) {
      const id = String(op?.questionId ?? '')
      if (!id) continue
      const row = byId.get(id)
      if (!row || isResolvedQaStatus(row.status)) continue
      if (!shouldAllowStatusTransition(row.status, 'dismissed')) continue
      await ctx.db.patch(row._id, {
        status: 'dismissed',
        triggeredBy: String(op?.reason ?? 'regen_dismiss'),
        version: typeof row.version === 'number' ? row.version + 1 : 1,
      })
      dismissedCount += 1
    }

    let promotedCount = 0
    for (const op of args.questionOps.promote) {
      const id = String(op?.questionId ?? '')
      if (!id) continue
      const row = byId.get(id)
      if (!row || isResolvedQaStatus(row.status)) continue
      if (!shouldAllowStatusTransition(row.status, row.status)) continue
      if (row.blockingLevel === 'blocker') continue
      await ctx.db.patch(row._id, {
        blockingLevel: 'blocker',
        triggeredBy: String(op?.reason ?? 'regen_promote'),
        version: typeof row.version === 'number' ? row.version + 1 : 1,
      })
      promotedCount += 1
    }

    for (const op of args.questionOps.dedupe) {
      const keepId = String(op?.keepQuestionId ?? '')
      const candidateKey = String(op?.candidateDedupeKey ?? '').trim()
      if (!keepId || !candidateKey) continue
      for (const qa of allQa) {
        if (String(qa._id) === keepId) continue
        if (String(qa.dedupeKey ?? '').trim() !== candidateKey) continue
        if (isResolvedQaStatus(qa.status)) continue
        if (!shouldAllowStatusTransition(qa.status, 'dismissed')) continue
        await ctx.db.patch(qa._id, {
          status: 'dismissed',
          triggeredBy: `dedupe:${keepId}`,
          version: typeof qa.version === 'number' ? qa.version + 1 : 1,
        })
        dismissedCount += 1
      }
    }

    const sortedElements = [...elements].sort((a, b) => {
      const ao = typeof a.order === 'number' ? a.order : Number.MAX_SAFE_INTEGER
      const bo = typeof b.order === 'number' ? b.order : Number.MAX_SAFE_INTEGER
      if (ao !== bo) return ao - bo
      return a.createdAt - b.createdAt
    })
    const elementOrderMap = new Map<string, number>()
    for (let i = 0; i < sortedElements.length; i += 1) {
      elementOrderMap.set(String(sortedElements[i]._id), i + 1)
    }

    const projectState = await ctx.db
      .query('sdkProjectState')
      .withIndex('by_project', (q) => q.eq('projectId', args.projectId))
      .first()
    let nextOrdinal = Number(projectState?.nextQuestionOrdinal ?? 1)
    const stateId = projectState
      ? projectState._id
      : await ctx.db.insert('sdkProjectState', {
          projectId: args.projectId,
          nextQuestionOrdinal: nextOrdinal,
          createdAt: now,
          updatedAt: now,
        })

    const addOpsWithNormalizedBlocking = (Array.isArray(args.questionOps.add) ? args.questionOps.add : []).map((op) => ({
      ...op,
      blockingLevel: normalizeBlockingLevel(op?.blockingLevel),
    }))
    const cappedAdds = applyRegenCaps(addOpsWithNormalizedBlocking, maxAddsPerRegen, maxNewBlockersPerRegen)
    let addedCount = 0
    let addedBlockers = 0
    let truncatedCount = cappedAdds.truncated
    for (const op of cappedAdds.kept) {
      const scopeType = normalizeScopeType(op?.scopeType)
      const blockingLevel = normalizeBlockingLevel(op?.blockingLevel)

      const questionHe = String(op?.questionText ?? '').trim()
      if (!questionHe) continue
      const rawScopeKey = String(op?.scopeKey ?? '').trim()
      const scopeKey = scopeType === 'project'
        ? '__global__'
        : rawScopeKey || '__element_unknown__'
      const dedupeKey =
        String(op?.dedupeKey ?? '').trim() ||
        stableHash(`${scopeType}:${scopeKey}:${questionHe.toLowerCase()}`)
      const dedupeScopeRef = `${dedupeKey}::${scopeKey}`
      const followUp = Boolean(op?.followUp)
      const whyNow = String(op?.whyNow ?? '').trim()
      if (!shouldInsertQuestionFromDedupe({
        hasOpenWithSameDedupe: openByDedupe.has(dedupeScopeRef),
        hasResolvedWithSameDedupe: resolvedByDedupe.has(dedupeScopeRef),
        followUp,
        whyNow,
      })) {
        continue
      }

      const sectionPath = normalizeSectionPath(op?.sectionPath)
      const bucket = computeBucket(scopeType, blockingLevel)
      const elementOrder =
        scopeType === 'element'
          ? String(elementOrderMap.get(scopeKey) ?? 999).padStart(3, '0')
          : '000'
      const ordinal = nextOrdinal
      nextOrdinal += 1
      const orderKey = `${bucket}/${elementOrder}/${sectionPath.join('.')}/${String(ordinal).padStart(6, '0')}`
      const triggerList = Array.isArray(op?.triggeredBy) ? op.triggeredBy.map((item: any) => String(item)).filter(Boolean) : []

      await ctx.db.insert('qaPairs', {
        projectId: args.projectId,
        question_he: questionHe,
        questionKey: dedupeKey,
        status: 'open',
        questionType: normalizeQuestionType(op?.questionType),
        options: Array.isArray(op?.options)
          ? op.options.map((value: any, index: number) => ({
              value: `opt_${index + 1}`,
              labelHe: String(value ?? '').trim() || undefined,
            }))
          : undefined,
        scopeType: scopeType === 'project' ? 'project' : 'element',
        scopeKey,
        sectionPath,
        blockingLevel,
        orderKey,
        createdFrom: 'manual',
        followUp,
        triggeredBy: triggerList.length > 0 ? triggerList.join(',') : whyNow || 'regen',
        dedupeKey,
        createdOrdinal: ordinal,
        version: 1,
        createdAt: now,
      })
      openByDedupe.add(dedupeScopeRef)
      addedCount += 1
      if (blockingLevel === 'blocker') addedBlockers += 1
    }

    await ctx.db.patch(stateId, {
      nextQuestionOrdinal: nextOrdinal,
      updatedAt: now,
    })

    const openProjectBlockersAfter = (
      await ctx.db
        .query('qaPairs')
        .withIndex('by_project_blockingLevel', (q) =>
          q.eq('projectId', args.projectId).eq('blockingLevel', 'blocker')
        )
        .collect()
    ).filter((qa) => !isResolvedQaStatus(qa.status) && (qa.scopeType === 'project' || qa.scopeType === 'global')).length

    await ctx.db.patch(args.runId, {
      regenStatus: 'idle',
      dirtyAnswersCount: 0,
      regenCompletedAt: now,
      planDocVersion: nextPlanVersion,
      lastRegenPlanDocVersion: nextPlanVersion,
      updatedAt: now,
    })

    const summary = {
      added: addedCount,
      dismissed: dismissedCount,
      promoted: promotedCount,
      openProjectBlockersAfter,
      truncated: truncatedCount,
      notes: truncatedCount > 0 ? `Truncated ${truncatedCount} suggestions` : '',
      nextPlanVersion,
    }
    await ctx.db.insert('sdkRunEvents', {
      runId: args.runId,
      type: 'sdk_regen_applied',
      payload: {
        regenRunId: args.regenRunId,
        ...summary,
      },
      createdAt: now,
    })

    return {
      ok: true,
      summary,
    }
  },
})

export const failManualRegen = internalMutation({
  args: {
    runId: v.id('sdkRuns'),
    regenRunId: v.optional(v.string()),
    errorMessage: v.string(),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId)
    if (!run) return { ok: false, reason: 'run_not_found' as const }
    if (run.regenStatus !== 'running') return { ok: true, skipped: true }
    if (args.regenRunId && run.regenRunId && run.regenRunId !== args.regenRunId) {
      return { ok: true, skipped: true }
    }
    const now = Date.now()
    await ctx.db.patch(args.runId, {
      regenStatus: 'failed',
      lastError: args.errorMessage,
      updatedAt: now,
    })
    await ctx.db.insert('sdkRunEvents', {
      runId: args.runId,
      type: 'sdk_regen_failed',
      payload: {
        regenRunId: args.regenRunId ?? run.regenRunId ?? null,
        error: args.errorMessage,
      },
      createdAt: now,
    })
    return { ok: true }
  },
})
