import { internalMutation, internalQuery } from '../../_generated/server'
import { v } from 'convex/values'

export const listStageArtifactsByRun = internalQuery({
  args: {
    runId: v.id('sdkRuns'),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('sdkStageArtifacts')
      .withIndex('by_run', (q) => q.eq('runId', args.runId))
      .collect()
  },
})

export const getStageArtifactByRunStage = internalQuery({
  args: {
    runId: v.id('sdkRuns'),
    stageKey: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('sdkStageArtifacts')
      .withIndex('by_run_stage', (q) => q.eq('runId', args.runId).eq('stageKey', args.stageKey))
      .first()
  },
})

export const upsertStageArtifact = internalMutation({
  args: {
    runId: v.id('sdkRuns'),
    projectId: v.id('projects'),
    conversationId: v.id('agentConversations'),
    stageKey: v.string(),
    artifact: v.any(),
    specHash: v.string(),
    artifactHash: v.string(),
    status: v.optional(v.string()),
    progress: v.optional(v.object({
      progressKey: v.string(),
      progressCount: v.number(),
      noProgressCount: v.number(),
      lastProgressAt: v.optional(v.number()),
    })),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('sdkStageArtifacts')
      .withIndex('by_run_stage', (q) => q.eq('runId', args.runId).eq('stageKey', args.stageKey))
      .first()

    const patch = {
      artifact: args.artifact,
      specHash: args.specHash,
      artifactHash: args.artifactHash,
      status: args.status ?? 'ready',
      progress: args.progress,
      updatedAt: Date.now(),
    }

    if (!existing) {
      return await ctx.db.insert('sdkStageArtifacts', {
        runId: args.runId,
        projectId: args.projectId,
        conversationId: args.conversationId,
        stageKey: args.stageKey,
        artifact: args.artifact,
        specHash: args.specHash,
        artifactHash: args.artifactHash,
        status: args.status ?? 'ready',
        progress: args.progress,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    }

    await ctx.db.patch(existing._id, patch)
    return existing._id
  },
})

export const appendStageDecision = internalMutation({
  args: {
    runId: v.id('sdkRuns'),
    conversationId: v.id('agentConversations'),
    stageKey: v.string(),
    decisionType: v.string(),
    payload: v.any(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert('sdkStageDecisions', {
      runId: args.runId,
      conversationId: args.conversationId,
      stageKey: args.stageKey,
      decisionType: args.decisionType,
      payload: args.payload,
      createdAt: Date.now(),
    })
  },
})

export const listStageDecisionsByRun = internalQuery({
  args: {
    runId: v.id('sdkRuns'),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('sdkStageDecisions')
      .withIndex('by_run', (q) => q.eq('runId', args.runId))
      .order('desc')
      .take(200)
  },
})

export const listAnsweredVnextQaPairs = internalQuery({
  args: {
    projectId: v.id('projects'),
  },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query('qaPairs')
      .withIndex('by_project_status', (q) =>
        q.eq('projectId', args.projectId).eq('status', 'answered')
      )
      .take(200)
    return rows.filter(
      (qa) => qa.questionKey && qa.questionKey.startsWith('vnext.')
    )
  },
})
