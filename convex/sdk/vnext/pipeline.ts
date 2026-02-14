"use node"

import { randomUUID } from 'crypto'
import { api, internal } from '../../_generated/api'
import {
  StageArtifactMap,
  TargetPlanSpec,
  VNEXT_STAGE_ORDER,
  VNextStageKey,
  VNextStageRunOutput,
} from './contracts'
import { runSemanticAudit } from './auditBridge'
import { compileDeterministicChangeSet } from './compiler'
import { buildTargetPlanSpec } from './specBuilder'
import { runStageSkills } from './skillBridge'
import { computeStageProgress, MAX_NO_PROGRESS_CYCLES, shouldTriggerNoProgressGuard } from './progress'
import { getNextVNextStage, normalizeVNextStage, VNEXT_STAGE_META } from './stages'
import { validateAudit } from './validators/validateAudit'
import { validateBrief } from './validators/validateBrief'
import { validateBudget } from './validators/validateBudget'
import { validateCompile } from './validators/validateCompile'
import { validateConcept } from './validators/validateConcept'
import { validateOps } from './validators/validateOps'
import { validatePricing } from './validators/validatePricing'
import { validateQuote } from './validators/validateQuote'
import { validateScope } from './validators/validateScope'
import { validateTasks } from './validators/validateTasks'

function stableHash(input: string) {
  let h = 2166136261
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return `h${(h >>> 0).toString(16)}`
}

function buildQuestionsBlock(stageKey: VNextStageKey, titleHe: string, questions: any[]) {
  return {
    type: 'QuestionsBlock',
    sdkVnext: true,
    stageKey,
    titleHe: `${titleHe} - נדרש מידע`,
    questions: questions.map((q: any, idx: number) => ({
      id: q.id ?? `q_${idx + 1}`,
      textHe: q.textHe ?? 'יש להשלים מידע',
      type: q.type ?? 'text',
      optionsHe: q.optionsHe,
      options: q.options,
      suggestedAnswers: q.suggestedAnswers,
      allowDontKnow: q.allowDontKnow ?? true,
    })),
    continueAction: {
      labelHe: 'שמור תשובות והמשך',
      payload: { action: 'sdk.vnext.continue' },
    },
  }
}

function buildReviewBlock(stageKey: VNextStageKey, titleHe: string, summaryHe: string) {
  return {
    type: 'ReviewBlock',
    sdkVnext: true,
    stageKey,
    titleHe: `${titleHe} - מוכן לבדיקה`,
    sections: [
      {
        sectionHe: 'סיכום',
        highlightsHe: [summaryHe],
        risksHe: [],
      },
    ],
  }
}

function buildSuggestionsBlock(nextStageKey: VNextStageKey | null) {
  return {
    type: 'SuggestionsBlock',
    sdkVnext: true,
    titleHe: 'פעולת המשך',
    suggestions: [
      {
        id: 'sdk_vnext_continue',
        labelHe: nextStageKey ? `להמשיך לשלב ${nextStageKey}` : 'להמשיך',
        whyHe: 'מעביר את התהליך לשלב הבא',
        payload: { action: 'sdk.vnext.continue', nextStageKey: nextStageKey ?? undefined },
      },
    ],
  }
}

function isHardBlockingStage(stageKey: VNextStageKey) {
  return stageKey === 'compile' || stageKey === 'audit'
}

function buildNoProgressQuestions(stageKey: VNextStageKey, noProgressCount: number) {
  return [
    {
      id: 'no_progress_guard',
      textHe: `לא זוהתה התקדמות בשלב ${stageKey} במשך ${noProgressCount} סבבים. מה חסר כדי להמשיך?`,
      type: 'text',
    },
  ]
}

type PricingQueueStatus = 'pending' | 'priced' | 'estimated' | 'failed'

type PricingQueueItem = {
  itemKey: string
  lineKey: string
  lineId?: string
  lineTempOrId?: string
  titleHe: string
  itemName: string
  qty: number
  status: PricingQueueStatus
  attempts: number
  unitPrice?: number
  currency?: 'ILS' | 'USD' | 'EUR'
  confidence?: 'high' | 'medium' | 'low'
  assumptionHe?: string
  sourceType?: 'catalog' | 'logged' | 'web' | 'fallback'
  reasonHe?: string
  updatedAt?: number
}

function toLineKey(line: any, index: number) {
  return String(
    line?.lineKey ??
    line?._id ??
    line?.lineId ??
    line?.id ??
    line?.lineTempOrId ??
    `line_${index + 1}`
  )
}

function adaptivePricingBatchSize(totalItems: number) {
  if (totalItems <= 3) return totalItems
  if (totalItems <= 10) return 3
  if (totalItems <= 25) return 6
  return 10
}

