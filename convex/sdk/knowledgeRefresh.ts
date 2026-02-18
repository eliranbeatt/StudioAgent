import { v } from 'convex/values'
import { api, internal } from '../_generated/api'
import { internalAction, internalMutation } from '../_generated/server'

export const queueProjectContextRefresh = internalMutation({
  args: {
    projectId: v.id('projects'),
    reason: v.string(),
    newFacts: v.optional(v.array(v.string())),
    userText: v.optional(v.string()),
    runId: v.optional(v.id('sdkRuns')),
    conversationId: v.optional(v.id('agentConversations')),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.projectId, {
      summaryStatus: 'queued',
      summaryError: undefined,
      updatedAt: Date.now(),
    })

    await ctx.scheduler.runAfter(0, internal.sdk.knowledgeRefresh.runProjectContextRefresh, {
      projectId: args.projectId,
      reason: args.reason,
      newFacts: args.newFacts ?? [],
      userText: args.userText,
      runId: args.runId,
      conversationId: args.conversationId,
    })

    return { queued: true }
  },
})

export const runProjectContextRefresh = internalAction({
  args: {
    projectId: v.id('projects'),
    reason: v.string(),
    newFacts: v.array(v.string()),
    userText: v.optional(v.string()),
    runId: v.optional(v.id('sdkRuns')),
    conversationId: v.optional(v.id('agentConversations')),
  },
  handler: async (ctx, args) => {
    await ctx.runMutation(internal.sdk.knowledgeRefresh.setRefreshGenerating, {
      projectId: args.projectId,
    })

    try {
      await ctx.runAction(api.sdk.knowledge.summarizeOrUpdate, {
        projectId: args.projectId,
        newFacts: args.newFacts,
        userText: args.userText,
        runId: args.runId,
        conversationId: args.conversationId,
      })

      const contextDoc = await ctx.runQuery(api.memory.getProjectContextDoc, {
        projectId: args.projectId,
      })
      const summaryText = String(contextDoc?.contentMd_he ?? '').trim()

      await ctx.runMutation(internal.sdk.knowledgeRefresh.setRefreshReady, {
        projectId: args.projectId,
        summaryText,
      })

      return { ok: true, reason: args.reason }
    } catch (error: any) {
      const message = String(error?.message ?? 'Project context refresh failed')
      await ctx.runMutation(internal.sdk.knowledgeRefresh.setRefreshFailed, {
        projectId: args.projectId,
        message,
      })
      return { ok: false, error: message, reason: args.reason }
    }
  },
})

export const setRefreshGenerating = internalMutation({
  args: {
    projectId: v.id('projects'),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.projectId, {
      summaryStatus: 'generating',
      summaryError: undefined,
      updatedAt: Date.now(),
    })
  },
})

export const setRefreshReady = internalMutation({
  args: {
    projectId: v.id('projects'),
    summaryText: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.projectId, {
      summary: args.summaryText,
      overviewSummary: args.summaryText,
      summaryStatus: 'ready',
      summaryError: undefined,
      summaryUpdatedAt: Date.now(),
      updatedAt: Date.now(),
    })
  },
})

export const setRefreshFailed = internalMutation({
  args: {
    projectId: v.id('projects'),
    message: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.projectId, {
      summaryStatus: 'failed',
      summaryError: args.message,
      summaryUpdatedAt: Date.now(),
      updatedAt: Date.now(),
    })
  },
})
