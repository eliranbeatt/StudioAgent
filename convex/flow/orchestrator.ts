import { v } from 'convex/values'
import { internalAction, internalQuery, internalMutation } from '../_generated/server'
import { api, internal } from '../_generated/api'
import { Id } from '../_generated/dataModel'
import { FLOW_GRAPH_V2, getReadyNodes } from './graph'
import { createRevisionFromLive, applyChangeSetAndCreateRevision } from './artifactRevisions'

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

function buildInputsHash(nodeId: string, artifactRevisionInId: string | null, answerVersionUsed: number) {
  return hashString(
    stableStringify({
      nodeId,
      artifactRevisionInId,
      answerVersionUsed,
    })
  )
}

async function ensureArtifactRevision(ctx: any, run: any) {
  if (run.currentArtifactRevisionId) return run.currentArtifactRevisionId
  const artifactRevisionId = await createRevisionFromLive(ctx, {
    projectId: run.projectId,
    runId: run._id,
    source: 'runStart',
  })
  await ctx.runMutation(internal.flow.orchestrator.updateRunCurrentGate, {
    runId: run._id,
    currentGateId: run.currentGateId,
    graphVersion: run.graphVersion ?? 'v2.1',
    currentArtifactRevisionId: artifactRevisionId,
  })
  return artifactRevisionId
}

async function runNodeSkills(
  ctx: any,
  args: {
    nodeId: string
    projectId: Id<'projects'>
    conversationId: Id<'agentConversations'>
    useWebSearch: boolean
    flags: Record<string, boolean>
    artifactRevisionId?: Id<'flowArtifactRevisions'>
    answerVersionUsed?: number
    answerStateSnapshot?: Record<string, any>
  }
): Promise<Array<Id<'changeSets'>>> {
  const pricingGatesEnabled = !!args.flags.ff_flow_pricing_gates
  const webPricingEnabled = !!args.flags.ff_flow_web_pricing

  const skills: string[] = []

  if (args.nodeId === 'G0C') skills.push('ELEMENTS_BUILDER_FULL')
  if (args.nodeId === 'G1') skills.push('ELEMENTS_BUILDER_FULL')
  if (args.nodeId === 'G2') skills.push('TASKS_BUILDER_FULL')
  if (args.nodeId === 'G3') skills.push('ACCOUNTING_BUILDER_FULL')

  if (args.nodeId === 'G4') {
    if (!pricingGatesEnabled) return []
    skills.push('PRICING_LOOKUP_CATALOG_BATCH')
    if (webPricingEnabled && args.useWebSearch) {
      skills.push('PRICING_RESEARCH_WEB_BATCH')
    }
    skills.push('PRICING_ESTIMATE_FALLBACK_BATCH')
    skills.push('BOM_DUPLICATE_ANALYZER')
  }

  if (args.nodeId === 'G5') {
    if (!pricingGatesEnabled) return []
    skills.push('TASKS_ENRICH_FROM_ACCOUNTING_BATCH')
  }

  if (args.nodeId === 'G6') {
    if (!pricingGatesEnabled) return []
    skills.push('OVERHEAD_AND_LOGISTICS_COMPLETER')
  }

  if (args.nodeId === 'G8') {
    if (!pricingGatesEnabled) return []
    skills.push('QUOTE_BUILD_OR_FIX')
  }

  if (args.nodeId === 'G9') {
    if (!pricingGatesEnabled) return []
    skills.push('FINAL_AUDIT_FIXER')
  }

  if (args.nodeId === 'G10') {
    skills.push('CONTEXT_GENERATION')
  }

  if (skills.length === 0) return []

  const out: Array<Id<'changeSets'>> = []

  for (const skillId of skills) {
    const shouldSkipClarifications = !['G0C', 'G1', 'G2', 'G3'].includes(args.nodeId)
    const forceClarifications = args.nodeId === 'G0C' && skillId === 'ELEMENTS_BUILDER_FULL'
    const blocks = await ctx.runAction(api.skills.runner.runSkill, {
      projectId: args.projectId,
      conversationId: args.conversationId,
      skillId,
      params: {
        source: 'flow_orchestrator_v2',
        toggles: { useWebSearch: args.useWebSearch },
        draftOnly: false,
        skipClarifications: shouldSkipClarifications,
        forceClarifications,
        artifactRevisionId: args.artifactRevisionId,
        answerVersionUsed: args.answerVersionUsed,
        answerStateSnapshot: args.answerStateSnapshot,
      },
    })

    for (const block of Array.isArray(blocks) ? blocks : []) {
      const id = block?.changeSetId
      if (id) out.push(id)
    }
  }

  return out
}

