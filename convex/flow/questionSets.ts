import { internalMutation } from '../_generated/server'
import { internal } from '../_generated/api'
import { v } from 'convex/values'
import { buildQuestionsBlock } from './clarificationPackBuilder'
import { validateG0Brief } from './validation/validateG0Brief'
import { validateG1Elements } from './validation/validateG1Elements'
import { validateG2Tasks } from './validation/validateG2Tasks'
import { validateG3Accounting } from './validation/validateG3Accounting'
import { validateG4Pricing } from './validation/validateG4Pricing'
import { validateG5TasksEnrichment } from './validation/validateG5TasksEnrichment'
import { validateG6OpsCompleteness } from './validation/validateG6OpsCompleteness'
import { validateG7PricingRecheck } from './validation/validateG7PricingRecheck'
import { validateG8Quote } from './validation/validateG8Quote'
import { validateG9Audit } from './validation/validateG9Audit'
import { computeReadiness } from './validation/readiness'
import { ProjectSnapshotV1 } from './snapshotBuilder'

function normalizeUnknownAcceptedKeys(keys: unknown): Set<string> {
  if (!Array.isArray(keys)) return new Set<string>()
  const out = new Set<string>()
  for (const key of keys) {
    const cleaned = String(key || '').trim()
    if (!cleaned) continue
    out.add(cleaned)
  }
  return out
}

function applyUnknownAccepted(report: any, unknownAcceptedKeys: unknown) {
  const unknownAccepted = normalizeUnknownAcceptedKeys(unknownAcceptedKeys)
  if (unknownAccepted.size === 0) return report

  const blocking = Array.isArray(report?.blockingIssues) ? report.blockingIssues : []
  const accepted = blocking.filter((i: any) => unknownAccepted.has(String(i?.key ?? '').trim()))
  if (accepted.length === 0) return report

  const remaining = blocking.filter((i: any) => !unknownAccepted.has(String(i?.key ?? '').trim()))
  const metrics = { ...(report.metrics ?? {}) }
  metrics.unknownAcceptedCriticalCount = accepted.filter((i: any) => i?.severity === 'CRITICAL').length
  metrics.unknownAcceptedKeys = accepted.map((i: any) => i?.key).filter(Boolean)

  return {
    ...report,
    blockingIssues: remaining,
    metrics,
  }
}

function buildReportFromSnapshot(gateId: string, snapshot: ProjectSnapshotV1) {
  let report: any
  if (gateId === 'G0') {
    report = validateG0Brief(snapshot)
  } else if (gateId === 'G1' || gateId === 'G0C') {
    report = validateG1Elements(snapshot)
  } else if (gateId === 'G2') {
    report = validateG2Tasks(snapshot)
  } else if (gateId === 'G3') {
    report = validateG3Accounting(snapshot)
  } else if (gateId === 'G4') {
    report = validateG4Pricing(snapshot)
  } else if (gateId === 'G5') {
    report = validateG5TasksEnrichment(snapshot)
  } else if (gateId === 'G6') {
    report = validateG6OpsCompleteness(snapshot)
  } else if (gateId === 'G7') {
    report = validateG7PricingRecheck(snapshot)
  } else if (gateId === 'G8') {
    report = validateG8Quote(snapshot)
  } else if (gateId === 'G9') {
    report = validateG9Audit(snapshot)
  } else {
    report = {
      status: 'fail',
      blockingIssues: [],
      opportunities: [],
      warnings: [],
      metrics: { gateId },
    }
  }

  report.readinessScore = computeReadiness(report)
  return report
}

function toQuestionSetQuestions(questions: any[]) {
  return questions.map((q: any, idx: number) => ({
    questionId: String(q.id ?? `q${idx}`),
    fieldKey: String(q.topicKey ?? q.id ?? `q${idx}`),
    prompt: String(q.textHe ?? q.text ?? ''),
    choices: Array.isArray(q.optionsHe) ? q.optionsHe.map((o: any) => String(o)) : undefined,
    type: typeof q.type === 'string' ? q.type : undefined,
    placeholderHe: typeof q.placeholderHe === 'string' ? q.placeholderHe : undefined,
    priority: idx + 1,
    whyAsked: q.detailHe ? String(q.detailHe) : undefined,
  }))
}

export const generateAndEmit = internalMutation({
  args: {
    flowRunId: v.id('flowRuns'),
    reason: v.optional(v.string()),
    force: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.flowRunId)
    if (!run) return null

    const now = Date.now()
    const last = await ctx.db
      .query('flowQuestionSets')
      .withIndex('by_run', (q: any) => q.eq('runId', args.flowRunId))
      .order('desc')
      .take(1)
    const lastSet = last?.[0]
    if (!args.force && lastSet && now - lastSet.createdAt < 30000) return null

    const artifactRevision = run.currentArtifactRevisionId
      ? await ctx.db.get(run.currentArtifactRevisionId)
      : null
    if (!artifactRevision?.snapshot) return null

    const snapshot = artifactRevision.snapshot as ProjectSnapshotV1
    const gateId = run.currentGateId
    let report = buildReportFromSnapshot(gateId, snapshot)

    const project = await ctx.db.get(run.projectId)
    report = applyUnknownAccepted(report, project?.unknownAcceptedKeys)
    if (Array.isArray(report.blockingIssues) && report.blockingIssues.length === 0) {
      report.status = 'pass'
    }
    report.readinessScore = computeReadiness(report)

    const qaPairs = await ctx.db
      .query('qaPairs')
      .withIndex('by_project', (q: any) => q.eq('projectId', run.projectId))
      .order('desc')
      .take(200)

    const questionsBlock = buildQuestionsBlock({
      gateId,
      report,
      qaPairs,
      unknownAcceptedKeys: project?.unknownAcceptedKeys,
      assumptionsAccepted: project?.assumptionsAccepted,
      dismissedOppKeys: project?.dismissedOppKeys,
      hideSuggestions: true,
    })

    if (!questionsBlock || questionsBlock.questions.length === 0) return null

    const questionSetId = `${args.flowRunId}:${now}`
    const questions = toQuestionSetQuestions(questionsBlock.questions)

    await ctx.db.insert('flowQuestionSets', {
      runId: args.flowRunId,
      questionSetId,
      createdAt: now,
      gateId,
      titleHe: questionsBlock.titleHe,
      basedOnArtifactRevisionId: run.currentArtifactRevisionId,
      basedOnAnswerVersion: run.latestAnswerVersion,
      questions,
      emittedToChatAt: now,
    })

    const conversationId = run.conversationId
      ? run.conversationId
      : await ctx.runMutation(internal.flowRuns.ensureConversation, { flowRunId: args.flowRunId })

    await ctx.runMutation(internal.flow.chat.emitAssistantBlocks, {
      conversationId,
      blocks: [questionsBlock],
    })

    return { questionSetId, reason: args.reason ?? 'unknown' }
  },
})
