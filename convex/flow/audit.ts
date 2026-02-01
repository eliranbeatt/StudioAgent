import { action, internalMutation, query } from '../_generated/server'
import { v } from 'convex/values'
import { api, internal } from '../_generated/api'
import { DEFAULT_FLAGS, isEnabled, normalizeFlags } from '../featureFlags'

const SETTINGS_KEY = 'featureFlags'

async function loadFlags(ctx: any): Promise<Record<string, boolean>> {
  if (ctx.db) {
    const existing = await ctx.db
      .query('appSettings')
      .withIndex('by_key', (q: any) => q.eq('key', SETTINGS_KEY))
      .first()

    const stored = normalizeFlags(existing?.value)
    return { ...DEFAULT_FLAGS, ...stored }
  }
  return await ctx.runQuery(api.featureFlags.getAll)
}

export const run = action({
  args: {
    flowRunId: v.id('flowRuns'),
  },
  handler: async (ctx, args) => {
    const flags = await loadFlags(ctx)
    if (!isEnabled(flags, 'ff_flow_agent_backend', false)) {
      throw new Error('Flow Agent is disabled (ff_flow_agent_backend)')
    }

    const run = await ctx.runQuery(internal.flowRuns.getRunInternal, { flowRunId: args.flowRunId })
    if (!run) throw new Error('Flow run not found')

    const now = Date.now()
    const auditRunId = `${args.flowRunId}:${now}`

    const recordId = await ctx.runMutation(internal.flow.audit.createAuditRun, {
      flowRunId: args.flowRunId,
      auditRunId,
      answerVersionUsed: run.latestAnswerVersion ?? 0,
      artifactRevisionUsed: run.currentArtifactRevisionId,
    })

    const conversationId = await ctx.runMutation(internal.flowRuns.ensureConversation, {
      flowRunId: args.flowRunId,
    })

    const blocks = await ctx.runAction(api.skills.runner.runSkill, {
      projectId: run.projectId,
      conversationId,
      skillId: 'FINAL_AUDIT_FIXER',
      params: {
        source: 'flow_audit',
        draftOnly: true,
      },
    })

    const changeSetId = Array.isArray(blocks)
      ? (blocks.find((b: any) => b?.changeSetId)?.changeSetId ?? null)
      : null

    await ctx.runMutation(internal.flow.audit.finishAuditRun, {
      auditRunRecordId: recordId,
      changeSetId,
    })

    await ctx.runMutation(internal.flow.chat.emitAssistantBlocks, {
      conversationId,
      blocks: [
        {
          type: 'ChatBlock',
          markdownHe: changeSetId
            ? 'Audit complete. Review the proposed ChangeSet in the review drawer.'
            : 'Audit complete. No ChangeSet was produced.',
        },
      ],
    })

    return { auditRunId, changeSetId }
  },
})

export const getLatestByRun = query({
  args: {
    flowRunId: v.id('flowRuns'),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('flowAuditRuns')
      .withIndex('by_run', (q: any) => q.eq('runId', args.flowRunId))
      .order('desc')
      .first()
  },
})

export const getStaleness = query({
  args: {
    flowRunId: v.id('flowRuns'),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.flowRunId)
    if (!run) return { stale: false }
    const latest = await ctx.db
      .query('flowAuditRuns')
      .withIndex('by_run', (q: any) => q.eq('runId', args.flowRunId))
      .order('desc')
      .first()
    if (!latest) return { stale: false }

    const stale =
      (latest.answerVersionUsed ?? 0) !== (run.latestAnswerVersion ?? 0) ||
      String(latest.artifactRevisionUsed ?? '') !== String(run.currentArtifactRevisionId ?? '')

    return { stale, auditRun: latest }
  },
})

export const createAuditRun = internalMutation({
  args: {
    flowRunId: v.id('flowRuns'),
    auditRunId: v.string(),
    answerVersionUsed: v.number(),
    artifactRevisionUsed: v.optional(v.id('flowArtifactRevisions')),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert('flowAuditRuns', {
      runId: args.flowRunId,
      auditRunId: args.auditRunId,
      createdAt: Date.now(),
      answerVersionUsed: args.answerVersionUsed,
      artifactRevisionUsed: args.artifactRevisionUsed,
      status: 'running',
    })
  },
})

export const finishAuditRun = internalMutation({
  args: {
    auditRunRecordId: v.id('flowAuditRuns'),
    changeSetId: v.optional(v.id('changeSets')),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.auditRunRecordId, {
      status: 'done',
      changeSetId: args.changeSetId,
      finishedAt: Date.now(),
    })
  },
})