export const getNodeRuns = internalQuery({
  args: { flowRunId: v.id('flowRuns') },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('flowNodeRuns')
      .withIndex('by_run', (q: any) => q.eq('runId', args.flowRunId))
      .collect()
  },
})

export const insertNodeRun = internalMutation({
  args: {
    runId: v.id('flowRuns'),
    nodeId: v.string(),
    attempt: v.number(),
    status: v.string(),
    dependsOn: v.array(v.string()),
    artifactRevisionInId: v.optional(v.id('flowArtifactRevisions')),
    answerVersionUsed: v.number(),
    inputsHash: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert('flowNodeRuns', {
      runId: args.runId,
      nodeId: args.nodeId,
      attempt: args.attempt,
      status: args.status as any,
      dependsOn: args.dependsOn,
      artifactRevisionInId: args.artifactRevisionInId,
      answerVersionUsed: args.answerVersionUsed,
      inputsHash: args.inputsHash,
      startedAt: Date.now(),
      createdAt: Date.now(),
    })
  },
})

export const updateNodeRunStatus = internalMutation({
  args: {
    nodeRunId: v.id('flowNodeRuns'),
    status: v.string(),
    artifactRevisionOutId: v.optional(v.id('flowArtifactRevisions')),
    changesetId: v.optional(v.id('changeSets')),
  },
  handler: async (ctx, args) => {
    const patch: any = {
      status: args.status,
      finishedAt: Date.now(),
    }
    if (args.artifactRevisionOutId !== undefined) {
      patch.artifactRevisionOutId = args.artifactRevisionOutId
    }
    if (args.changesetId !== undefined) {
      patch.changesetId = args.changesetId
    }
    await ctx.db.patch(args.nodeRunId, patch)
  },
})

export const updateRunCurrentGate = internalMutation({
  args: {
    runId: v.id('flowRuns'),
    currentGateId: v.string(),
    graphVersion: v.string(),
    currentArtifactRevisionId: v.optional(v.id('flowArtifactRevisions')),
  },
  handler: async (ctx, args) => {
    const patch: any = {
      currentGateId: args.currentGateId,
      graphVersion: args.graphVersion,
      updatedAt: Date.now(),
    }
    if (args.currentArtifactRevisionId !== undefined) {
      patch.currentArtifactRevisionId = args.currentArtifactRevisionId
    }
    await ctx.db.patch(args.runId, patch)
  },
})

