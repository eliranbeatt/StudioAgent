import { action } from '../_generated/server'
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

export const submitGateAnswers = action({
  args: {
    flowRunId: v.id('flowRuns'),
    answersByKey: v.record(v.string(), v.string()),
    intent: v.union(v.literal('ask_more'), v.literal('advance'), v.literal('skip')),
    questionKeys: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const flags = await loadFlags(ctx)
    if (!isEnabled(flags, 'ff_flow_agent_backend', false)) {
      throw new Error('Flow Agent is disabled (ff_flow_agent_backend)')
    }

    const run = await ctx.runQuery(internal.flowRuns.getRunInternal, { flowRunId: args.flowRunId })
    if (!run) throw new Error('Flow run not found')

    const conversationId = await ctx.runMutation(internal.flowRuns.ensureConversation, {
      flowRunId: args.flowRunId,
    })

    const answers = args.answersByKey ?? {}
    const answerKeys = Object.keys(answers).filter((key) => String(answers[key] ?? '').trim())
    const hasAnswers = answerKeys.length > 0
    if (hasAnswers) {
      await ctx.runMutation(api.flowAnswers.submitAnswers, {
        flowRunId: args.flowRunId,
        answersByKey: answers,
      })
    }

    if (args.intent === 'skip' && Array.isArray(args.questionKeys)) {
      for (const key of args.questionKeys) {
        const cleaned = String(key ?? '').trim()
        if (!cleaned) continue
        await ctx.runMutation(api.flowAnswers.acceptUnknown, {
          flowRunId: args.flowRunId,
          issueKey: cleaned,
        })
      }
    }

    const summary =
      args.intent === 'skip'
        ? `Skipped gate ${run.currentGateId}.`
        : hasAnswers
          ? `Saved ${answerKeys.length} answer(s) for gate ${run.currentGateId}.`
          : `Updated gate ${run.currentGateId}.`

    await ctx.runMutation(internal.flow.chat.emitUserSummary, {
      conversationId,
      text: summary,
    })

    await ctx.runAction(internal.flow.flowRunner.tick, { flowRunId: args.flowRunId })
  },
})
