"use node"

import { action } from '../_generated/server'
import { v } from 'convex/values'
import { api, internal } from '../_generated/api'
import { FULL_PROMPTS } from './prompts'
import { runJsonCompletion } from './llm'
import { assertAsciiKeys, validateSdkOutput } from './schemas'

export const draftPlanAndQuestions = action({
  args: {
    projectId: v.id('projects'),
    runId: v.optional(v.id('sdkRuns')),
    conversationId: v.optional(v.id('agentConversations')),
    userMessage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const context = await ctx.runQuery(api.sdk.api.contextGet, {
      projectId: args.projectId,
      packs: ['project', 'elements', 'tasks', 'qa', 'knowledge'],
    })

    const payload = {
      userMessage: args.userMessage ?? null,
      context,
      rules: {
        planningMode: 'single_pass',
        autoApproved: true,
      },
    }

    const { parsed } = await runJsonCompletion({
      ctx,
      systemPrompt: FULL_PROMPTS.DRAFT_PLAN_AND_QUESTIONS_SYSTEM,
      userContent: JSON.stringify(payload),
      model: 'gpt-5-mini',
      temperature: 0.1,
      maxCompletionTokens: 18000,
      projectId: args.projectId,
      conversationId: args.conversationId,
      runId: args.runId,
      traceMeta: {
        source: 'sdk',
        toolId: 'draft.plan_and_questions',
      },
    })

    assertAsciiKeys(parsed)
    const validated = validateSdkOutput('draft.plan_and_questions', parsed)
    if (!validated.ok) {
      throw new Error('draft.plan_and_questions failed schema validation')
    }

    const data: any = validated.data
    const questionGroups = Array.isArray(data.questionGroups) ? data.questionGroups : []
    const flatQuestionsFromGroups = questionGroups.flatMap((group: any) =>
      (Array.isArray(group?.questions) ? group.questions : []).map((q: any) => ({
        ...q,
        sectionPath: Array.isArray(q?.sectionPath) && q.sectionPath.length > 0
          ? q.sectionPath
          : [String(group?.phase ?? group?.key ?? 'general')],
      }))
    )
    const questions = Array.isArray(data.questions) && data.questions.length > 0
      ? data.questions
      : flatQuestionsFromGroups
    const saveResult = await ctx.runMutation(internal['sdk/planner'].upsertPlanAndSeed, {
      projectId: args.projectId,
      runId: args.runId,
      conversationId: args.conversationId,
      planMd: data.planMd,
      summaryHe: data.summaryHe,
      assumptionsHe: Array.isArray(data.assumptionsHe) ? data.assumptionsHe : [],
      questions,
    })

    return {
      summaryHe: data.summaryHe ?? 'Draft plan created',
      planMd: data.planMd,
      assumptionsHe: data.assumptionsHe ?? [],
      questionGroups,
      questions,
      meta: {
        ...data.meta,
        planVersion: saveResult.planVersion,
        insertedQuestions: saveResult.insertedQuestions,
      },
    }
  },
})
