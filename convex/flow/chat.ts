import { action, internalMutation, internalQuery, mutation, query } from '../_generated/server'
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

export const listMessages = query({
  args: { conversationId: v.id('agentConversations') },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('agentMessages')
      .withIndex('by_conversation', (q) => q.eq('conversationId', args.conversationId))
      .order('asc')
      .collect()
  },
})

export const sendUserMessage = mutation({
  args: {
    conversationId: v.id('agentConversations'),
    text: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert('agentMessages', {
      conversationId: args.conversationId,
      role: 'user',
      text: args.text,
      createdAt: Date.now(),
    })

    await ctx.db.patch(args.conversationId, { updatedAt: Date.now() })

    const flags = await loadFlags(ctx)
    const v1Enabled = isEnabled(flags, 'ff_flow_runner_v1', false)
    const v2Enabled = isEnabled(flags, 'ff_flow_runner_v2', false)
    if (!v1Enabled && !v2Enabled) return

    const conversation = await ctx.db.get(args.conversationId)
    if (!conversation) return

    const flowRun = await ctx.db
      .query('flowRuns')
      .withIndex('by_project_status', (q) => q.eq('projectId', conversation.projectId).eq('status', 'running'))
      .first()

    if (!flowRun?.toggles?.autoRun) return

    await ctx.scheduler.runAfter(0, internal.flow.flowRunner.tick, {
      flowRunId: flowRun._id,
    })
  },
})

export const emitAssistantBlocks = internalMutation({
  args: {
    conversationId: v.id('agentConversations'),
    blocks: v.array(v.any()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert('agentMessages', {
      conversationId: args.conversationId,
      role: 'assistant',
      blocks: args.blocks,
      createdAt: Date.now(),
    })

    await ctx.db.patch(args.conversationId, { updatedAt: Date.now() })
  },
})

export const emitUserSummary = internalMutation({
  args: {
    conversationId: v.id('agentConversations'),
    text: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert('agentMessages', {
      conversationId: args.conversationId,
      role: 'user',
      text: args.text,
      createdAt: Date.now(),
    })

    await ctx.db.patch(args.conversationId, { updatedAt: Date.now() })
  },
})

export const findRecentBlock = internalQuery({
  args: {
    conversationId: v.id('agentConversations'),
    blockType: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query('agentMessages')
      .withIndex('by_conversation', (q) => q.eq('conversationId', args.conversationId))
      .order('desc')
      .take(args.limit ?? 50)

    for (const row of rows) {
      const blocks = Array.isArray(row.blocks) ? row.blocks : []
      if (blocks.some((block) => block?.type === args.blockType)) return row._id
    }

    return null
  },
})

export const submitBrainDump = action({
  args: {
    flowRunId: v.id('flowRuns'),
    text: v.string(),
    mode: v.optional(v.union(v.literal('append'), v.literal('replace'))),
  },
  handler: async (ctx, args) => {
    const run = await ctx.runQuery(internal.flowRuns.getRunInternal, { flowRunId: args.flowRunId })
    if (!run) throw new Error('Flow run not found')

    const conversationId = await ctx.runMutation(internal.flowRuns.ensureConversation, {
      flowRunId: args.flowRunId,
    })

    const mode = args.mode ?? 'append'
    if (mode === 'replace') {
      await ctx.runMutation(api.brainDump.setProjectBrainDumpRaw, {
        projectId: run.projectId,
        text: args.text,
      })
    } else {
      await ctx.runMutation(api.brainDump.appendProjectBrainDump, {
        projectId: run.projectId,
        text: args.text,
      })
    }

    const snippet = args.text.trim().slice(0, 160)
    const summary = snippet ? `Brain dump saved: ${snippet}${args.text.length > 160 ? '…' : ''}` : 'Brain dump saved.'

    await ctx.runMutation(internal.flow.chat.emitAssistantBlocks, {
      conversationId,
      blocks: [
        {
          type: 'ChatBlock',
          markdownHe: summary,
        },
      ],
    })

    await ctx.runAction(internal.flow.flowRunner.tick, { flowRunId: args.flowRunId })
  },
})