function normalizePricingQueue(currentArtifact: any, artifacts: StageArtifactMap): PricingQueueItem[] {
  const existingQueue = Array.isArray(currentArtifact?.workQueue) ? currentArtifact.workQueue : null
  if (existingQueue && existingQueue.length > 0) {
    return existingQueue.map((item: any, index: number) => ({
      itemKey: String(item?.itemKey ?? item?.lineKey ?? `item_${index + 1}`),
      lineKey: String(item?.lineKey ?? item?.itemKey ?? `line_${index + 1}`),
      lineId: item?.lineId ? String(item.lineId) : undefined,
      lineTempOrId: item?.lineTempOrId ? String(item.lineTempOrId) : undefined,
      titleHe: String(item?.titleHe ?? item?.itemName ?? `line ${index + 1}`),
      itemName: String(item?.itemName ?? item?.titleHe ?? `line ${index + 1}`),
      qty: Number(item?.qty ?? 1) > 0 ? Number(item?.qty ?? 1) : 1,
      status: ['pending', 'priced', 'estimated', 'failed'].includes(String(item?.status))
        ? item.status
        : 'pending',
      attempts: Number(item?.attempts ?? 0),
      unitPrice: typeof item?.unitPrice === 'number' ? item.unitPrice : undefined,
      currency: item?.currency,
      confidence: item?.confidence,
      assumptionHe: item?.assumptionHe,
      sourceType: item?.sourceType,
      reasonHe: item?.reasonHe,
      updatedAt: item?.updatedAt,
    }))
  }

  const budgetMaterial = Array.isArray((artifacts.budget as any)?.materialLines)
    ? (artifacts.budget as any).materialLines
    : []
  const budgetWork = Array.isArray((artifacts.budget as any)?.workLines)
    ? (artifacts.budget as any).workLines
    : []
  const budgetLines = [...budgetMaterial, ...budgetWork]
  return budgetLines.map((line: any, index: number) => {
    const lineKey = toLineKey(line, index)
    return {
      itemKey: lineKey,
      lineKey,
      lineId: line?._id ? String(line._id) : undefined,
      lineTempOrId: line?.lineTempOrId ? String(line.lineTempOrId) : undefined,
      titleHe: String(line?.titleHe ?? line?.itemName ?? line?.name ?? `line ${index + 1}`),
      itemName: String(line?.itemName ?? line?.titleHe ?? line?.name ?? `line ${index + 1}`),
      qty: Number(line?.qty ?? line?.quantity ?? 1) > 0 ? Number(line?.qty ?? line?.quantity ?? 1) : 1,
      status: 'pending',
      attempts: 0,
    } satisfies PricingQueueItem
  })
}

function mapRecommendationToQueueItem(item: PricingQueueItem, recommendation: any): PricingQueueItem {
  const recommendedUnitPrice = Number(
    recommendation?.recommended?.unitPrice ??
    recommendation?.unitPrice ??
    0
  )
  const currency = String(
    recommendation?.recommended?.currency ??
    recommendation?.currency ??
    'ILS'
  ).toUpperCase() as 'ILS' | 'USD' | 'EUR'
  const confidence = String(recommendation?.confidence ?? '').toLowerCase()
  const normalizedConfidence: 'high' | 'medium' | 'low' =
    confidence === 'high' || confidence === 'medium' ? confidence : 'low'
  const candidates = Array.isArray(recommendation?.candidates) ? recommendation.candidates : []
  const sourceType = String(candidates[0]?.sourceType ?? '').toLowerCase()
  const assumptions = Array.isArray(recommendation?.assumptionsHe)
    ? recommendation.assumptionsHe
    : []
  const assumptionHe = assumptions.length > 0
    ? String(assumptions[0])
    : String(recommendation?.recommended?.priceBasisHe ?? 'Estimated pricing assumption')
  const hasPrice = Number.isFinite(recommendedUnitPrice) && recommendedUnitPrice > 0
  const isEstimated =
    normalizedConfidence === 'low' ||
    sourceType === 'fallback' ||
    sourceType.length === 0

  if (!hasPrice) {
    return {
      ...item,
      attempts: item.attempts + 1,
      status: item.attempts + 1 >= 2 ? 'failed' : 'pending',
      reasonHe: item.attempts + 1 >= 2
        ? 'Pricing response returned without a usable unit price'
        : item.reasonHe,
      updatedAt: Date.now(),
    }
  }

  return {
    ...item,
    attempts: item.attempts + 1,
    unitPrice: recommendedUnitPrice,
    currency: currency === 'USD' || currency === 'EUR' ? currency : 'ILS',
    confidence: normalizedConfidence,
    sourceType: sourceType === 'catalog' || sourceType === 'logged' || sourceType === 'web' || sourceType === 'fallback'
      ? sourceType
      : undefined,
    status: isEstimated ? 'estimated' : 'priced',
    assumptionHe,
    reasonHe: isEstimated ? assumptionHe : undefined,
    updatedAt: Date.now(),
  }
}

function validateByStage(args: {
  stageKey: VNextStageKey
  spec: TargetPlanSpec
  artifact: any
  artifacts: StageArtifactMap
}) {
  if (args.stageKey === 'brief') return validateBrief({ spec: args.spec, artifact: args.artifact })
  if (args.stageKey === 'scope') return validateScope({ spec: args.spec, artifact: args.artifact })
  if (args.stageKey === 'concept') return validateConcept()
  if (args.stageKey === 'tasks') return validateTasks({ artifact: args.artifact })
  if (args.stageKey === 'budget') {
    return validateBudget({
      tasksArtifact: args.artifacts.tasks,
      budgetArtifact: args.artifact,
    })
  }
  if (args.stageKey === 'pricing') {
    return validatePricing({
      pricingArtifact: args.artifact,
      budgetArtifact: args.artifacts.budget,
    })
  }
  if (args.stageKey === 'ops') {
    return validateOps({
      opsArtifact: args.artifact,
      coverageRules: args.spec.coverageRules,
    })
  }
  if (args.stageKey === 'quote') {
    return validateQuote({
      quoteArtifact: args.artifact,
      scopeArtifact: args.artifacts.scope,
      pricingArtifact: args.artifacts.pricing,
    })
  }
  if (args.stageKey === 'audit') {
    return validateAudit({
      findings: args.artifact?.findings,
      acceptedRiskNote: args.artifact?.acceptedRiskNote,
    })
  }
  return { status: 'pass', issues: [], blockingQuestions: [] } as const
}

