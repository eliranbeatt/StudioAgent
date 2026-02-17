import { action, query, internalQuery, internalMutation } from '../_generated/server'
import { v } from 'convex/values'
import { api, internal } from '../_generated/api'

function normalizeAnswers(raw: Record<string, string>) {
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(raw ?? {})) {
    const cleanedKey = String(key ?? '').trim()
    const cleanedValue = String(value ?? '').trim()
    if (!cleanedKey || !cleanedValue) continue
    out[cleanedKey] = cleanedValue
  }
  return out
}

export const getCurrentQuestionSet = query({
  args: {
    flowRunId: v.id('flowRuns'),
  },
  handler: async (ctx, args) => {
    const questionSets = await ctx.db
      .query('flowQuestionSets')
      .withIndex('by_run', (q) => q.eq('runId', args.flowRunId))
      .order('desc')
      .take(50)

    const responses = await ctx.db
      .query('flowQuestionSetResponses')
      .withIndex('by_run', (q) => q.eq('runId', args.flowRunId))
      .collect()

    const responded = new Set(responses.map((r) => String(r.questionSetId)))

    // CRITICAL FIX: Find the NEWEST (first in desc order) unanswered question set
    // The old logic would find ANY unanswered one, causing old questions to reappear
    const current = questionSets.find((qs) => !responded.has(String(qs._id))) ?? null

    return {
      current,
      latest: questionSets[0] ?? null,
    }
  },
})

export const listQuestionHistory = query({
  args: {
    flowRunId: v.id('flowRuns'),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = typeof args.limit === 'number' ? Math.min(Math.max(args.limit, 1), 50) : 12
    const responses = await ctx.db
      .query('flowQuestionSetResponses')
      .withIndex('by_run_createdAt', (q) => q.eq('runId', args.flowRunId))
      .order('desc')
      .take(limit)

    const questionSetIds = responses.map((r) => r.questionSetId)
    const questionSets = await Promise.all(questionSetIds.map((id) => ctx.db.get(id)))

    return responses.map((response, idx) => ({
      response,
      questionSet: questionSets[idx],
    }))
  },
})

// Internal query to get a question set by ID
export const getQuestionSetInternal = internalQuery({
  args: {
    questionSetId: v.id('flowQuestionSets'),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.questionSetId)
  },
})

// Internal mutation to insert question set response
export const insertQuestionSetResponse = internalMutation({
  args: {
    runId: v.id('flowRuns'),
    questionSetId: v.id('flowQuestionSets'),
    intent: v.union(
      v.literal('answer'),
      v.literal('ask_more'),
      v.literal('skip'),
      v.literal('submit_more'),
      v.literal('submit_skip')
    ),
    status: v.union(v.literal('skipped'), v.literal('answered')),
    answersByKey: v.optional(v.record(v.string(), v.string())),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert('flowQuestionSetResponses', {
      runId: args.runId,
      questionSetId: args.questionSetId,
      intent: args.intent,
      status: args.status,
      answersByKey: args.answersByKey,
      createdAt: Date.now(),
    })
  },
})

export const submitQuestionSet = action({
  args: {
    flowRunId: v.id('flowRuns'),
    questionSetId: v.id('flowQuestionSets'),
    answersByKey: v.record(v.string(), v.string()),
    intent: v.union(
      v.literal('answer'),
      v.literal('ask_more'),
      v.literal('skip'),
      v.literal('submit_more'),
      v.literal('submit_skip')
    ),
    freeText: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const run = await ctx.runQuery(internal.flowRuns.getRunInternal, { flowRunId: args.flowRunId })
    if (!run) throw new Error('Flow run not found')

    const questionSet = await ctx.runQuery(internal.flow.questionsUi.getQuestionSetInternal, { questionSetId: args.questionSetId })
    if (!questionSet || questionSet.runId !== args.flowRunId) {
      throw new Error('Question set not found for run')
    }

    const answers = normalizeAnswers(args.answersByKey ?? {})
    if (args.freeText && args.freeText.trim()) {
      answers.__free_text = args.freeText.trim()
    }

    const isV3 = run.graphVersion?.startsWith('v3') || !!run.v3StageKey

    const hasAnswers = Object.keys(answers).length > 0

    if (hasAnswers) {
      const questions = Array.isArray(questionSet?.questions) ? questionSet.questions : []
      for (let i = 0; i < questions.length; i += 1) {
        const question = questions[i] ?? {}
        const questionKey = String(question?.fieldKey ?? question?.questionId ?? `q${i}`)
        const answer = answers[questionKey]
        if (!answer || !String(answer).trim()) continue

        const questionText =
          question.prompt ??
          question.textHe ??
          question.text_he ??
          question.text ??
          question.questionHe ??
          question.question_he ??
          question.question ??
          question.labelHe ??
          question.label ??
          question.label_he

        if (!questionText || !String(questionText).trim()) continue

        await ctx.runMutation(api.memory.upsertQAPairs, {
          projectId: run.projectId,
          question_he: String(questionText),
          answer_he: String(answer),
          sourceType: 'CLARIFICATION_BLOCK',
          conversationId: String(args.flowRunId),
        })
      }
    }

    if (hasAnswers && !isV3) {
      await ctx.runMutation(api.flowAnswers.submitAnswers, {
        flowRunId: args.flowRunId,
        answersByKey: answers,
      })
    }

    const status = hasAnswers ? 'answered' : 'skipped'
    await ctx.runMutation(internal.flow.questionsUi.insertQuestionSetResponse, {
      runId: args.flowRunId,
      questionSetId: args.questionSetId,
      intent: args.intent,
      status,
      answersByKey: hasAnswers ? answers : undefined,
    })

    if (isV3) {
      const normalizedAction =
        args.intent === 'submit_more' || args.intent === 'ask_more'
          ? 'submit_more'
          : 'submit_skip'
      await ctx.runAction(internal.flow.flowRunnerV3.submitV3Answers, {
        flowRunId: args.flowRunId,
        answersByKey: answers,
        action: normalizedAction,
        questionKeys: Array.isArray(questionSet?.questions)
          ? questionSet.questions.map((q: any) => String(q?.fieldKey ?? q?.questionId ?? '')).filter(Boolean)
          : [],
        freeText: args.freeText,
      })
    } else {
      await ctx.runMutation(internal.flow.questionSets.generateAndEmit, {
        flowRunId: args.flowRunId,
        reason: 'ui',
        force: args.intent === 'ask_more',
      })
    }

    return { ok: true }
  },
})
