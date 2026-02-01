import { internalQuery } from '../_generated/server'
import { v } from 'convex/values'

export const getAnswerStateAtVersion = internalQuery({
  args: {
    flowRunId: v.id('flowRuns'),
    answerVersion: v.number(),
  },
  handler: async (ctx, args) => {
    const events = await ctx.db
      .query('flowAnswerEvents')
      .withIndex('by_run_answerVersion', (q: any) => q.eq('runId', args.flowRunId))
      .filter((q: any) => q.lte(q.field('answerVersion'), args.answerVersion))
      .order('asc')
      .collect()

    const answersByKey: Record<string, any> = {}
    for (const ev of events) {
      if (!ev?.fieldKey) continue
      answersByKey[ev.fieldKey] = ev.answer
    }

    return {
      answerVersion: args.answerVersion,
      answersByKey,
      events,
    }
  },
})
