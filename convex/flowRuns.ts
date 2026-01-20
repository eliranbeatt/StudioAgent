import { mutation, query, internalMutation, internalQuery, action } from './_generated/server'
import { v } from 'convex/values'
import { DEFAULT_FLAGS, isEnabled, normalizeFlags } from './featureFlags'
import { api, internal } from './_generated/api'
import { buildProjectSnapshot } from './flow/snapshotBuilder'
import { validateG0Brief } from './flow/validation/validateG0Brief'
import { validateG1Elements } from './flow/validation/validateG1Elements'
import { validateG2Tasks } from './flow/validation/validateG2Tasks'
import { validateG3Accounting } from './flow/validation/validateG3Accounting'
import { validateG4Pricing } from './flow/validation/validateG4Pricing'
import { validateG5TasksEnrichment } from './flow/validation/validateG5TasksEnrichment'
import { validateG6OpsCompleteness } from './flow/validation/validateG6OpsCompleteness'
import { validateG7PricingRecheck } from './flow/validation/validateG7PricingRecheck'
import { validateG8Quote } from './flow/validation/validateG8Quote'
import { validateG9Audit } from './flow/validation/validateG9Audit'
import { computeReadiness } from './flow/validation/readiness'
import { buildQuestionsBlock } from './flow/clarificationPackBuilder'

const SETTINGS_KEY = 'featureFlags'

async function loadFlags(ctx: any): Promise<Record<string, boolean>> {
  const existing = await ctx.db
    .query('appSettings')
    .withIndex('by_key', (q: any) => q.eq('key', SETTINGS_KEY))
    .first()

  const stored = normalizeFlags(existing?.value)
  return { ...DEFAULT_FLAGS, ...stored }
}

async function assertBackendEnabled(ctx: any) {
  const flags = await loadFlags(ctx)
  if (!isEnabled(flags, 'ff_flow_agent_backend', false)) {
    throw new Error('Flow Agent is disabled (ff_flow_agent_backend)')
  }
}

async function assertRunnerEnabled(ctx: any) {
  const flags = await loadFlags(ctx)
  if (!isEnabled(flags, 'ff_flow_runner_v1', false)) {
    throw new Error('Flow runner is disabled (ff_flow_runner_v1)')
  }
}

async function assertValidatorsEnabled(ctx: any) {
  const flags = await loadFlags(ctx)
  if (!isEnabled(flags, 'ff_flow_validators_v1', false)) {
    throw new Error('Flow validators are disabled (ff_flow_validators_v1)')
  }
}

type FlowRunStatus =
  | 'running'
  | 'blocked'
  | 'awaiting_approval'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'cancelled'

export const getActiveByProject = query({
  args: {
    projectId: v.id('projects'),
  },
  handler: async (ctx, args) => {
    await assertBackendEnabled(ctx)

    const runs = await ctx.db
      .query('flowRuns')
      .withIndex('by_project', (q) => q.eq('projectId', args.projectId))
      .order('desc')
      .take(20)

    const active = runs.find((r: any) =>
      r.status === 'running' ||
      r.status === 'blocked' ||
      r.status === 'awaiting_approval' ||
      r.status === 'paused'
    )

    return active ?? null
  },
})

export const listByProject = query({
  args: {
    projectId: v.id('projects'),
  },
  handler: async (ctx, args) => {
    await assertBackendEnabled(ctx)
    return await ctx.db
      .query('flowRuns')
      .withIndex('by_project', (q) => q.eq('projectId', args.projectId))
      .order('desc')
      .collect()
  },
})

export const start = mutation({
  args: {
    projectId: v.id('projects'),
  },
  handler: async (ctx, args) => {
    await assertBackendEnabled(ctx)

    const now = Date.now()

    const conversationId = await ctx.db.insert('agentConversations', {
      projectId: args.projectId,
      title: 'Flow Agent',
      mode: 'builder',
      createdAt: now,
      updatedAt: now,
    })

    const runId = await ctx.db.insert('flowRuns', {
      projectId: args.projectId,
      status: 'running' as FlowRunStatus,
      currentGateId: 'G0',
      conversationId,
      toggles: { autoRun: false, useWebSearch: false },
      createdAt: now,
      updatedAt: now,
    })

    await ctx.db.insert('flowSteps', {
      flowRunId: runId,
      gateId: 'G0',
      status: 'running',
      startedAt: now,
    })

    return runId
  },
})