function mergeArtifact(
  stageKey: VNextStageKey,
  current: any,
  skillOutputs: Record<string, any>,
  artifacts: StageArtifactMap
) {
  const next = { ...(current ?? {}) }

  if (stageKey === 'brief') {
    const parsed = skillOutputs['intake.parse_brief']?.brief ?? {}
    next.normalizedFacts = { ...(next.normalizedFacts ?? {}), ...(parsed ?? {}) }
    return next
  }
  if (stageKey === 'scope') {
    const rawElements = Array.isArray(skillOutputs['plan.elements']?.elements)
      ? skillOutputs['plan.elements'].elements
      : []
    next.proposedElements = rawElements.map((element: any, index: number) => ({
      nameHe: element?.nameHe ?? element?.titleHe ?? element?.name ?? `אלמנט ${index + 1}`,
      elementKey: String(element?.elementKey ?? element?.key ?? `element_${index + 1}`),
      rationaleHe: element?.rationaleHe ?? element?.reasonHe ?? 'נוצר מתכנון אוטומטי',
    }))
    return next
  }
  if (stageKey === 'concept') {
    const free = skillOutputs['chat.free'] ?? {}
    next.directions = Array.isArray(free?.directions) ? free.directions : next.directions ?? []
    return next
  }
  if (stageKey === 'tasks') {
    const rawTasks = Array.isArray(skillOutputs['plan.tasks']?.tasks)
      ? skillOutputs['plan.tasks'].tasks
      : []
    const scopeElements = Array.isArray((artifacts.scope as any)?.proposedElements)
      ? (artifacts.scope as any).proposedElements
      : []
    const fallbackElementKeys = scopeElements
      .map((item: any) => String(item?.elementKey ?? '').trim())
      .filter(Boolean)
    const knownElementKeys = new Set(fallbackElementKeys)

    const findElementKeyFromTitle = (title: string) => {
      const normalizedTitle = title.toLowerCase()
      for (const element of scopeElements) {
        const key = String(element?.elementKey ?? '').trim()
        const name = String(element?.nameHe ?? '').trim().toLowerCase()
        if (!key || !name) continue
        if (normalizedTitle.includes(name)) return key
      }
      return undefined
    }

    const dedup = new Set<string>()
    next.tasks = rawTasks
      .map((task: any, index: number) => {
        const titleHe = String(task?.titleHe ?? task?.title ?? `task ${index + 1}`).trim()
        const directCandidate = String(
          task?.elementKey ?? task?.elementTempOrId ?? task?.elementId ?? ''
        ).trim()
        const elementKey =
          (directCandidate && knownElementKeys.has(directCandidate) ? directCandidate : undefined) ??
          findElementKeyFromTitle(titleHe) ??
          (fallbackElementKeys.length > 0 ? fallbackElementKeys[index % fallbackElementKeys.length] : undefined)

        return {
          titleHe,
          taskKey: String(task?.taskKey ?? task?.titleHe ?? task?.title ?? `task_${index + 1}`),
          elementKey,
          durationHours:
            typeof task?.estimatedHours === 'number'
              ? task.estimatedHours
              : typeof task?.estimateHours === 'number'
                ? task.estimateHours
                : typeof task?.durationHours === 'number'
                  ? task.durationHours
                  : undefined,
          category: task?.category,
          stageKey: String(task?.stageKey ?? task?.stage ?? '').trim() || undefined,
          workType: String(task?.workType?.key ?? task?.workType ?? '').trim() || undefined,
          workTypeLabelHe:
            String(task?.workTypeLabelHe ?? task?.workType?.labelHe ?? '').trim() || undefined,
          dedupKey: String(task?.dedupKey ?? '').trim() || undefined,
          doneCriteriaHe: String(task?.doneCriteriaHe ?? '').trim() || undefined,
          checklist: toChecklistItems(task),
        }
      })
      .filter((task: any) => {
        if (!task?.titleHe || !task?.elementKey) return false
        const dedupKey = `${String(task.elementKey)}::${String(task.titleHe).trim().toLowerCase()}`
        if (dedup.has(dedupKey)) return false
        dedup.add(dedupKey)
        return true
      })
    return next
  }
  if (stageKey === 'budget') {
    const raw = skillOutputs['cost.build_budget'] ?? {}
    next.materialLines = Array.isArray(raw?.materialLines) ? raw.materialLines : []
    next.workLines = Array.isArray(raw?.workLines) ? raw.workLines : []
    next.budgetSkeleton = raw?.budgetSkeleton ?? {
      materialLines: next.materialLines,
      workLines: next.workLines,
    }
    return next
  }
  if (stageKey === 'pricing') {
    const raw = skillOutputs['pricing.resolve_lines'] ?? {}
    const recommendations = Array.isArray(raw?.recommendations) ? raw.recommendations : []
    const currentQueue = normalizePricingQueue(current, artifacts)
    const recommendationByKey = new Map<string, any>()
    for (const rec of recommendations) {
      const lineRef = rec?.lineRef ?? {}
      const keys = [
        lineRef?.lineId ? String(lineRef.lineId) : '',
        lineRef?.lineTempOrId ? String(lineRef.lineTempOrId) : '',
        rec?.lineKey ? String(rec.lineKey) : '',
      ].filter(Boolean)
      for (const key of keys) {
        recommendationByKey.set(key, rec)
      }
    }

    const batchKeys = Array.isArray(current?.activeBatchKeys)
      ? current.activeBatchKeys.map((key: any) => String(key))
      : []
    const batchKeySet = new Set(batchKeys)
    const updatedQueue = currentQueue.map((item) => {
      const matched = recommendationByKey.get(item.lineId ?? '') ??
        recommendationByKey.get(item.lineTempOrId ?? '') ??
        recommendationByKey.get(item.lineKey)
      if (matched) return mapRecommendationToQueueItem(item, matched)
      if (batchKeySet.has(item.itemKey) && item.status === 'pending') {
        const attempts = item.attempts + 1
        return {
          ...item,
          attempts,
          status: attempts >= 2 ? 'failed' : 'pending',
          reasonHe: attempts >= 2 ? 'No pricing recommendation was returned for this line' : item.reasonHe,
          updatedAt: Date.now(),
        }
      }
      return item
    })

    const resolvedLines = updatedQueue
      .filter((item) => item.status === 'priced' || item.status === 'estimated')
      .map((item) => ({
        lineKey: item.lineKey,
        titleHe: item.titleHe,
        itemName: item.itemName,
        qty: item.qty,
        unitPrice: Number(item.unitPrice ?? 0),
        currency: item.currency ?? 'ILS',
        isEstimate: item.status === 'estimated',
        assumptionHe: String(item.assumptionHe ?? item.reasonHe ?? ''),
        confidence: item.confidence ?? 'low',
      }))

    next.recommendations = recommendations
    next.workQueue = updatedQueue
    next.pricedLines = resolvedLines
    next.unresolvedLines = updatedQueue
      .filter((item) => item.status === 'failed' || item.status === 'pending')
      .map((item) => ({
        lineKey: item.lineKey,
        itemName: item.itemName,
        status: item.status,
        reasonHe: item.reasonHe ?? (item.status === 'pending' ? 'Pricing in progress' : 'Missing reason'),
      }))
    next.queueSummary = {
      total: updatedQueue.length,
      pending: updatedQueue.filter((item) => item.status === 'pending').length,
      priced: updatedQueue.filter((item) => item.status === 'priced').length,
      estimated: updatedQueue.filter((item) => item.status === 'estimated').length,
      failed: updatedQueue.filter((item) => item.status === 'failed').length,
      activeBatchSize: batchKeys.length,
    }
    next.activeBatchKeys = []
    return next
  }
  if (stageKey === 'ops') {
    const phases = skillOutputs['plan.execution_phases']?.phases ?? []
    const runbook = skillOutputs['runbook.installation']?.runbook ?? null
    const dailyPlan = skillOutputs['ops.daily_plan']?.dailyPlan ?? []
    next.opsPlan = { phases, runbook, dailyPlan }
    next.steps = [...(Array.isArray(phases) ? phases : []), ...(Array.isArray(dailyPlan) ? dailyPlan : [])]
    return next
  }
  if (stageKey === 'quote') {
    const quote = skillOutputs['quote.generate']?.quote ?? skillOutputs['quote.generate']?.quoteDraft ?? {}
    const scopeElements = Array.isArray((artifacts.scope as any)?.proposedElements)
      ? (artifacts.scope as any).proposedElements
      : []
    const pricedLines = Array.isArray((artifacts.pricing as any)?.pricedLines)
      ? (artifacts.pricing as any).pricedLines
      : []
    const normalizedSections = Array.isArray(quote?.sections) ? [...quote.sections] : []

    if (normalizedSections.length === 0) {
      for (const element of scopeElements) {
        const nameHe = String(element?.nameHe ?? '').trim()
        if (!nameHe) continue
        normalizedSections.push({
          titleHe: nameHe,
          bodyHe: `Scope item: ${nameHe}`,
          lineItems: pricedLines
            .filter((line: any) => String(line?.titleHe ?? line?.itemName ?? '').includes(nameHe))
            .slice(0, 3)
            .map((line: any) => ({
              titleHe: String(line?.titleHe ?? line?.itemName ?? 'line'),
              qty: Number(line?.qty ?? 1),
              unitPrice: Number(line?.unitPrice ?? 0),
            })),
        })
      }
    }

    const sectionsText = JSON.stringify(normalizedSections)
    const hasAssumptions =
      sectionsText.includes('assumption') ||
      sectionsText.includes('Assumption')
    if (!hasAssumptions) {
      normalizedSections.push({
        titleHe: 'Assumptions',
        bodyHe: 'Assumption: pricing and execution are based on current known constraints and may adjust after site verification.',
      })
    }

    next.quoteDraft = {
      ...quote,
      titleHe: String(quote?.titleHe ?? 'Quote Draft'),
      sections: normalizedSections,
      quoteTextHe: String(quote?.quoteTextHe ?? 'Quote draft generated from approved scope and pricing.'),
    }
    return next
  }
  if (stageKey === 'audit') {
    const auditResult = skillOutputs['audit.project'] ?? {}
    next.findings = Array.isArray(auditResult?.findings) ? auditResult.findings : []
    next.summaryHe = auditResult?.summaryHe
    return next
  }
  return next
}

