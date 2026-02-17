"use node"

import { action } from '../_generated/server'
import { v } from 'convex/values'
import { api, internal } from '../_generated/api'
import { FULL_PROMPTS } from './prompts'
import { runJsonCompletion } from './llm'
import { assertAsciiKeys, validateSdkOutput } from './schemas'

function normalizeQuestionType(value: unknown): 'text' | 'number' | 'date' | 'single' | 'multi' | 'toggle' {
  const key = String(value ?? '').trim().toLowerCase()
  if (key === 'number') return 'number'
  if (key === 'date') return 'date'
  if (key === 'single' || key === 'choice' || key === 'select' || key === 'single_select') return 'single'
  if (key === 'multi' || key === 'multiple' || key === 'multi_select' || key === 'checkbox') return 'multi'
  if (key === 'toggle' || key === 'boolean' || key === 'bool' || key === 'yesno') return 'toggle'
  return 'text'
}

function normalizeOptions(value: unknown): Array<{ value: string; labelHe: string }> | undefined {
  if (!Array.isArray(value)) return undefined
  const out = value
    .map((item) => {
      if (typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean') {
        const text = String(item).trim()
        if (!text) return null
        return { value: text, labelHe: text }
      }
      if (!item || typeof item !== 'object') return null
      const source = item as Record<string, unknown>
      const normalizedValue = String(source.value ?? source.labelHe ?? '').trim()
      if (!normalizedValue) return null
      const normalizedLabel = String(source.labelHe ?? source.value ?? '').trim() || normalizedValue
      return { value: normalizedValue, labelHe: normalizedLabel }
    })
    .filter(Boolean) as Array<{ value: string; labelHe: string }>
  return out.length > 0 ? out : undefined
}

function normalizeQuestionRecord(raw: any, defaultSectionPath: string[]): any {
  const questionHe = String(raw?.questionHe ?? raw?.textHe ?? raw?.questionText ?? '').trim()
  const sectionPath = Array.isArray(raw?.sectionPath) && raw.sectionPath.length > 0
    ? raw.sectionPath
    : defaultSectionPath
  return {
    ...raw,
    questionHe,
    questionType: normalizeQuestionType(raw?.questionType ?? raw?.type),
    options: normalizeOptions(raw?.options),
    sectionPath,
  }
}

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
      console.error('[plannerNode] draft.plan_and_questions schema validation failed. Raw output keys:', parsed && typeof parsed === 'object' ? Object.keys(parsed) : typeof parsed)
      const details = Array.isArray((validated as any).errors)
        ? (validated as any).errors
          .slice(0, 6)
          .map((err: any) => {
            const path = Array.isArray(err?.path) ? err.path.join('.') : 'root'
            return `${path}: ${String(err?.message ?? 'invalid')}`
          })
          .join(' | ')
        : `schema_error: ${JSON.stringify((validated as any).errors ?? 'no details').substring(0, 500)}`
      throw new Error(`draft.plan_and_questions failed schema validation: ${details}`)
    }

    const data: any = validated.data
    const planMd = String(data.planMd ?? data.planText ?? '').trim()
    const questionGroups = Array.isArray(data.questionGroups) ? data.questionGroups : []
    const flatQuestionsFromGroups = questionGroups.flatMap((group: any) =>
      (Array.isArray(group?.questions) ? group.questions : [])
        .map((q: any) => normalizeQuestionRecord(q, [String(group?.phase ?? group?.key ?? 'general')]))
        .filter((q: any) => typeof q?.questionHe === 'string' && q.questionHe.trim().length > 0)
    )
    const questions = Array.isArray(data.questions) && data.questions.length > 0
      ? data.questions
        .map((q: any) => normalizeQuestionRecord(q, ['general']))
        .filter((q: any) => typeof q?.questionHe === 'string' && q.questionHe.trim().length > 0)
      : flatQuestionsFromGroups
    const saveResult = await ctx.runMutation(internal['sdk/planner'].upsertPlanAndSeed, {
      projectId: args.projectId,
      runId: args.runId,
      conversationId: args.conversationId,
      planMd,
      summaryHe: data.summaryHe,
      assumptionsHe: Array.isArray(data.assumptionsHe) ? data.assumptionsHe : [],
      questions,
    })

    return {
      summaryHe: data.summaryHe ?? 'Draft plan created',
      planMd,
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
