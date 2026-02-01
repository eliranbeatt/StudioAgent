import { query } from '../_generated/server'
import { v } from 'convex/values'

export const exportRun = query({
  args: {
    flowRunId: v.id('flowRuns'),
  },
  handler: async (ctx, args) => {
    const nodeRuns = await ctx.db
      .query('flowNodeRuns')
      .withIndex('by_run', (q: any) => q.eq('runId', args.flowRunId))
      .collect()
    const artifactRevisions = await ctx.db
      .query('flowArtifactRevisions')
      .withIndex('by_run', (q: any) => q.eq('runId', args.flowRunId))
      .collect()
    const applyLogs = await ctx.db
      .query('flowChangeSetApplyLogs')
      .withIndex('by_run', (q: any) => q.eq('runId', args.flowRunId))
      .collect()

    return {
      nodeRuns,
      artifactRevisions,
      applyLogs,
    }
  },
})