function toChecklistItems(task: any) {
  const explicitChecklist = Array.isArray(task?.checklist) ? task.checklist : []
  if (explicitChecklist.length > 0) {
    return explicitChecklist
      .map((item: any, index: number) => {
        const title = String(item?.title ?? item?.textHe ?? item?.labelHe ?? '').trim()
        if (!title) return null
        return {
          id: String(item?.id ?? `item_${index + 1}`),
          title,
          done: typeof item?.done === 'boolean' ? item.done : false,
          order: Number.isFinite(item?.order) ? Number(item.order) : index,
          estimatedHours:
            typeof item?.estimatedHours === 'number'
              ? item.estimatedHours
              : typeof item?.estimatedMinutes === 'number'
                ? item.estimatedMinutes / 60
                : undefined,
          workType: typeof item?.workType === 'string' ? item.workType : undefined,
          workTypeLabelHe: typeof item?.workTypeLabelHe === 'string' ? item.workTypeLabelHe : undefined,
        }
      })
      .filter(Boolean)
  }

  const checklistHe = Array.isArray(task?.checklistHe) ? task.checklistHe : []
  const subtasksHe = Array.isArray(task?.subtasksHe) ? task.subtasksHe : []
  const fallbackTitles = [...checklistHe, ...subtasksHe]
  return fallbackTitles
    .map((value: any, index: number) => {
      const title = String(value ?? '').trim()
      if (!title) return null
      return {
        id: `item_${index + 1}`,
        title,
        done: false,
        order: index,
      }
    })
    .filter(Boolean)
}

function buildPersistedArtifact(args: {
  stageKey: VNextStageKey
  mergedArtifact: any
  skillOutputs: Record<string, any>
  specHash: string
  artifactHash: string
}) {
  const base = args.mergedArtifact && typeof args.mergedArtifact === 'object'
    ? { ...args.mergedArtifact }
    : {}
  const previousMeta =
    base.__persisted && typeof base.__persisted === 'object'
      ? base.__persisted
      : {}
  return {
    ...base,
    __persisted: {
      ...previousMeta,
      source: 'vnext_pipeline',
      stageKey: args.stageKey,
      savedAt: Date.now(),
      specHash: args.specHash,
      artifactHash: args.artifactHash,
      toolOutputs: args.skillOutputs,
    },
  }
}