export const runNext = action({
  args: {
    flowRunId: v.id('flowRuns'),
  },
  handler: async (ctx, args) => {
    await assertBackendEnabled(ctx)
    await assertRunnerEnabled(ctx)
    await ctx.runAction(internal.flow.flowRunner.tick, { flowRunId: args.flowRunId })
  },
})

export const setToggles = mutation({
  args: {
    flowRunId: v.id('flowRuns'),
    toggles: v.object({
      autoRun: v.boolean(),
      useWebSearch: v.boolean(),
    }),
  },
  handler: async (ctx, args) => {
    await assertBackendEnabled(ctx)

    const run = await ctx.db.get(args.flowRunId)
    if (!run) throw new Error('Flow run not found')

    const flags = await loadFlags(ctx)
    const now = Date.now()

    const useWebSearch = isEnabled(flags, 'ff_flow_web_pricing', false) ? args.toggles.useWebSearch : false

    await ctx.db.patch(args.flowRunId, {
      toggles: {
        autoRun: args.toggles.autoRun,
        useWebSearch,
      },
      updatedAt: now,
    })
  },
})

export const applyChangeSetOpsAndContinue = action({
  args: {
    flowRunId: v.id('flowRuns'),
    changeSetId: v.id('changeSets'),
    opIndices: v.array(v.number()),
  },
  handler: async (ctx, args) => {
    await assertBackendEnabled(ctx)
    await assertRunnerEnabled(ctx)

    await ctx.runMutation(api.changeSets.applyChangeSetOps, {
      changeSetId: args.changeSetId,
      opIndices: args.opIndices,
    })

    await ctx.runAction(internal.flow.flowRunner.tick, { flowRunId: args.flowRunId })
    return { ok: true }
  },
})

export const discardChangeSetAndContinue = action({
  args: {
    flowRunId: v.id('flowRuns'),
    changeSetId: v.id('changeSets'),
  },
  handler: async (ctx, args) => {
    await assertBackendEnabled(ctx)
    await assertRunnerEnabled(ctx)

    await ctx.runMutation(api.changeSets.discardChangeSet, {
      changeSetId: args.changeSetId,
    })

    await ctx.runAction(internal.flow.flowRunner.tick, { flowRunId: args.flowRunId })
    return { ok: true }
  },
})

export const pause = mutation({
  args: {
    flowRunId: v.id('flowRuns'),
  },
  handler: async (ctx, args) => {
    await assertBackendEnabled(ctx)
    const now = Date.now()
    await ctx.db.patch(args.flowRunId, { status: 'paused', updatedAt: now })
  },
})

export const resume = mutation({
  args: {
    flowRunId: v.id('flowRuns'),
  },
  handler: async (ctx, args) => {
    await assertBackendEnabled(ctx)
    const now = Date.now()
    await ctx.db.patch(args.flowRunId, { status: 'running', updatedAt: now })
  },
})

export const cancel = mutation({
  args: {
    flowRunId: v.id('flowRuns'),
  },
  handler: async (ctx, args) => {
    await assertBackendEnabled(ctx)
    const now = Date.now()
    await ctx.db.patch(args.flowRunId, {
      status: 'cancelled',
      updatedAt: now,
      finishedAt: now,
    })
  },
})

