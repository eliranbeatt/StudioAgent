import { action } from './_generated/server'
import { v } from 'convex/values'
import { api, internal } from './_generated/api'

const QUEUED_INPUT_OPEN = '[SDK_QUEUED_INPUT_V1]'
const QUEUED_INPUT_CLOSE = '[/SDK_QUEUED_INPUT_V1]'

function uniqueStrings(values: string[], max: number) {
  const out: string[] = []
  for (const raw of values) {
    const value = String(raw ?? '').trim()
    if (!value || out.includes(value)) continue
    out.push(value)
    if (out.length >= max) break
  }
  return out
}

function buildQueuedInput(args: {
  suggestionIds: string[]
  yesNo: 'yes' | 'no' | null
  multiChoiceIds: string[]
  timestampMs: number
}) {
  const suggestionIds = uniqueStrings(args.suggestionIds, 4)
  const multiChoiceIds = uniqueStrings(args.multiChoiceIds, 6)
  const yesNo = args.yesNo === 'yes' ? true : args.yesNo === 'no' ? false : null

  const changeSetSuggestion = suggestionIds.find((item) => item.toLowerCase().includes('changeset')) ?? null
  const first = suggestionIds[0] ?? null
  const second = suggestionIds[1] ?? null

  return {
    suggestionDecision: suggestionIds.length > 0 ? ('accepted' as const) : null,
    answers: {
      yesNo,
      choice: multiChoiceIds[0] ?? null,
      clarify: multiChoiceIds.length > 0 ? multiChoiceIds.join(', ') : null,
    },
    suggestions: {
      actionPrimary: first,
      actionSecondary: second,
      changeSetAction: changeSetSuggestion,
    },
    sentAt: args.timestampMs,
  }
}

export const submitTurn = action({
  args: {
    projectId: v.id('projects'),
    conversationId: v.id('agentConversations'),
    runId: v.id('sdkRuns'),
    stageId: v.string(),
    messageText: v.string(),
    uiSelections: v.object({
      suggestionIds: v.array(v.string()),
      answers: v.object({
        yesNo: v.union(v.literal('yes'), v.literal('no'), v.null()),
        multiChoiceIds: v.array(v.string()),
      }),
    }),
    clientMeta: v.object({
      uiVersion: v.literal('blocks_v2'),
      locale: v.string(),
      timestampMs: v.number(),
    }),
  },
  handler: async (ctx, args) => {
    const run = await ctx.runQuery(internal.sdk.queries.getRun, { runId: args.runId })
    if (!run) throw new Error('Run not found')
    if (run.projectId !== args.projectId) throw new Error('Run does not belong to project')
    if (run.conversationId !== args.conversationId) throw new Error('Run does not belong to conversation')

    const suggestionIds = uniqueStrings(args.uiSelections.suggestionIds, 4)
    const multiChoiceIds = uniqueStrings(args.uiSelections.answers.multiChoiceIds, 6)
    const hasSelections = suggestionIds.length > 0 || args.uiSelections.answers.yesNo !== null || multiChoiceIds.length > 0
    const trimmedMessage = String(args.messageText ?? '').trim()
    if (!trimmedMessage && !hasSelections) {
      throw new Error('Turn is empty')
    }

    let userMessage = trimmedMessage || 'apply queued updates'
    if (hasSelections) {
      const queuedInput = buildQueuedInput({
        suggestionIds,
        yesNo: args.uiSelections.answers.yesNo,
        multiChoiceIds,
        timestampMs: args.clientMeta.timestampMs,
      })
      userMessage = `${userMessage}\n\n${QUEUED_INPUT_OPEN}${JSON.stringify(queuedInput)}${QUEUED_INPUT_CLOSE}`
    }

    await ctx.runMutation(internal.sdk.telemetry.logEvent, {
      runId: args.runId,
      type: 'blocks_v2_turn_submitted',
      payload: {
        stageId: args.stageId,
        messageLength: trimmedMessage.length,
        suggestionIds,
        suggestionCount: suggestionIds.length,
        yesNoAnswered: args.uiSelections.answers.yesNo !== null,
        multiChoiceCount: multiChoiceIds.length,
        uiVersion: args.clientMeta.uiVersion,
        locale: args.clientMeta.locale,
        clientTimestampMs: args.clientMeta.timestampMs,
      },
    })

    await ctx.runAction(api.sdk.dispatch.runNext, {
      projectId: args.projectId,
      conversationId: args.conversationId,
      runId: args.runId,
      userMessage,
    })

    return {
      runId: args.runId,
      acceptedAt: Date.now(),
    }
  },
})
