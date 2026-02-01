import { v } from 'convex/values'
import { internalAction } from '../_generated/server'
import { api, internal } from '../_generated/api'
import { DEFAULT_FLAGS, isEnabled, normalizeFlags } from '../featureFlags'
import { Id } from '../_generated/dataModel'

const SETTINGS_KEY = 'featureFlags'

async function loadFlags(ctx: any): Promise<Record<string, boolean>> {
  if (ctx.db && typeof ctx.db.query === 'function') {
    try {
      const existing = await ctx.db
        .query('appSettings')
        .withIndex('by_key', (q: any) => q.eq('key', SETTINGS_KEY))
        .first()

      const stored = normalizeFlags(existing?.value)
      return { ...DEFAULT_FLAGS, ...stored }
    } catch {
      // Fall through to runQuery/defaults
    }
  }

  if (typeof ctx.runQuery === 'function') {
    try {
      return await ctx.runQuery(api.featureFlags.getAll)
    } catch {
      return { ...DEFAULT_FLAGS }
    }
  }

  return { ...DEFAULT_FLAGS }
}

function isResolvedChangeSetStatus(status: unknown): boolean {
  return status === 'APPLIED' || status === 'DISCARDED' || status === 'PARTIALLY_APPLIED'
}

function stableStringify(value: any): string {
  if (value === null || value === undefined) return JSON.stringify(value)
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`
  }
  if (typeof value === 'object') {
    const keys = Object.keys(value).sort()
    const entries = keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
    return `{${entries.join(',')}}`
  }
  return JSON.stringify(value)
}

function hashString(input: string): string {
  let hash = 0
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash).toString(36)
}

function buildGateDedupeHash(gateId: string, report: any): string {
  const reportCore = {
    status: report?.status,
    blockingIssues: report?.blockingIssues,
    warnings: report?.warnings,
    opportunities: report?.opportunities,
    readinessScore: report?.readinessScore,
    metrics: report?.metrics,
  }
  const reportHash = hashString(stableStringify(reportCore))
  const questionsHash = hashString(stableStringify(report?.questionsBlock ?? null))
  return `${gateId}:${reportHash}:${questionsHash}`
}

async function applyChangeSetOpsWithRevision(
  ctx: any,
  args: {
    flowRunId: Id<'flowRuns'>
    changeSetId: Id<'changeSets'>
    opIndices: number[]
    appliedBy: 'auto' | 'user' | 'system'
  }
) {
  try {
    await ctx.runMutation(api.changeSets.applyChangeSetOps, {
      changeSetId: args.changeSetId,
      opIndices: args.opIndices,
      allowHardDelete: true,
    })

    await ctx.runMutation(internal.flow.artifactRevisions.recordApplySuccess, {
      flowRunId: args.flowRunId,
      changeSetId: args.changeSetId,
      appliedBy: args.appliedBy,
    })
  } catch (error: any) {
    await ctx.runMutation(internal.flow.artifactRevisions.recordApplyFailure, {
      flowRunId: args.flowRunId,
      changeSetId: args.changeSetId,
      appliedBy: args.appliedBy,
      error: error?.message ?? String(error),
    })
    throw error
  }
}

async function maybeUpdateApprovalMode(ctx: any, run: any): Promise<any> {
  const approvalModeOverride = !!run.approvalModeOverride
  const approvalModeDefault = run.approvalModeDefault ?? 'auto'
  if (approvalModeOverride || approvalModeDefault === 'manual') return run
  if (run.toggles?.autoApprove) return run

  if (run.status !== 'completed') return run

  await ctx.runMutation(internal.flowRuns.setApprovalModeInternal, {
    flowRunId: run._id,
    approvalMode: 'manual',
    approvalModeDefault: 'manual',
    approvalModeOverride: false,
  })

  return await ctx.runQuery(internal.flowRuns.getRunInternal, { flowRunId: run._id })
}

export const tick = internalAction({
  args: {
    flowRunId: v.id('flowRuns'),
  },
  handler: async (ctx, args) => {
    const flags = await loadFlags(ctx)
    if (!isEnabled(flags, 'ff_flow_agent_backend', false)) {
      throw new Error('Flow Agent is disabled (ff_flow_agent_backend)')
    }

    // V3 takes priority
    const v3Enabled = isEnabled(flags, 'ff_flow_runner_v3', false)
    if (v3Enabled) {
      await ctx.runAction(internal.flow.flowRunnerV3.tickV3, { flowRunId: args.flowRunId })
      return
    }

    const v1Enabled = isEnabled(flags, 'ff_flow_runner_v1', false)
    const v2Enabled = isEnabled(flags, 'ff_flow_runner_v2', false)
    if (!v1Enabled && !v2Enabled) {
      throw new Error('Flow runner is disabled (ff_flow_runner_v1/ff_flow_runner_v2)')
    }

    if (v2Enabled) {
      await ctx.runAction(internal.flow.orchestrator.tick, { flowRunId: args.flowRunId })
      return
    }

    await ctx.runAction(internal.flow.flowRunner.tickLegacy, { flowRunId: args.flowRunId })
  },
})

export const tickLegacy = internalAction({
  args: {
    flowRunId: v.id('flowRuns'),
  },
  handler: async (ctx, args) => {
    const { flowRunId } = args

    console.log('[flowRunner.tick] start', { flowRunId })

    const flags = await loadFlags(ctx)
    if (!isEnabled(flags, 'ff_flow_agent_backend', false)) {
      throw new Error('Flow Agent is disabled (ff_flow_agent_backend)')
    }
    const v1Enabled = isEnabled(flags, 'ff_flow_runner_v1', false)
    const v2Enabled = isEnabled(flags, 'ff_flow_runner_v2', false)
    if (!v1Enabled && !v2Enabled) {
      throw new Error('Flow runner is disabled (ff_flow_runner_v1/ff_flow_runner_v2)')
    }

    // Load run state
    let run = await ctx.runQuery(internal.flowRuns.getRunInternal, { flowRunId })
    if (!run) return

    if (run.status === 'paused' || run.status === 'failed' || run.status === 'cancelled' || run.status === 'completed') {
      console.log('[flowRunner.tick] early-exit status', { flowRunId, status: run.status })
      return
    }

    run = await maybeUpdateApprovalMode(ctx, run)

    // If we are awaiting approval, check if all proposed ChangeSets for current gate are resolved.
    if (run.status === 'awaiting_approval') {
      const step = await ctx.runQuery(internal.flowRuns.getStepInternal, {
        flowRunId,
        gateId: run.currentGateId,
      })

      const ids = (step?.draftChangeSetIds ?? []) as Array<Id<'changeSets'>>
      if (ids.length > 0) {
        const changeSets = await Promise.all(ids.map((id) => ctx.runQuery(api.changeSets.get, { id })))
        if (run.toggles?.autoApprove) {
          console.log('[flowRunner.tick] auto-approve enabled', { flowRunId, count: ids.length })
          const summaries: Array<{ changeSetId: Id<'changeSets'>; title?: string; detail?: string }> = []
          for (const cs of changeSets) {
            if (!cs || isResolvedChangeSetStatus(cs.status)) continue
            const opCount = cs.ops?.length ?? 0
            if (opCount === 0) continue
            const opIndices = Array.from({ length: opCount }, (_, i) => i)
            await applyChangeSetOpsWithRevision(ctx, {
              flowRunId,
              changeSetId: cs._id,
              opIndices,
              appliedBy: 'auto',
            })
            summaries.push({
              changeSetId: cs._id,
              title: cs.reason_he ?? cs.report_he?.summaryHe ?? 'Change set applied',
              detail: opCount ? `${opCount} ops` : undefined,
            })
          }

          if (summaries.length > 0) {
            const conversationId = await ctx.runMutation(internal.flowRuns.ensureConversation, { flowRunId })
            await ctx.runMutation(internal.flow.chat.emitAssistantBlocks, {
              conversationId,
              blocks: [
                {
                  type: 'FlowChangeSetSummaryBlock',
                  items: summaries,
                },
              ],
            })
          }
        } else {
          const unresolved = changeSets.some((cs: any) => cs && !isResolvedChangeSetStatus(cs.status))
          console.log('[flowRunner.tick] awaiting_approval', { flowRunId, unresolved, count: ids.length })
          if (unresolved) return
        }
      }

      await ctx.runMutation(internal.flowRuns.clearAwaitingApproval, { flowRunId })
    }

    const GATE_ORDER = ['G0', 'G0C', 'G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7', 'G8', 'G9', 'G10'] as const

    // Auto-advance can walk multiple gates in one tick, but is bounded.
    // We stop as soon as we generate draft ChangeSets (awaiting approval) or hit a blocked gate.
    const initialRun = await ctx.runQuery(internal.flowRuns.getRunInternal, { flowRunId })
    const maxAdvances = initialRun?.toggles?.autoRun ? 10 : 1

    for (let advances = 0; advances < maxAdvances; advances++) {
      console.log('[flowRunner.tick] advance loop', { flowRunId, advances, maxAdvances })
      // Validation updates readiness + blocking keys + status
      const report = await ctx.runMutation(api.flowRuns.computeValidation, { flowRunId })
      const refreshed = await ctx.runQuery(internal.flowRuns.getRunInternal, { flowRunId })
      if (!refreshed) return

      if (report?.status !== 'pass') {
        console.log('[flowRunner.tick] validation failed', {
          flowRunId,
          gateId: refreshed.currentGateId,
          status: report?.status,
          blockingIssues: report?.blockingIssues?.length ?? 0,
        })

        const currentGateId = refreshed.currentGateId
        const step = await ctx.runQuery(internal.flowRuns.getStepInternal, {
          flowRunId,
          gateId: currentGateId,
        })

        const retryInfo = await ctx.runMutation(internal.flowRuns.bumpStepRetry, {
          flowRunId,
          gateId: currentGateId,
        })

        const project = await ctx.runQuery(api.projects.getProjectInternal, { id: refreshed.projectId })
        const dependsOnIssueKeys = Array.isArray(report?.blockingIssues)
          ? report.blockingIssues.map((i: any) => i.key).filter(Boolean)
          : []
        const assumptionsUsed = Array.isArray(project?.assumptionsAccepted)
          ? project.assumptionsAccepted.map((a: any) => a?.key).filter(Boolean)
          : []

        const conversationId = await ctx.runMutation(internal.flowRuns.ensureConversation, { flowRunId })
        const runResult = await runSkillForGate(ctx, {
          projectId: refreshed.projectId,
          conversationId,
          gateId: currentGateId,
          useWebSearch: !!refreshed.toggles?.useWebSearch,
          flags,
          draftOnly: false,
          dependsOnIssueKeys,
          assumptionsUsed,
        })

        if (runResult.changeSetIds.length > 0) {
          if (refreshed.toggles?.autoApprove) {
            const changeSets = await Promise.all(
              runResult.changeSetIds.map((id) => ctx.runQuery(api.changeSets.get, { id }))
            )
            const summaries: Array<{ changeSetId: Id<'changeSets'>; title?: string; detail?: string }> = []
            for (const cs of changeSets) {
              if (!cs || isResolvedChangeSetStatus(cs.status)) continue
              const opCount = cs.ops?.length ?? 0
              if (opCount === 0) continue
              const opIndices = Array.from({ length: opCount }, (_, i) => i)
              await applyChangeSetOpsWithRevision(ctx, {
                flowRunId,
                changeSetId: cs._id,
                opIndices,
                appliedBy: 'auto',
              })
              summaries.push({
                changeSetId: cs._id,
                title: cs.reason_he ?? cs.report_he?.summaryHe ?? 'Change set applied',
                detail: opCount ? `${opCount} ops` : undefined,
              })
            }

            if (summaries.length > 0) {
              await ctx.runMutation(internal.flow.chat.emitAssistantBlocks, {
                conversationId,
                blocks: [
                  {
                    type: 'FlowChangeSetSummaryBlock',
                    items: summaries,
                  },
                ],
              })
            }

            await ctx.scheduler.runAfter(0, internal.flow.flowRunner.tick, { flowRunId })
            return
          }

          await ctx.runMutation(internal.flowRuns.setAwaitingApproval, {
            flowRunId,
            gateId: currentGateId,
            draftChangeSetIds: runResult.changeSetIds,
          })
          return
        }

        await ctx.runMutation(internal.flow.questionSets.generateAndEmit, {
          flowRunId,
          reason: 'validation_failed',
        })

        const retryCount = retryInfo?.retryCount ?? step?.retryCount ?? 0
        const delayMs = Math.min(60000, 2000 * Math.max(1, retryCount))
        await ctx.scheduler.runAfter(delayMs, internal.flow.flowRunner.tick, { flowRunId })
        return
      }

      const projectId = refreshed.projectId
      const currentGateId = refreshed.currentGateId
      const currentIndex = GATE_ORDER.indexOf(currentGateId as any)

      const nextGateId = currentIndex >= 0 ? (GATE_ORDER[currentIndex + 1] as string | undefined) : undefined
      if (!nextGateId) {
        console.log('[flowRunner.tick] completed', { flowRunId })
        await ctx.runAction(api.memory.generateProjectContextDoc, { projectId })
        const conversationId = await ctx.runMutation(internal.flowRuns.ensureConversation, { flowRunId })
        const contextDoc = await ctx.runQuery(api.memory.getProjectContextDoc, { projectId })
        await ctx.runMutation(internal.flow.chat.emitAssistantBlocks, {
          conversationId,
          blocks: [
            {
              type: 'ChatBlock',
              markdownHe: 'Project Context document created and saved in Knowledge → Project Context.',
            },
            ...(contextDoc?.contentMd_he
              ? [
                {
                  type: 'ChatBlock',
                  markdownHe: contextDoc.contentMd_he,
                },
              ]
              : []),
          ],
        })
        await ctx.runMutation(internal.flowRuns.setRunStatus, { flowRunId, status: 'completed' })
        return
      }

      console.log('[flowRunner.tick] advance gate', { flowRunId, from: currentGateId, to: nextGateId })
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

      console.log('[flowRunner.tick] gate result', {
        flowRunId,
        gateId: nextGateId,
        changeSets: maybeDraftChangeSetIds.changeSetIds.length,
      })

      if (maybeDraftChangeSetIds.changeSetIds.length > 0) {
        await ctx.runMutation(internal.flowRuns.setAwaitingApproval, {
          flowRunId,
          gateId: nextGateId,
          draftChangeSetIds: maybeDraftChangeSetIds.changeSetIds,
        })
        if (refreshed.toggles?.autoApprove) {
          await ctx.scheduler.runAfter(0, internal.flow.flowRunner.tick, { flowRunId })
        }
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
    draftOnly?: boolean
    dependsOnIssueKeys?: string[]
    assumptionsUsed?: string[]
  }
): Promise<{ changeSetIds: Array<Id<'changeSets'>>; hasQuestions: boolean }> {
  const pricingGatesEnabled = isEnabled(args.flags, 'ff_flow_pricing_gates', false)
  const webPricingEnabled = isEnabled(args.flags, 'ff_flow_web_pricing', false)

  const skills: string[] = []

  if (args.gateId === 'G0C') skills.push('ELEMENTS_BUILDER_FULL')
  if (args.gateId === 'G1') skills.push('ELEMENTS_BUILDER_FULL')
  if (args.gateId === 'G2') skills.push('TASKS_BUILDER_FULL')
  if (args.gateId === 'G3') skills.push('ACCOUNTING_BUILDER_FULL')

  if (args.gateId === 'G4') {
    if (!pricingGatesEnabled) return { changeSetIds: [], hasQuestions: false }
    skills.push('PRICING_LOOKUP_CATALOG_BATCH')
    if (webPricingEnabled && args.useWebSearch) {
      skills.push('PRICING_RESEARCH_WEB_BATCH')
    }
    skills.push('PRICING_ESTIMATE_FALLBACK_BATCH')
    skills.push('BOM_DUPLICATE_ANALYZER')
  }

  if (args.gateId === 'G5') {
    if (!pricingGatesEnabled) return { changeSetIds: [], hasQuestions: false }
    skills.push('TASKS_ENRICH_FROM_ACCOUNTING_BATCH')
  }

  if (args.gateId === 'G6') {
    if (!pricingGatesEnabled) return { changeSetIds: [], hasQuestions: false }
    skills.push('OVERHEAD_AND_LOGISTICS_COMPLETER')
  }

  // G7 is a deterministic recheck; no skill required.

  if (args.gateId === 'G8') {
    if (!pricingGatesEnabled) return { changeSetIds: [], hasQuestions: false }
    skills.push('QUOTE_BUILD_OR_FIX')
  }

  if (args.gateId === 'G9') {
    if (!pricingGatesEnabled) return { changeSetIds: [], hasQuestions: false }
    skills.push('FINAL_AUDIT_FIXER')
  }

  if (args.gateId === 'G10') {
    skills.push('CONTEXT_GENERATION')
  }

  if (skills.length === 0) return { changeSetIds: [], hasQuestions: false }

  console.log('[flowRunner.runSkillForGate] start', {
    gateId: args.gateId,
    skills,
    draftOnly: !!args.draftOnly,
    useWebSearch: !!args.useWebSearch,
  })

  const out: Array<Id<'changeSets'>> = []
  let hasQuestions = false

  for (const skillId of skills) {
    console.log('[flowRunner.runSkillForGate] runSkill', { gateId: args.gateId, skillId })
    const shouldSkipClarifications = !['G0C', 'G1', 'G2', 'G3'].includes(args.gateId)
    const forceClarifications = args.gateId === 'G0C' && skillId === 'ELEMENTS_BUILDER_FULL'
    const blocks = await ctx.runAction(api.skills.runner.runSkill, {
      projectId: args.projectId,
      conversationId: args.conversationId,
      skillId,
      params: {
        source: 'flow_runner',
        toggles: { useWebSearch: args.useWebSearch },
        draftOnly: !!args.draftOnly,
        skipClarifications: shouldSkipClarifications,
        forceClarifications,
        dependsOnIssueKeys: args.dependsOnIssueKeys,
        assumptionsUsed: args.assumptionsUsed,
      },
    })

    for (const block of Array.isArray(blocks) ? blocks : []) {
      const id = block?.changeSetId
      if (id) out.push(id)
      if (block?.type === 'QuestionsBlock') hasQuestions = true
    }
  }

  console.log('[flowRunner.runSkillForGate] done', { gateId: args.gateId, changeSets: out.length })
  return { changeSetIds: out, hasQuestions }
}