export const tick = internalAction({
  args: {
    flowRunId: v.id('flowRuns'),
  },
  handler: async (ctx, args) => {
    const run = await ctx.runQuery(internal.flowRuns.getRunInternal, { flowRunId: args.flowRunId })
    if (!run) return

    if (run.status === 'paused' || run.status === 'failed' || run.status === 'cancelled' || run.status === 'completed') {
      return
    }

    const flags = await ctx.runQuery(api.featureFlags.getAll)
    let artifactRevisionInId = await ensureArtifactRevision(ctx, run)
    const answerVersionUsed = typeof run.latestAnswerVersion === 'number' ? run.latestAnswerVersion : 0
    const answerStateSnapshot = await ctx.runQuery(internal.flow.answerState.getAnswerStateAtVersion, {
      flowRunId: run._id,
      answerVersion: answerVersionUsed,
    })

    const nodeRuns = await ctx.runQuery(internal.flow.orchestrator.getNodeRuns, {
      flowRunId: args.flowRunId,
    })

    const completed = new Set(
      nodeRuns.filter((node: any) => node.status === 'done').map((node: any) => node.nodeId)
    ) as Set<string>
    const running = new Set(
      nodeRuns.filter((node: any) => node.status === 'running').map((node: any) => node.nodeId)
    ) as Set<string>
    const appliedHashes = new Set(
      nodeRuns.filter((node: any) => node.status === 'done' && node.inputsHash).map((node: any) => node.inputsHash)
    )

    const readyNodes = getReadyNodes(FLOW_GRAPH_V2, completed, running)
    const availableSlots = Math.max(0, FLOW_GRAPH_V2.concurrencyLimit - running.size)
    const toStart = readyNodes.slice(0, availableSlots)

    if (toStart.length === 0) {
      const totalNodes = FLOW_GRAPH_V2.nodes.length
      if (completed.size >= totalNodes) {
        await ctx.runAction(api.memory.generateProjectContextDoc, { projectId: run.projectId })
        const conversationId = await ctx.runMutation(internal.flowRuns.ensureConversation, { flowRunId: run._id })
        const contextDoc = await ctx.runQuery(api.memory.getProjectContextDoc, { projectId: run.projectId })
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
        await ctx.runMutation(internal.flowRuns.setRunStatus, { flowRunId: run._id, status: 'completed' })
      }
      return
    }

    for (const node of toStart) {
      const attempt = nodeRuns.filter((n: any) => n.nodeId === node.id).length + 1
      const inputsHash = buildInputsHash(node.id, artifactRevisionInId ?? null, answerVersionUsed)
      if (appliedHashes.has(inputsHash)) {
        continue
      }

      const nodeRunId = await ctx.runMutation(internal.flow.orchestrator.insertNodeRun, {
        runId: run._id,
        nodeId: node.id,
        attempt,
        status: 'running',
        dependsOn: node.dependsOn,
        artifactRevisionInId,
        answerVersionUsed,
        inputsHash,
      })

      await ctx.runMutation(internal.flow.orchestrator.updateRunCurrentGate, {
        runId: run._id,
        currentGateId: node.id,
        graphVersion: FLOW_GRAPH_V2.version,
      })

      try {
        const conversationId = await ctx.runMutation(internal.flowRuns.ensureConversation, { flowRunId: run._id })
        const changeSetIds = await runNodeSkills(ctx, {
          nodeId: node.id,
          projectId: run.projectId,
          conversationId,
          useWebSearch: !!run.toggles?.useWebSearch,
          flags,
          artifactRevisionId: artifactRevisionInId ?? undefined,
          answerVersionUsed,
          answerStateSnapshot: answerStateSnapshot?.answersByKey ?? undefined,
        })

        const latestRun = await ctx.runQuery(internal.flowRuns.getRunInternal, { flowRunId: run._id })
        if (latestRun?.currentArtifactRevisionId && latestRun.currentArtifactRevisionId !== artifactRevisionInId) {
          await ctx.runMutation(internal.flow.orchestrator.updateNodeRunStatus, {
            nodeRunId,
            status: 'stale',
          })
          continue
        }

        let artifactRevisionOutId = artifactRevisionInId
        let primaryChangeSetId: Id<'changeSets'> | null = null

        for (const changeSetId of changeSetIds) {
          primaryChangeSetId = primaryChangeSetId ?? changeSetId
          const result = await applyChangeSetAndCreateRevision(ctx, {
            changeSetId,
            baseRevisionId: artifactRevisionOutId ?? undefined,
            runId: run._id,
            nodeId: node.id,
            appliedBy: 'auto',
          })
          artifactRevisionOutId = result.artifactRevisionOutId
        }

        await ctx.runMutation(internal.flow.orchestrator.updateNodeRunStatus, {
          nodeRunId,
          status: 'done',
          artifactRevisionOutId: artifactRevisionOutId ?? undefined,
          changesetId: primaryChangeSetId ?? undefined,
        })

        await ctx.runMutation(internal.flow.questionSets.generateAndEmit, {
          flowRunId: run._id,
          reason: 'gate',
        })

        if (artifactRevisionOutId) {
          artifactRevisionInId = artifactRevisionOutId
        }
      } catch (error: any) {
        await ctx.runMutation(internal.flow.orchestrator.updateNodeRunStatus, {
          nodeRunId,
          status: 'failed',
        })
        await ctx.runMutation(internal.flowRuns.setRunStatus, { flowRunId: run._id, status: 'failed' })
        throw error
      }
    }

    await ctx.scheduler.runAfter(0, internal.flow.orchestrator.tick, { flowRunId: run._id })
  },
})