export const computeValidation = mutation({
  args: {
    flowRunId: v.id('flowRuns'),
    gateId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const flags = await loadFlags(ctx)
    if (!isEnabled(flags, 'ff_flow_agent_backend', false)) {
      throw new Error('Flow Agent is disabled (ff_flow_agent_backend)')
    }
    if (!isEnabled(flags, 'ff_flow_validators_v1', false)) {
      throw new Error('Flow validators are disabled (ff_flow_validators_v1)')
    }

    const run = await ctx.db.get(args.flowRunId)
    if (!run) throw new Error('Flow run not found')

    const gateId = args.gateId ?? run.currentGateId
    const snapshot = await buildProjectSnapshot(ctx, run.projectId)

    let report: any
    if (gateId === 'G0') {
      report = validateG0Brief(snapshot)
    } else if (gateId === 'G1') {
      report = validateG1Elements(snapshot)
    } else if (gateId === 'G2') {
      report = validateG2Tasks(snapshot)
    } else if (gateId === 'G3') {
      report = validateG3Accounting(snapshot)
    } else if (gateId === 'G4') {
      if (!isEnabled(flags, 'ff_flow_pricing_gates', false)) {
        report = {
          status: 'fail',
          blockingIssues: [
            {
              key: 'pricing.gates_disabled',
              severity: 'HIGH',
              titleHe: 'וולידציית תמחור מושבתת',
              detailHe: 'כדי להפעיל G4 יש להדליק את הדגל ff_flow_pricing_gates.',
            },
          ],
          fixableIssues: [],
          opportunities: [],
          warnings: [],
          metrics: { gateId },
        }

        report.readinessScore = computeReadiness(report)
      } else {
        report = validateG4Pricing(snapshot)
      }
    } else if (gateId === 'G5') {
      report = validateG5TasksEnrichment(snapshot)
    } else if (gateId === 'G6') {
      if (!isEnabled(flags, 'ff_flow_pricing_gates', false)) {
        report = {
          status: 'fail',
          blockingIssues: [
            {
              key: 'ops.gates_disabled',
              severity: 'HIGH',
              titleHe: 'וולידציית תפעול/שלמות מושבתת',
              detailHe: 'כדי להפעיל G6 יש להדליק את הדגל ff_flow_pricing_gates.',
            },
          ],
          fixableIssues: [],
          opportunities: [],
          warnings: [],
          metrics: { gateId },
        }

        report.readinessScore = computeReadiness(report)
      } else {
        report = validateG6OpsCompleteness(snapshot)
      }
    } else if (gateId === 'G7') {
      if (!isEnabled(flags, 'ff_flow_pricing_gates', false)) {
        report = {
          status: 'fail',
          blockingIssues: [
            {
              key: 'pricing.recheck_gates_disabled',
              severity: 'HIGH',
              titleHe: 'וולידציית ריענון תמחור מושבתת',
              detailHe: 'כדי להפעיל G7 יש להדליק את הדגל ff_flow_pricing_gates.',
            },
          ],
          fixableIssues: [],
          opportunities: [],
          warnings: [],
          metrics: { gateId },
        }

        report.readinessScore = computeReadiness(report)
      } else {
        report = validateG7PricingRecheck(snapshot)
      }
    } else if (gateId === 'G8') {
      report = validateG8Quote(snapshot)
    } else if (gateId === 'G9') {
      report = validateG9Audit(snapshot)
    } else {
      report = {
        status: 'fail',
        blockingIssues: [
          {
            key: 'validation.not_implemented',
            severity: 'HIGH',
            titleHe: 'הוולידציה לשער זה עדיין לא הוטמעה',
            detailHe: `Gate ${gateId} עדיין לא פעיל ב-Phase 2.`,
          },
        ],
        fixableIssues: [],
        opportunities: [],
        warnings: [],
        metrics: { gateId },
      }

      report.readinessScore = computeReadiness(report)
    }

    const now = Date.now()

    if (report.status !== 'pass' && isEnabled(flags, 'ff_flow_clarification_pack_v1', false)) {
      const project = await ctx.db.get(run.projectId)
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
      })

      if (questionsBlock) {
        ;(report as any).questionsBlock = questionsBlock
      }
    }

    const existingStep = await ctx.db
      .query('flowSteps')
      .withIndex('by_run_gate', (q: any) => q.eq('flowRunId', args.flowRunId).eq('gateId', gateId))
      .first()

    const stepStatus = report.status === 'pass' ? 'passed' : 'blocked'

    if (!existingStep) {
      await ctx.db.insert('flowSteps', {
        flowRunId: args.flowRunId,
        gateId,
        status: stepStatus,
        validationReport: report,
        startedAt: now,
        finishedAt: now,
      })
    } else {
      await ctx.db.patch(existingStep._id, {
        status: stepStatus,
        validationReport: report,
        finishedAt: now,
      })
    }

    const blockingKeys = (report.blockingIssues ?? []).map((i: any) => i.key)
    const readinessScore = typeof report.readinessScore === 'number' ? report.readinessScore : undefined

    let nextRunStatus = run.status
    if (report.status !== 'pass') {
      nextRunStatus = 'blocked'
    } else if (run.status === 'blocked') {
      nextRunStatus = 'running'
    }

    await ctx.db.patch(args.flowRunId, {
      readinessScore,
      blockingIssueKeys: blockingKeys,
      status: nextRunStatus,
      updatedAt: now,
    })

    return report
  },
})

export const getRunInternal = internalQuery({
  args: { flowRunId: v.id('flowRuns') },
  handler: async (ctx, args) => await ctx.db.get(args.flowRunId)
})

export const setRunStatus = internalMutation({
  args: { 
    flowRunId: v.id('flowRuns'), 
    status: v.union(
      v.literal('running'),
      v.literal('blocked'),
      v.literal('awaiting_approval'),
      v.literal('paused'),
      v.literal('completed'),
      v.literal('failed'),
      v.literal('cancelled')
    )
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.flowRunId, { status: args.status, updatedAt: Date.now() })
  }
})