function buildStageSummary(stageKey: VNextStageKey, artifact: any) {
  if (stageKey === 'brief') {
    const facts = Object.keys(artifact?.normalizedFacts ?? {}).length
    return `עודכנו ${facts} עובדות בבריף`
  }
  if (stageKey === 'scope') {
    const count = Array.isArray(artifact?.proposedElements) ? artifact.proposedElements.length : 0
    return `נסגרו ${count} אלמנטים`
  }
  if (stageKey === 'tasks') {
    const count = Array.isArray(artifact?.tasks) ? artifact.tasks.length : 0
    return `הופק פירוק של ${count} משימות`
  }
  if (stageKey === 'budget') {
    const m = Array.isArray(artifact?.materialLines) ? artifact.materialLines.length : 0
    const w = Array.isArray(artifact?.workLines) ? artifact.workLines.length : 0
    return `נבנו ${m} שורות חומרים ו-${w} שורות עבודה`
  }
  if (stageKey === 'pricing') {
    const summary = artifact?.queueSummary ?? {}
    const total = Number(summary?.total ?? 0)
    const priced = Number(summary?.priced ?? 0)
    const estimated = Number(summary?.estimated ?? 0)
    const pending = Number(summary?.pending ?? 0)
    const failed = Number(summary?.failed ?? 0)
    return `Pricing progress ${priced + estimated}/${total} (pending ${pending}, failed ${failed})`
  }
  if (stageKey === 'ops') {
    const count = Array.isArray(artifact?.steps) ? artifact.steps.length : 0
    return `נבנתה תוכנית ביצוע עם ${count} פריטים`
  }
  if (stageKey === 'quote') {
    return 'טיוטת הצעה הוכנה לבדיקה'
  }
  if (stageKey === 'audit') {
    const findings = Array.isArray(artifact?.findings) ? artifact.findings.length : 0
    return `בוצעה ביקורת איכות עם ${findings} ממצאים`
  }
  return 'השלב הושלם'
}

function missingDependency(stageKey: VNextStageKey, artifacts: StageArtifactMap) {
  const index = VNEXT_STAGE_ORDER.indexOf(stageKey)
  if (index <= 0) return null
  const prev = VNEXT_STAGE_ORDER[index - 1]
  if (!(artifacts as any)[prev]) {
    return prev
  }
  return null
}

