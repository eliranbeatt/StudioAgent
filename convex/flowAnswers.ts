import { mutation, action } from './_generated/server'
import { v } from 'convex/values'
import { DEFAULT_FLAGS, isEnabled, normalizeFlags } from './featureFlags'
import { api, internal } from './_generated/api'

const SETTINGS_KEY = 'featureFlags'

async function loadFlags(ctx: any): Promise<Record<string, boolean>> {
  if (ctx.db) {
    const existing = await ctx.db
      .query('appSettings')
      .withIndex('by_key', (q: any) => q.eq('key', SETTINGS_KEY))
      .first()

    const stored = normalizeFlags(existing?.value)
    return { ...DEFAULT_FLAGS, ...stored }
  } else {
    return await ctx.runQuery(api.featureFlags.getAll)
  }
}

async function assertBackendEnabled(ctx: any) {
  const flags = await loadFlags(ctx)
  if (!isEnabled(flags, 'ff_flow_agent_backend', false)) {
    throw new Error('Flow Agent is disabled (ff_flow_agent_backend)')
  }
}

function stableUnique(items: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const item of items) {
    const key = String(item || '').trim()
    if (!key) continue
    if (seen.has(key)) continue
    seen.add(key)
    out.push(key)
  }
  return out
}

export const submitAnswers = mutation({
  args: {
    flowRunId: v.id('flowRuns'),
    answersByKey: v.record(v.string(), v.string()),
  },
  handler: async (ctx, args) => {
    await assertBackendEnabled(ctx)

    const run = await ctx.db.get(args.flowRunId)
    if (!run) throw new Error('Flow run not found')

    const projectId = run.projectId
    const now = Date.now()

    for (const [questionKey, rawAnswer] of Object.entries(args.answersByKey)) {
      const key = String(questionKey || '').trim()
      const ans = String(rawAnswer || '').trim()
      if (!key) continue
      if (!ans) continue

      const existing = await ctx.db
        .query('qaPairs')
        .withIndex('by_project_questionKey', (q: any) => q.eq('projectId', projectId).eq('questionKey', key))
        .first()

      const source = {
        sourceType: 'CLARIFICATION_BLOCK' as const,
        conversationId: String(args.flowRunId),
        messageId: undefined,
      }

      if (existing) {
        await ctx.db.patch(existing._id, {
          answer_he: ans,
          source,
        })
      } else {
        await ctx.db.insert('qaPairs', {
          projectId,
          question_he: key,
          questionKey: key,
          answer_he: ans,
          source,
          createdAt: now,
        })
      }
    }
  },
})

export const submitAnswersAndAdvance = action({
  args: {
    flowRunId: v.id('flowRuns'),
    answersByKey: v.record(v.string(), v.string()),
  },
  handler: async (ctx, args) => {
    await assertBackendEnabled(ctx)

    await ctx.runMutation(api.flowAnswers.submitAnswers, {
      flowRunId: args.flowRunId,
      answersByKey: args.answersByKey,
    })

    await ctx.runAction(internal.flow.flowRunner.tick, { flowRunId: args.flowRunId })
    return { ok: true }
  },
})

export const acceptUnknown = mutation({
  args: {
    flowRunId: v.id('flowRuns'),
    issueKey: v.string(),
  },
  handler: async (ctx, args) => {
    await assertBackendEnabled(ctx)

    const run = await ctx.db.get(args.flowRunId)
    if (!run) throw new Error('Flow run not found')

    const project = await ctx.db.get(run.projectId)
    if (!project) throw new Error('Project not found')

    const key = args.issueKey.trim()
    if (!key) return

    const current = Array.isArray(project.unknownAcceptedKeys) ? project.unknownAcceptedKeys : []
    const next = stableUnique([...current, key]).sort((a, b) => a.localeCompare(b))

    await ctx.db.patch(project._id, {
      unknownAcceptedKeys: next,
      updatedAt: Date.now(),
    })
  },
})

export const acceptAssumption = mutation({
  args: {
    flowRunId: v.id('flowRuns'),
    key: v.string(),
    valueHe: v.string(),
  },
  handler: async (ctx, args) => {
    await assertBackendEnabled(ctx)

    const run = await ctx.db.get(args.flowRunId)
    if (!run) throw new Error('Flow run not found')

    const project = await ctx.db.get(run.projectId)
    if (!project) throw new Error('Project not found')

    const key = args.key.trim()
    const valueHe = args.valueHe.trim()
    if (!key || !valueHe) return

    const now = Date.now()
    const current = Array.isArray(project.assumptionsAccepted) ? project.assumptionsAccepted : []
    const next = [...current, { key, valueHe, acceptedAt: now }]

    await ctx.db.patch(project._id, {
      assumptionsAccepted: next,
      updatedAt: now,
    })
  },
})

export const dismissOpportunity = mutation({
  args: {
    flowRunId: v.id('flowRuns'),
    opportunityKey: v.string(),
  },
  handler: async (ctx, args) => {
    await assertBackendEnabled(ctx)

    const run = await ctx.db.get(args.flowRunId)
    if (!run) throw new Error('Flow run not found')

    const project = await ctx.db.get(run.projectId)
    if (!project) throw new Error('Project not found')

    const key = args.opportunityKey.trim()
    if (!key) return

    const current = Array.isArray(project.dismissedOppKeys) ? project.dismissedOppKeys : []
    const next = stableUnique([...current, key]).sort((a, b) => a.localeCompare(b))

    await ctx.db.patch(project._id, {
      dismissedOppKeys: next,
      updatedAt: Date.now(),
    })
  },
})

function resolveOpportunitySkill(opportunityKey: string): string | null {
  const key = opportunityKey.toLowerCase()
  if (key.startsWith('ops.')) return 'OVERHEAD_AND_LOGISTICS_COMPLETER'
  if (key.startsWith('pricing.')) return 'PRICING_ESTIMATE_FALLBACK_BATCH'
  if (key.startsWith('tasks.')) return 'TASKS_ENRICH_FROM_ACCOUNTING_BATCH'
  if (key.startsWith('quote.')) return 'QUOTE_BUILD_OR_FIX'
  return null
}

export const adoptOpportunity = action({
  args: {
    flowRunId: v.id('flowRuns'),
    opportunityKey: v.string(),
  },
  handler: async (ctx, args) => {
    const flags = await ctx.runQuery(api.featureFlags.getAll, {})
    if (!isEnabled(flags, 'ff_flow_agent_backend', false)) {
      throw new Error('Flow Agent is disabled (ff_flow_agent_backend)')
    }

    const run = await ctx.runQuery(internal.flowRuns.getRunInternal, { flowRunId: args.flowRunId })
    if (!run) throw new Error('Flow run not found')

    const skillId = resolveOpportunitySkill(args.opportunityKey.trim())
    if (!skillId) return { changeSetId: null }

    const conversationId = await ctx.runMutation(internal.flowRuns.ensureConversation, {
      flowRunId: args.flowRunId,
    })

    const blocks = await ctx.runAction(api.skills.runner.runSkill, {
      projectId: run.projectId,
      conversationId,
      skillId,
      params: {
        source: 'flow_opportunity',
        opportunityKey: args.opportunityKey,
        toggles: { useWebSearch: false },
      },
    })

    const changeSetId = Array.isArray(blocks)
      ? (blocks.find((b: any) => b?.changeSetId)?.changeSetId ?? null)
      : null

    return { changeSetId }
  },
})