export const advanceToGate = internalMutation({
  args: { flowRunId: v.id('flowRuns'), gateId: v.string() },
  handler: async (ctx, args) => {
    const now = Date.now()
    await ctx.db.patch(args.flowRunId, { currentGateId: args.gateId, updatedAt: now })
    
    const existing = await ctx.db
      .query('flowSteps')
      .withIndex('by_run_gate', (q) => q.eq('flowRunId', args.flowRunId).eq('gateId', args.gateId))
      .first()
      
    if (!existing) {
      await ctx.db.insert('flowSteps', {
        flowRunId: args.flowRunId,
        gateId: args.gateId,
        status: 'running',
        startedAt: now
      })
    } else {
      await ctx.db.patch(existing._id, { status: 'running', startedAt: now })
    }
  }
})

export const ensureConversation = internalMutation({
  args: { flowRunId: v.id('flowRuns') },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.flowRunId)
    if (!run) throw new Error('Flow run not found')
    if (run.conversationId) return run.conversationId

    const now = Date.now()
    const conversationId = await ctx.db.insert('agentConversations', {
      projectId: run.projectId,
      title: 'Flow Agent',
      mode: 'builder',
      createdAt: now,
      updatedAt: now,
    })

    await ctx.db.patch(args.flowRunId, { conversationId, updatedAt: now })
    return conversationId
  },
})

export const setAwaitingApproval = internalMutation({
  args: {
    flowRunId: v.id('flowRuns'),
    gateId: v.string(),
    draftChangeSetIds: v.array(v.id('changeSets')),
  },
  handler: async (ctx, args) => {
    const now = Date.now()

    const step = await ctx.db
      .query('flowSteps')
      .withIndex('by_run_gate', (q) => q.eq('flowRunId', args.flowRunId).eq('gateId', args.gateId))
      .first()

    if (step) {
      await ctx.db.patch(step._id, {
        status: 'awaiting_approval',
        draftChangeSetIds: args.draftChangeSetIds,
        finishedAt: now,
      })
    }

    await ctx.db.patch(args.flowRunId, { status: 'awaiting_approval', updatedAt: now })
  },
})

export const setDraftChangeSets = internalMutation({
  args: {
    flowRunId: v.id('flowRuns'),
    gateId: v.string(),
    draftChangeSetIds: v.array(v.id('changeSets')),
  },
  handler: async (ctx, args) => {
    const now = Date.now()

    const step = await ctx.db
      .query('flowSteps')
      .withIndex('by_run_gate', (q) => q.eq('flowRunId', args.flowRunId).eq('gateId', args.gateId))
      .first()

    if (step) {
      await ctx.db.patch(step._id, {
        draftChangeSetIds: args.draftChangeSetIds,
      })
    }

    await ctx.db.patch(args.flowRunId, { updatedAt: now })
  },
})

export const clearAwaitingApproval = internalMutation({
  args: { flowRunId: v.id('flowRuns') },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.flowRunId, { status: 'running', updatedAt: Date.now() })
  },
})

export const getStepInternal = internalQuery({
  args: { flowRunId: v.id('flowRuns'), gateId: v.string() },
  handler: async (ctx, args) =>
    await ctx.db
      .query('flowSteps')
      .withIndex('by_run_gate', (q) => q.eq('flowRunId', args.flowRunId).eq('gateId', args.gateId))
      .first(),
})

export const tickValidation = internalMutation({
  args: { flowRunId: v.id('flowRuns') },
  handler: async (ctx, args) => {
    // We reuse computeValidation logic by calling the exported mutation function IF it was exported as a function,
    // but here it is a registered mutation. We can call it via ctx.runMutation(api...) if internal?
    // Actually computeValidation is public. We can call it?
    // No, mutation logic calling another mutation in same Convex app?
    // Convex allows calling other mutations via ctx.runMutation.
    
    // Instead of calling the public mutation which might have checks again,
    // we can re-implement or call it.
    // Let's trying calling it. 'validationReport' is returned.
    
    // But we need the 'flowRun' state too.
    
    // So let's just use getRunInternal in the action and call computeValidation separately.
    // tickValidation is not strictly needed if we do 2 round trips in the action.
    // 1. computeValidation (public)
    // 2. getRunInternal (internal)
    
    // So I will remove tickValidation from here and handle it in the action.
    return null
  }
})

