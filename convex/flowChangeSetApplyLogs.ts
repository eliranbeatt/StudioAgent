import { query } from './_generated/server'
import { v } from 'convex/values'
import { DEFAULT_FLAGS, isEnabled, normalizeFlags } from './featureFlags'

const SETTINGS_KEY = 'featureFlags'

async function assertBackendEnabled(ctx: any) {
  const existing = await ctx.db
    .query('appSettings')
    .withIndex('by_key', (q: any) => q.eq('key', SETTINGS_KEY))
    .first()

  const flags = { ...DEFAULT_FLAGS, ...normalizeFlags(existing?.value) }
  if (!isEnabled(flags, 'ff_flow_agent_backend', false)) {
    throw new Error('Flow Agent is disabled (ff_flow_agent_backend)')
  }
}

export const listByRun = query({
  args: {
    flowRunId: v.id('flowRuns'),
  },
  handler: async (ctx, args) => {
    await assertBackendEnabled(ctx)
    return await ctx.db
      .query('flowChangeSetApplyLogs')
      .withIndex('by_run', (q) => q.eq('runId', args.flowRunId))
      .order('desc')
      .collect()
  },
})