export async function runVNextStage(args: {
  ctx: any
  projectId: any
  conversationId: any
  run: any
  runId: any
  userMessage?: string
  options?: {
    softGates?: boolean
    pricingQueue?: boolean
    stageBudgets?: boolean
  }
}): Promise<VNextStageRunOutput> {
  const stageKey = normalizeVNextStage(args.run.stageKey)
  const stageTitle = VNEXT_STAGE_META[stageKey].titleHe
  const useSoftGates = args.options?.softGates !== false
  const usePricingQueue = args.options?.pricingQueue !== false

  const projectContext = await args.ctx.runQuery(api.sdk.api.contextGet, {
    projectId: args.projectId,
    packs: ['project', 'elements', 'tasks', 'knowledge'],
  })
  const messages = await args.ctx.runQuery(api.sdk.api.listMessages, {
    conversationId: args.conversationId,
    runId: args.runId,
    limit: 60,
  })
  const artifactsRows = await args.ctx.runQuery(internal['sdk/vnext/artifacts'].listStageArtifactsByRun, {
    runId: args.runId,
  })
  const stageDecisions = await args.ctx.runQuery(internal['sdk/vnext/artifacts'].listStageDecisionsByRun, {
    runId: args.runId,
  })
  const artifacts: StageArtifactMap = {}
  for (const row of artifactsRows) {
    ;(artifacts as any)[row.stageKey] = row.artifact
  }
  const existingStageArtifactRow = artifactsRows.find((row: any) => row.stageKey === stageKey) ?? null

  const dependency = missingDependency(stageKey, artifacts)
  if (dependency) {
    await args.ctx.runMutation(internal.sdk.telemetry.updateRunState, {
      runId: args.runId,
      status: 'needs_input',
      stageKey,
      lastError: `VNEXT_DEPENDENCY_MISSING:${dependency}`,
    })
    return {
      stageKey,
      status: 'needs_input',
      blocks: [
        buildQuestionsBlock(stageKey, stageTitle, [
          {
            id: 'dependency_stage',
            textHe: `לפני ${stageKey} צריך להשלים את שלב ${dependency}`,
            type: 'text',
          },
        ]),
      ],
    }
  }

  const recentUserTexts = messages
    .filter((item: any) => item.role === 'user' && typeof item.text === 'string')
    .map((item: any) => item.text)
    .slice(-10)
  const scopeSeed = Array.isArray((artifacts.scope as any)?.proposedElements)
    ? (artifacts.scope as any).proposedElements
    : []

  // Fetch answered vNext qaPairs as fallback for spec builder
  const vnextQaPairs = await args.ctx.runQuery(internal['sdk/vnext/artifacts'].listAnsweredVnextQaPairs, {
    projectId: args.projectId,
  })
  const qaPairAnswers: Record<string, string> = {}
  for (const qa of vnextQaPairs) {
    if (!qa.questionKey || !qa.questionKey.startsWith('vnext.')) continue
    const parts = qa.questionKey.split('.')
    if (parts.length < 3) continue
    const semanticId = parts.slice(2).join('.')
    const answer = String(qa.answerText ?? qa.answer_he ?? qa.answer ?? '').trim()
    if (answer && !qaPairAnswers[semanticId]) {
      qaPairAnswers[semanticId] = answer
    }
  }

  const spec: TargetPlanSpec = buildTargetPlanSpec({
    projectId: args.projectId,
    project: projectContext?.project ?? {},
    recentUserTexts,
    stageDecisions,
    existingScopeElements: scopeSeed,
    qaPairAnswers,
  })

  const currentArtifact = (artifacts as any)[stageKey] ?? {}
  const preGate = stageKey === 'brief'
    ? validateByStage({ stageKey, spec, artifact: currentArtifact, artifacts })
    : { status: 'pass', issues: [], blockingQuestions: [] }
  if (preGate.status === 'fail') {
    await args.ctx.runMutation(internal.sdk.telemetry.updateRunState, {
      runId: args.runId,
      status: 'needs_input',
      stageKey,
      lastError: `VNEXT_PRE_GATE_FAIL:${stageKey}`,
    })
    return {
      stageKey,
      status: 'needs_input',
      blocks: [buildQuestionsBlock(stageKey, stageTitle, preGate.blockingQuestions)],
      telemetry: { preGateIssues: preGate.issues.length },
    }
  }

  const stageInput: any = {
    userMessage: args.userMessage,
    spec,
    artifact: currentArtifact,
    artifacts,
    context: projectContext,
  }
  if (stageKey === 'pricing') {
    const pricingQueue = normalizePricingQueue(currentArtifact, artifacts)
    const pendingItems = pricingQueue.filter((item) => item.status === 'pending')
    const batchSize = usePricingQueue
      ? adaptivePricingBatchSize(pricingQueue.length)
      : Math.max(1, pendingItems.length)
    const activeBatch = pendingItems.slice(0, batchSize)
    stageInput.pricingWorkQueue = pricingQueue
    stageInput.pricingBatch = activeBatch
    stageInput.pricingBatchSize = batchSize
    stageInput.queueSummary = {
      total: pricingQueue.length,
      pending: pendingItems.length,
      resolved: pricingQueue.length - pendingItems.length,
    }
    stageInput.artifact = {
      ...currentArtifact,
      activeBatchKeys: activeBatch.map((item) => item.itemKey),
      queueSummary: {
        total: pricingQueue.length,
        pending: pendingItems.length,
        priced: pricingQueue.filter((item) => item.status === 'priced').length,
        estimated: pricingQueue.filter((item) => item.status === 'estimated').length,
        failed: pricingQueue.filter((item) => item.status === 'failed').length,
        activeBatchSize: activeBatch.length,
      },
    }
  }
  await args.ctx.runMutation(internal.sdk.telemetry.logEvent, {
    runId: args.runId,
    type: 'vnext_stage_enter',
    payload: {
      stageKey,
      hasArtifact: Boolean(currentArtifact && Object.keys(currentArtifact).length > 0),
      queueSummary: stageKey === 'pricing' ? stageInput.queueSummary ?? null : null,
    },
  })

  const skillOutputs = await runStageSkills({
    ctx: args.ctx,
    projectId: args.projectId,
    conversationId: args.conversationId,
    runId: args.runId,
    stageKey,
    input: stageInput,
    stageBudgetsEnabled: args.options?.stageBudgets,
  })

  const mergedArtifact = stageKey === 'compile'
    ? currentArtifact
    : mergeArtifact(stageKey, stageInput.artifact ?? currentArtifact, skillOutputs, artifacts)
  if (stageKey === 'pricing') {
    await args.ctx.runMutation(internal.sdk.telemetry.logEvent, {
      runId: args.runId,
      type: 'pricing_queue_snapshot',
      payload: {
        queueSummary: mergedArtifact?.queueSummary ?? null,
        unresolvedLines: Array.isArray(mergedArtifact?.unresolvedLines)
          ? mergedArtifact.unresolvedLines.slice(0, 20)
          : [],
      },
    })
  }
  const artifactHash = stableHash(JSON.stringify(mergedArtifact))
  const specHash = stableHash(JSON.stringify(spec))
  const persistedArtifact = stageKey === 'compile'
    ? mergedArtifact
    : buildPersistedArtifact({
      stageKey,
      mergedArtifact,
      skillOutputs,
      specHash,
      artifactHash,
    })
  const { madeProgress, progressMeta } = computeStageProgress({
    stageKey,
    specHash,
    artifactHash,
    runStageKey: args.run.stageKey,
    runProgressCount: args.run.progressCount,
    runNoProgressCount: args.run.noProgressCount,
    runProgressKey: args.run.progressKey,
    fallbackProgressKey: existingStageArtifactRow?.progress?.progressKey,
    lastProgressAt: args.run.lastProgressAt,
  })

  const postSpec = stageKey === 'scope'
    ? {
      ...spec,
      scope: {
        locked: true,
        elements: Array.isArray(mergedArtifact?.proposedElements)
          ? mergedArtifact.proposedElements.map((item: any) => ({
            elementKey: String(item?.elementKey ?? ''),
            nameHe: String(item?.nameHe ?? ''),
            mustInclude: false,
          }))
          : spec.scope.elements,
      },
    }
    : spec
  const postGate = validateByStage({
    stageKey,
    spec: postSpec,
    artifact: mergedArtifact,
    artifacts,
  })
  if (postGate.status === 'fail') {
    const noProgressLimitReached = shouldTriggerNoProgressGuard({
      madeProgress,
      noProgressCount: progressMeta.noProgressCount,
      threshold: MAX_NO_PROGRESS_CYCLES,
    })
    const fallbackQuestions = noProgressLimitReached
      ? buildNoProgressQuestions(stageKey, progressMeta.noProgressCount)
      : []
    const blockingQuestions = postGate.blockingQuestions.length > 0
      ? postGate.blockingQuestions
      : fallbackQuestions

    if (!isHardBlockingStage(stageKey) && useSoftGates) {
      const needsInput = noProgressLimitReached || blockingQuestions.length > 0
      const runStatus = needsInput ? 'needs_input' : 'running'
      const artifactStatus = needsInput ? 'needs_input' : 'partial_progress'
      if (noProgressLimitReached) {
        await args.ctx.runMutation(internal.sdk.telemetry.logEvent, {
          runId: args.runId,
          type: 'vnext_no_progress_guard',
          payload: {
            stageKey,
            progress: progressMeta,
          },
        })
      }

      await args.ctx.runMutation(internal.sdk.telemetry.updateRunState, {
        runId: args.runId,
        status: runStatus,
        stageKey,
        lastError: needsInput
          ? (noProgressLimitReached
            ? `VNEXT_NO_PROGRESS_GUARD:${stageKey}`
            : `VNEXT_POST_GATE_NEEDS_INPUT:${stageKey}`)
          : `VNEXT_PARTIAL_PROGRESS:${stageKey}`,
        progressKey: progressMeta.progressKey,
        progressCount: progressMeta.progressCount,
        noProgressCount: progressMeta.noProgressCount,
        lastProgressAt: progressMeta.lastProgressAt,
      })
      await args.ctx.runMutation(internal['sdk/vnext/artifacts'].upsertStageArtifact, {
        runId: args.runId,
        projectId: args.projectId,
        conversationId: args.conversationId,
        stageKey,
        artifact: persistedArtifact,
        artifactHash,
        specHash,
        status: artifactStatus,
        progress: progressMeta,
      })

      return {
        stageKey,
        status: needsInput ? 'needs_input' : 'partial_progress',
        blocks: blockingQuestions.length > 0
          ? [buildQuestionsBlock(stageKey, stageTitle, blockingQuestions)]
          : [buildSuggestionsBlock(stageKey)],
        telemetry: {
          postGateIssues: postGate.issues.length,
          progress: progressMeta,
          noProgressLimitReached,
        },
      }
    }

    await args.ctx.runMutation(internal.sdk.telemetry.updateRunState, {
      runId: args.runId,
      status: 'failed',
      stageKey,
      lastError: `VNEXT_POST_GATE_FAIL:${stageKey}`,
      progressKey: progressMeta.progressKey,
      progressCount: progressMeta.progressCount,
      noProgressCount: progressMeta.noProgressCount,
      lastProgressAt: progressMeta.lastProgressAt,
    })
      return {
        stageKey,
        status: 'blocked_error',
        blocks: [buildQuestionsBlock(stageKey, stageTitle, postGate.blockingQuestions)],
        telemetry: {
          postGateIssues: postGate.issues.length,
          progress: progressMeta,
        },
      }
  }

  if (stageKey !== 'compile') {
    let artifactForCheckpoint = persistedArtifact
    try {
      const snapshot = compileDeterministicChangeSet({
        spec: postSpec as TargetPlanSpec,
        artifacts: {
          ...artifacts,
          [stageKey]: mergedArtifact,
        } as StageArtifactMap,
      })
      const snapshotOps = Array.isArray(snapshot?.ops) ? snapshot.ops : []
      if (snapshotOps.length > 0) {
        const snapshotOpsHash = stableHash(JSON.stringify(snapshotOps))
        const previousSnapshotHash = String(
          (existingStageArtifactRow as any)?.artifact?.__persisted?.snapshotOpsHash ?? ''
        )
        let snapshotChangeSetId: any = (existingStageArtifactRow as any)?.artifact?.__persisted?.snapshotChangeSetId
        if (!snapshotChangeSetId || snapshotOpsHash !== previousSnapshotHash) {
          snapshotChangeSetId = await args.ctx.runMutation(api.changeSets.createChangeSet, {
            projectId: args.projectId,
            stage: 'BREAKDOWN',
            ops: snapshotOps,
            createdBy: { type: 'agent', agentName: `sdk.vnext.snapshot.${stageKey}` },
          })
        }
        artifactForCheckpoint = {
          ...persistedArtifact,
          __persisted: {
            ...((persistedArtifact as any)?.__persisted ?? {}),
            snapshotOpsHash,
            snapshotOpsCount: snapshotOps.length,
            snapshotChangeSetId: snapshotChangeSetId ? String(snapshotChangeSetId) : undefined,
            snapshotSummaryHe: String(snapshot?.summaryHe ?? ''),
          },
        }
        await args.ctx.runMutation(internal.sdk.telemetry.logEvent, {
          runId: args.runId,
          type: 'vnext_stage_snapshot_changeset',
          payload: {
            stageKey,
            snapshotChangeSetId: snapshotChangeSetId ? String(snapshotChangeSetId) : null,
            snapshotOpsCount: snapshotOps.length,
            snapshotOpsHash,
          },
        })
      }
    } catch (snapshotError: any) {
      await args.ctx.runMutation(internal.sdk.telemetry.logEvent, {
        runId: args.runId,
        type: 'vnext_stage_snapshot_changeset_failed',
        payload: {
          stageKey,
          message: String(snapshotError?.message ?? 'unknown'),
        },
      })
    }

    await args.ctx.runMutation(internal['sdk/vnext/artifacts'].upsertStageArtifact, {
      runId: args.runId,
      projectId: args.projectId,
      conversationId: args.conversationId,
      stageKey,
      artifact: artifactForCheckpoint,
      artifactHash,
      specHash,
      status: 'ready_for_checkpoint',
      progress: progressMeta,
    })
  }

  if (stageKey === 'compile') {
    const compileOutput = compileDeterministicChangeSet({
      spec: postSpec as TargetPlanSpec,
      artifacts: {
        ...artifacts,
        [stageKey]: mergedArtifact,
      },
    })
    const compileGate = validateCompile({
      opCount: compileOutput.ops.length,
      hasElements: compileOutput.coverage?.hasElements,
      hasTasks: compileOutput.coverage?.hasTasks,
      hasAccounting: compileOutput.coverage?.hasAccounting,
    })
    if (compileGate.status === 'fail') {
      await args.ctx.runMutation(internal.sdk.telemetry.updateRunState, {
        runId: args.runId,
        status: 'failed',
        stageKey,
        lastError: 'VNEXT_COMPILE_GATE_FAIL',
        progressKey: progressMeta.progressKey,
        progressCount: progressMeta.progressCount,
        noProgressCount: progressMeta.noProgressCount,
        lastProgressAt: progressMeta.lastProgressAt,
      })
      return {
        stageKey,
        status: 'blocked_error',
        blocks: [buildQuestionsBlock(stageKey, stageTitle, compileGate.blockingQuestions)],
      }
    }

    const auditFindings = Array.isArray((artifacts.audit as any)?.findings)
      ? (artifacts.audit as any).findings
      : []
    const semanticAudit = await runSemanticAudit({ findings: auditFindings })
    const auditGate = validateAudit({ findings: semanticAudit.findings })
    await args.ctx.runMutation(internal.sdk.telemetry.logEvent, {
      runId: args.runId,
      type: 'audit_snapshot',
      payload: {
        findings: semanticAudit.findings,
        blockers: semanticAudit.blockers,
        hasBlockingFindings: semanticAudit.hasBlockingFindings,
      },
    })
    if (auditGate.status === 'fail') {
      await args.ctx.runMutation(internal.sdk.telemetry.updateRunState, {
        runId: args.runId,
        status: 'failed',
        stageKey,
        lastError: 'VNEXT_AUDIT_GATE_FAIL',
        progressKey: progressMeta.progressKey,
        progressCount: progressMeta.progressCount,
        noProgressCount: progressMeta.noProgressCount,
        lastProgressAt: progressMeta.lastProgressAt,
      })
      return {
        stageKey,
        status: 'blocked_error',
        blocks: [buildQuestionsBlock(stageKey, stageTitle, auditGate.blockingQuestions)],
      }
    }

    const changeSetId = await args.ctx.runMutation(api.changeSets.createChangeSet, {
      projectId: args.projectId,
      stage: 'BREAKDOWN',
      ops: compileOutput.ops,
      createdBy: { type: 'agent', agentName: 'sdk.vnext.compiler' },
    })
    const review = await args.ctx.runAction(api.sdk.changeset.review, {
      projectId: args.projectId,
      changeSetId,
      runId: args.runId,
      conversationId: args.conversationId,
    })
    await args.ctx.runMutation(internal.sdk.telemetry.logEvent, {
      runId: args.runId,
      type: 'changeset_review',
      payload: {
        changeSetId,
        ...review,
      },
    })

    const reviewIssues = Array.isArray(review?.issues) ? review.issues : []
    if (reviewIssues.length > 0) {
      await args.ctx.runMutation(internal.sdk.telemetry.updateRunState, {
        runId: args.runId,
        status: 'failed',
        stageKey,
        lastError: 'VNEXT_REVIEW_ISSUES',
        progressKey: progressMeta.progressKey,
        progressCount: progressMeta.progressCount,
        noProgressCount: progressMeta.noProgressCount,
        lastProgressAt: progressMeta.lastProgressAt,
      })
      return {
        stageKey,
        status: 'blocked_error',
        blocks: [
          buildReviewBlock(stageKey, stageTitle, 'נמצאו בעיות ב-ChangeSet review, נדרש תיקון לפני אישור'),
          buildQuestionsBlock(stageKey, stageTitle, [
            { id: 'review_fixes', textHe: 'יש לתקן בעיות review לפני אישור.', type: 'text' },
          ]),
        ],
      }
    }

    const approvalToken = randomUUID()
    await args.ctx.runMutation(internal.sdk.telemetry.updateRunState, {
      runId: args.runId,
      status: 'awaiting_approval',
      stageKey,
      pendingChangeSetId: changeSetId,
      approvalToken,
      currentAgentName: 'vnext_pipeline',
      progressKey: progressMeta.progressKey,
      progressCount: progressMeta.progressCount,
      noProgressCount: progressMeta.noProgressCount,
      lastProgressAt: progressMeta.lastProgressAt,
    })
    await args.ctx.runMutation(internal['sdk/vnext/artifacts'].upsertStageArtifact, {
      runId: args.runId,
      projectId: args.projectId,
      conversationId: args.conversationId,
      stageKey,
      artifact: {
        compiledOps: compileOutput.ops,
        review,
        changeSetId,
        coverage: compileOutput.coverage,
      },
      artifactHash: stableHash(JSON.stringify(compileOutput.ops)),
      specHash,
      status: 'awaiting_approval',
      progress: progressMeta,
    })

    return {
      stageKey,
      status: 'done',
      blocks: [
        buildReviewBlock(stageKey, stageTitle, compileOutput.summaryHe),
        {
          type: 'ChangeSetBlock',
          sdkVnext: true,
          changeSetId,
          changeSet: { ops: compileOutput.ops },
          summaryHe: compileOutput.summaryHe,
          titleHe: 'חבילת אישור מוכנה',
        },
      ],
    }
  }

  const nextStageKey = getNextVNextStage(stageKey)
  await args.ctx.runMutation(internal.sdk.telemetry.updateRunState, {
    runId: args.runId,
    status: nextStageKey ? 'running' : 'completed',
    stageKey,
    currentAgentName: 'vnext_pipeline',
    progressKey: progressMeta.progressKey,
    progressCount: progressMeta.progressCount,
    noProgressCount: progressMeta.noProgressCount,
    lastProgressAt: progressMeta.lastProgressAt,
    lastError: undefined,
  })
  return {
    stageKey,
    status: nextStageKey ? 'done' : 'completed',
    blocks: [
      buildReviewBlock(stageKey, stageTitle, buildStageSummary(stageKey, mergedArtifact)),
      buildSuggestionsBlock(nextStageKey),
    ],
    nextStageKey: nextStageKey ?? undefined,
  }
}

