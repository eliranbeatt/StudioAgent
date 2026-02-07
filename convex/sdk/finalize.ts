"use node"

import { action } from '../_generated/server'
import { v } from 'convex/values'
import { api, internal } from '../_generated/api'

function toAnswerText(qa: any): string {
  const text = String(qa?.answerText ?? qa?.answer_he ?? '').trim()
  if (text) return text
  if (typeof qa?.answer === 'string') return qa.answer.trim()
  if (typeof qa?.answer === 'number' || typeof qa?.answer === 'boolean') return String(qa.answer)
  if (Array.isArray(qa?.answer) && qa.answer.length > 0) return qa.answer.join(', ')
  return ''
}

export const buildStructuredPackage = action({
  args: {
    projectId: v.id('projects'),
    runId: v.optional(v.id('sdkRuns')),
    includeAssumptions: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const includeAssumptions = args.includeAssumptions !== false
    const context = await ctx.runQuery(api.sdk.api.contextGet, {
      projectId: args.projectId,
      packs: ['project', 'elements', 'tasks', 'accounting', 'quote', 'runbook', 'qa', 'knowledge'],
    })

    const qaPairs = Array.isArray((context as any)?.recentQA) ? (context as any).recentQA : []
    const answered = qaPairs
      .map((qa: any) => ({
        questionKey: qa?.questionKey ?? null,
        questionHe: qa?.questionHe ?? qa?.questionText ?? '',
        answerText: toAnswerText(qa),
      }))
      .filter((row: any) => row.answerText)

    const open = qaPairs.filter((qa: any) => !toAnswerText(qa))
    const assumptions = includeAssumptions
      ? open.map((qa: any) => `Assumption (${qa.questionKey ?? 'unknown'}): pending user confirmation`)
      : []

    const pkg = {
      generatedAt: Date.now(),
      project: (context as any)?.project ?? null,
      elements: Array.isArray((context as any)?.elements) ? (context as any).elements : [],
      tasks: Array.isArray((context as any)?.tasks) ? (context as any).tasks : [],
      accounting: {
        materialLines: Array.isArray((context as any)?.materialLines) ? (context as any).materialLines : [],
        workLines: Array.isArray((context as any)?.workLines) ? (context as any).workLines : [],
      },
      quote: (context as any)?.quote ?? null,
      runbooks: Array.isArray((context as any)?.runbooks) ? (context as any).runbooks : [],
      answers: answered,
      assumptions,
      unresolvedQuestionCount: open.length,
    }

    if (args.runId) {
      await ctx.runMutation(internal.sdk.telemetry.logEvent, {
        runId: args.runId,
        type: 'finalize_structured_package',
        payload: {
          unresolvedQuestionCount: open.length,
          elements: pkg.elements.length,
          tasks: pkg.tasks.length,
          materialLines: pkg.accounting.materialLines.length,
          workLines: pkg.accounting.workLines.length,
        },
      })
    }

    return pkg
  },
})

