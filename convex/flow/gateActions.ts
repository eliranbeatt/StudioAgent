import { action, internalMutation } from '../_generated/server'
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
    freeText: v.optional(v.string()),
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

    if (args.freeText && args.freeText.trim()) {
      await ctx.runMutation(internal.memory.appendUserInput, {
        projectId: run.projectId,
        text: `Gate ${run.currentGateId}: ${args.freeText.trim()}`,
      })
    }

    if (run.currentGateId === 'G0C' && args.intent !== 'ask_more') {
      await ctx.runMutation(internal.flow.gateActions.satisfyClarifications, {
        flowRunId: args.flowRunId,
        conversationId,
        answersByKey: args.answersByKey,
        questionKeys: args.questionKeys ?? [],
        freeText: args.freeText,
      })
    }

    if (args.intent === 'skip') {
      const step = await ctx.runQuery(internal.flowRuns.getStepInternal, {
        flowRunId: args.flowRunId,
        gateId: run.currentGateId,
      })
      const blockingKeys = Array.isArray(step?.validationReport?.blockingIssues)
        ? step.validationReport.blockingIssues.map((i: any) => i?.key).filter(Boolean)
        : []
      const fallbackKeys = Array.isArray(args.questionKeys) ? args.questionKeys : []
      const keysToAccept = (blockingKeys.length > 0 ? blockingKeys : fallbackKeys)
        .map((k: any) => String(k ?? '').trim())
        .filter((k: string) => k.length > 0)
      const unique = Array.from(new Set(keysToAccept))
      for (const key of unique) {
        const cleaned = String(key ?? '').trim()
        if (!cleaned) continue
        await ctx.runMutation(api.flowAnswers.acceptUnknown, {
          flowRunId: args.flowRunId,
          issueKey: cleaned,
        })
      }
    }

    if (args.intent === 'ask_more') {
      await ctx.runMutation(internal.flowRuns.setForceQuestionGate, {
        flowRunId: args.flowRunId,
        gateId: run.currentGateId,
      })
    } else {
      await ctx.runMutation(internal.flowRuns.setForceQuestionGate, {
        flowRunId: args.flowRunId,
        gateId: undefined,
      })
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

    if (args.intent === 'ask_more') {
      await ctx.runMutation(internal.flowRuns.setStepLastEmittedHash, {
        flowRunId: args.flowRunId,
        gateId: run.currentGateId,
        lastEmittedHash: '',
      })
    }

    await ctx.runAction(internal.flow.flowRunner.tick, { flowRunId: args.flowRunId })
  },
})

export const satisfyClarifications = internalMutation({
  args: {
    flowRunId: v.id('flowRuns'),
    conversationId: v.id('agentConversations'),
    answersByKey: v.record(v.string(), v.string()),
    questionKeys: v.array(v.string()),
    freeText: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.flowRunId)
    if (!run) return

    const now = Date.now()
    const targetSkillId = 'ELEMENTS_BUILDER_FULL'
    const existing = await ctx.db
      .query('clarificationSessions')
      .withIndex('by_project_target', (q) =>
        q.eq('projectId', run.projectId).eq('targetSkillId', targetSkillId)
      )
      .order('desc')
      .first()

    const answers: Record<string, string> = {}
    for (const [key, value] of Object.entries(args.answersByKey ?? {})) {
      const cleanedKey = String(key ?? '').trim()
      const cleanedValue = String(value ?? '').trim()
      if (!cleanedKey || !cleanedValue) continue
      answers[cleanedKey] = cleanedValue
    }
    if (args.freeText && args.freeText.trim()) {
      answers.__free_text = args.freeText.trim()
    }

    const questions = (args.questionKeys ?? [])
      .map((key) => String(key ?? '').trim())
      .filter((key) => key.length > 0)
      .map((id) => ({ id }))

    if (existing) {
      await ctx.db.patch(existing._id, {
        answers: { ...(existing.answers ?? {}), ...answers },
        isSatisfied: true,
        updatedAt: now,
      })
    } else {
      await ctx.db.insert('clarificationSessions', {
        projectId: run.projectId,
        conversationId: args.conversationId,
        targetSkillId,
        questions,
        answers,
        isSatisfied: true,
        createdAt: now,
        updatedAt: now,
      })
    }
  },
})
