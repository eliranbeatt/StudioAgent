import { mutation, query } from './_generated/server'
import { v } from 'convex/values'
import { DEFAULT_FLAGS, isEnabled, normalizeFlags } from './featureFlags'
import { buildProjectSnapshot } from './flow/snapshotBuilder'
import { validateG0Brief } from './flow/validation/validateG0Brief'
import { validateG1Elements } from './flow/validation/validateG1Elements'
import { validateG2Tasks } from './flow/validation/validateG2Tasks'
import { computeReadiness } from './flow/validation/readiness'

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
    const runId = await ctx.db.insert('flowRuns', {
      projectId: args.projectId,
      status: 'running' as FlowRunStatus,
      currentGateId: 'G0',
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
    await assertBackendEnabled(ctx)
    await assertValidatorsEnabled(ctx)

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
