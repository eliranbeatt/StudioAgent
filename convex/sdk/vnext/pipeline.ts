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

const MAX_STAGE_ATTEMPTS = 2

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
    return validateAudit({ findings: args.artifact?.findings })
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
          durationHours: typeof task?.estimatedHours === 'number' ? task.estimatedHours : undefined,
          category: task?.category,
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
    next.recommendations = Array.isArray(raw?.recommendations) ? raw.recommendations : []
    next.pricedLines = Array.isArray(raw?.pricedLines) ? raw.pricedLines : next.recommendations
    if (!Array.isArray(next.pricedLines) || next.pricedLines.length === 0) {
      const budgetMaterial = Array.isArray((artifacts.budget as any)?.materialLines)
        ? (artifacts.budget as any).materialLines
        : []
      const budgetWork = Array.isArray((artifacts.budget as any)?.workLines)
        ? (artifacts.budget as any).workLines
        : []
      const budgetLines = [...budgetMaterial, ...budgetWork]
      next.pricedLines = budgetLines.map((line: any, index: number) => {
        const quantity = Number(line?.qty ?? line?.quantity ?? 1)
        const totalCost = Number(line?.totalCost ?? line?.cost ?? 0)
        const directUnitPrice = Number(
          line?.unitPrice ??
          line?.plannedUnitCost ??
          line?.unitCost ??
          line?.price ??
          0
        )
        const fallbackUnitPrice =
          totalCost > 0 && quantity > 0 ? totalCost / quantity : 100
        const unitPrice =
          Number.isFinite(directUnitPrice) && directUnitPrice > 0
            ? directUnitPrice
            : fallbackUnitPrice

        return {
          lineKey: String(line?.lineKey ?? `priced_line_${index + 1}`),
          titleHe: String(line?.titleHe ?? line?.itemName ?? line?.name ?? `line ${index + 1}`),
          itemName: String(line?.itemName ?? line?.titleHe ?? line?.name ?? `line ${index + 1}`),
          qty: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
          unitPrice: unitPrice > 0 ? unitPrice : 1,
          isEstimate: true,
          assumptionHe: String(line?.assumptionHe ?? 'Auto estimate from budget skeleton'),
          knownPriceId: line?.knownPriceId,
          priceObservationId: line?.priceObservationId,
          purchaseId: line?.purchaseId,
        }
      })
    }
    next.pricedLines = (Array.isArray(next.pricedLines) ? next.pricedLines : []).map((line: any, index: number) => {
      const qty = Number(line?.qty ?? line?.quantity ?? 1)
      const baseUnit = Number(line?.unitPrice ?? line?.plannedUnitCost ?? line?.price ?? 0)
      const unitPrice = Number.isFinite(baseUnit) && baseUnit > 0 ? baseUnit : 100
      const hasEvidence = Boolean(line?.knownPriceId || line?.priceObservationId || line?.purchaseId)
      const isEstimate = hasEvidence ? Boolean(line?.isEstimate) : true
      const assumptionHe = String(
        line?.assumptionHe ??
        (isEstimate ? 'Auto estimate from pricing normalization' : '')
      )
      return {
        ...line,
        lineKey: String(line?.lineKey ?? `priced_line_${index + 1}`),
        titleHe: String(line?.titleHe ?? line?.itemName ?? line?.name ?? `line ${index + 1}`),
        itemName: String(line?.itemName ?? line?.titleHe ?? line?.name ?? `line ${index + 1}`),
        qty: Number.isFinite(qty) && qty > 0 ? qty : 1,
        unitPrice,
        isEstimate,
        assumptionHe,
      }
    })
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
    const count = Array.isArray(artifact?.pricedLines) ? artifact.pricedLines.length : 0
    return `עודכנו ${count} שורות תמחור`
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
}): Promise<VNextStageRunOutput> {
  const stageKey = normalizeVNextStage(args.run.stageKey)
  const stageTitle = VNEXT_STAGE_META[stageKey].titleHe

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

  const dependency = missingDependency(stageKey, artifacts)
  if (dependency) {
    await args.ctx.runMutation(internal.sdk.telemetry.updateRunState, {
      runId: args.runId,
      status: 'blocked',
      stageKey,
      lastError: `VNEXT_DEPENDENCY_MISSING:${dependency}`,
    })
    return {
      stageKey,
      status: 'blocked',
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
  const spec: TargetPlanSpec = buildTargetPlanSpec({
    projectId: args.projectId,
    project: projectContext?.project ?? {},
    recentUserTexts,
    stageDecisions,
    existingScopeElements: scopeSeed,
  })

  const currentArtifact = (artifacts as any)[stageKey] ?? {}
  const preGate = stageKey === 'brief'
    ? validateByStage({ stageKey, spec, artifact: currentArtifact, artifacts })
    : { status: 'pass', issues: [], blockingQuestions: [] }
  if (preGate.status === 'fail') {
    await args.ctx.runMutation(internal.sdk.telemetry.updateRunState, {
      runId: args.runId,
      status: 'blocked',
      stageKey,
      lastError: `VNEXT_PRE_GATE_FAIL:${stageKey}`,
    })
    return {
      stageKey,
      status: 'blocked',
      blocks: [buildQuestionsBlock(stageKey, stageTitle, preGate.blockingQuestions)],
      telemetry: { preGateIssues: preGate.issues.length },
    }
  }

  const attemptsForStage = artifactsRows.filter((row: any) => row.stageKey === stageKey).length
  if (attemptsForStage >= MAX_STAGE_ATTEMPTS) {
    await args.ctx.runMutation(internal.sdk.telemetry.updateRunState, {
      runId: args.runId,
      status: 'blocked',
      stageKey,
      lastError: `VNEXT_MAX_ATTEMPTS:${stageKey}`,
    })
    return {
      stageKey,
      status: 'blocked',
      blocks: [
        buildQuestionsBlock(stageKey, stageTitle, [
          { id: 'manual_review', textHe: 'נדרשת התערבות ידנית להמשך השלב', type: 'text' },
        ]),
      ],
    }
  }

  const skillOutputs = await runStageSkills({
    ctx: args.ctx,
    projectId: args.projectId,
    conversationId: args.conversationId,
    runId: args.runId,
    stageKey,
    input: {
      userMessage: args.userMessage,
      spec,
      artifact: currentArtifact,
      artifacts,
      context: projectContext,
    },
  })

  const mergedArtifact = stageKey === 'compile'
    ? currentArtifact
    : mergeArtifact(stageKey, currentArtifact, skillOutputs, artifacts)
  const artifactHash = stableHash(JSON.stringify(mergedArtifact))
  const specHash = stableHash(JSON.stringify(spec))
  const dedupeSignature = `${stageKey}:${specHash}:${artifactHash}`
  const isDuplicate = artifactsRows.some((row: any) => {
    const previous = `${row.stageKey}:${row.specHash}:${row.artifactHash}`
    return previous === dedupeSignature
  })
  if (isDuplicate && stageKey !== 'compile') {
    await args.ctx.runMutation(internal.sdk.telemetry.updateRunState, {
      runId: args.runId,
      status: 'blocked',
      stageKey,
      lastError: `VNEXT_DEDUPE_GUARD:${stageKey}`,
    })
    return {
      stageKey,
      status: 'blocked',
      blocks: [
        buildQuestionsBlock(stageKey, stageTitle, [
          { id: 'dedupe_guard', textHe: 'הפלט חזר על עצמו. נדרש קלט נוסף כדי להמשיך.', type: 'text' },
        ]),
      ],
    }
  }

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
    await args.ctx.runMutation(internal.sdk.telemetry.updateRunState, {
      runId: args.runId,
      status: 'blocked',
      stageKey,
      lastError: `VNEXT_POST_GATE_FAIL:${stageKey}`,
    })
    return {
      stageKey,
      status: 'blocked',
      blocks: [buildQuestionsBlock(stageKey, stageTitle, postGate.blockingQuestions)],
      telemetry: { postGateIssues: postGate.issues.length },
    }
  }

  if (stageKey !== 'compile') {
    await args.ctx.runMutation(internal['sdk/vnext/artifacts'].upsertStageArtifact, {
      runId: args.runId,
      projectId: args.projectId,
      conversationId: args.conversationId,
      stageKey,
      artifact: mergedArtifact,
      artifactHash,
      specHash,
      status: 'ready_for_checkpoint',
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
        status: 'blocked',
        stageKey,
        lastError: 'VNEXT_COMPILE_GATE_FAIL',
      })
      return {
        stageKey,
        status: 'blocked',
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
        status: 'blocked',
        stageKey,
        lastError: 'VNEXT_AUDIT_GATE_FAIL',
      })
      return {
        stageKey,
        status: 'blocked',
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
        status: 'blocked',
        stageKey,
        lastError: 'VNEXT_REVIEW_ISSUES',
      })
      return {
        stageKey,
        status: 'blocked',
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
    })

    return {
      stageKey,
      status: 'ready_for_checkpoint',
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
    status: 'blocked',
    stageKey,
    currentAgentName: 'vnext_pipeline',
  })
  return {
    stageKey,
    status: nextStageKey ? 'ready_for_checkpoint' : 'completed',
    blocks: [
      buildReviewBlock(stageKey, stageTitle, buildStageSummary(stageKey, mergedArtifact)),
      buildSuggestionsBlock(nextStageKey),
    ],
    nextStageKey: nextStageKey ?? undefined,
  }
}

