import { v } from 'convex/values'
import { internalAction } from '../_generated/server'
import { api, internal } from '../_generated/api'
import { DEFAULT_FLAGS, isEnabled, normalizeFlags } from '../featureFlags'
import { Id } from '../_generated/dataModel'

const SETTINGS_KEY = 'featureFlags'

async function loadFlags(ctx: any): Promise<Record<string, boolean>> {
  const existing = await ctx.db
    .query('appSettings')
    .withIndex('by_key', (q: any) => q.eq('key', SETTINGS_KEY))
    .first()

  const stored = normalizeFlags(existing?.value)
  return { ...DEFAULT_FLAGS, ...stored }
}

function isResolvedChangeSetStatus(status: unknown): boolean {
  return status === 'APPLIED' || status === 'DISCARDED' || status === 'PARTIALLY_APPLIED'
}

export const tick = internalAction({
  args: {
    flowRunId: v.id('flowRuns'),
  },
  handler: async (ctx, args) => {
    const { flowRunId } = args

    const flags = await loadFlags(ctx)
    if (!isEnabled(flags, 'ff_flow_agent_backend', false)) {
      throw new Error('Flow Agent is disabled (ff_flow_agent_backend)')
    }
    if (!isEnabled(flags, 'ff_flow_runner_v1', false)) {
      throw new Error('Flow runner is disabled (ff_flow_runner_v1)')
    }

    // Load run state
    const run = await ctx.runQuery(internal.flowRuns.getRunInternal, { flowRunId })
    if (!run) return

    if (run.status === 'paused' || run.status === 'failed' || run.status === 'cancelled' || run.status === 'completed') {
      return
    }

    // If we are awaiting approval, check if all proposed ChangeSets for current gate are resolved.
    if (run.status === 'awaiting_approval') {
      const step = await ctx.runQuery(internal.flowRuns.getStepInternal, {
        flowRunId,
        gateId: run.currentGateId,
      })

      const ids = (step?.draftChangeSetIds ?? []) as Array<Id<'changeSets'>>
      if (ids.length > 0) {
        const changeSets = await Promise.all(ids.map((id) => ctx.runQuery(api.changeSets.get, { id })))
        const unresolved = changeSets.some((cs: any) => cs && !isResolvedChangeSetStatus(cs.status))
        if (unresolved) return
      }

      await ctx.runMutation(internal.flowRuns.clearAwaitingApproval, { flowRunId })
    }

    const GATE_ORDER = ['G0', 'G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7', 'G8', 'G9'] as const

    // Auto-advance can walk multiple gates in one tick, but is bounded.
    // We stop as soon as we generate draft ChangeSets (awaiting approval) or hit a blocked gate.
    const initialRun = await ctx.runQuery(internal.flowRuns.getRunInternal, { flowRunId })
    const maxAdvances = initialRun?.toggles?.autoRun ? 10 : 1

    for (let advances = 0; advances < maxAdvances; advances++) {
      // Validation updates readiness + blocking keys + status
      const report = await ctx.runMutation(api.flowRuns.computeValidation, { flowRunId })
      const refreshed = await ctx.runQuery(internal.flowRuns.getRunInternal, { flowRunId })
      if (!refreshed) return

      if (report?.status !== 'pass') {
        return
      }

      const projectId = refreshed.projectId
      const currentGateId = refreshed.currentGateId
      const currentIndex = GATE_ORDER.indexOf(currentGateId as any)

      const nextGateId = currentIndex >= 0 ? (GATE_ORDER[currentIndex + 1] as string | undefined) : undefined
      if (!nextGateId) {
        await ctx.runMutation(internal.flowRuns.setRunStatus, { flowRunId, status: 'completed' })
        return
      }

      await ctx.runMutation(internal.flowRuns.advanceToGate, {
        flowRunId,
        gateId: nextGateId,
      })

      const conversationId = await ctx.runMutation(internal.flowRuns.ensureConversation, { flowRunId })

      const maybeDraftChangeSetIds = await runSkillForGate(ctx, {
        projectId,
        conversationId,
        gateId: nextGateId,
        useWebSearch: !!refreshed.toggles?.useWebSearch,
        flags,
      })

      if (maybeDraftChangeSetIds.length > 0) {
        await ctx.runMutation(internal.flowRuns.setAwaitingApproval, {
          flowRunId,
          gateId: nextGateId,
          draftChangeSetIds: maybeDraftChangeSetIds,
        })
        return
      }
    }
  }
})

async function runSkillForGate(
  ctx: any,
  args: {
    projectId: Id<'projects'>
    conversationId: Id<'agentConversations'>
    gateId: string
    useWebSearch: boolean
    flags: Record<string, boolean>
  }
): Promise<Array<Id<'changeSets'>>> {
  const pricingGatesEnabled = isEnabled(args.flags, 'ff_flow_pricing_gates', false)
  const webPricingEnabled = isEnabled(args.flags, 'ff_flow_web_pricing', false)

  const skills: string[] = []

  if (args.gateId === 'G1') skills.push('ELEMENTS_BUILDER_FULL')
  if (args.gateId === 'G2') skills.push('TASKS_BUILDER_FULL')
  if (args.gateId === 'G3') skills.push('ACCOUNTING_BUILDER_FULL')

  if (args.gateId === 'G4') {
    if (!pricingGatesEnabled) return []
    skills.push('PRICING_LOOKUP_CATALOG_BATCH')
    if (webPricingEnabled && args.useWebSearch) {
      skills.push('RESEARCH_PRICING_ESTIMATES_WEB')
    }
    skills.push('PRICING_ESTIMATE_FALLBACK_BATCH')
  }

  if (args.gateId === 'G5') {
    if (!pricingGatesEnabled) return []
    skills.push('TASKS_ENRICH_FROM_ACCOUNTING_BATCH')
  }

  if (args.gateId === 'G6') {
    if (!pricingGatesEnabled) return []
    skills.push('OVERHEAD_AND_LOGISTICS_COMPLETER')
  }

  // G7 is a deterministic recheck; no skill required.

  if (args.gateId === 'G8') {
    if (!pricingGatesEnabled) return []
    skills.push('QUOTE_BUILD_OR_FIX')
  }

  if (args.gateId === 'G9') {
    if (!pricingGatesEnabled) return []
    skills.push('FINAL_AUDIT_FIXER')
  }

  if (skills.length === 0) return []

  const out: Array<Id<'changeSets'>> = []

  for (const skillId of skills) {
    const blocks = await ctx.runAction(api.skills.runner.runSkill, {
      projectId: args.projectId,
      conversationId: args.conversationId,
      skillId,
      params: {
        source: 'flow_runner',
        toggles: { useWebSearch: args.useWebSearch },
      },
    })

    for (const block of Array.isArray(blocks) ? blocks : []) {
      const id = block?.changeSetId
      if (id) out.push(id)
    }
  }

  return out
}
