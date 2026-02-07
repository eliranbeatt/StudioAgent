"use node"

import { action } from '../_generated/server'
import { v } from 'convex/values'
import { internal } from '../_generated/api'
import { FULL_PROMPTS } from './prompts'
import { runJsonCompletion } from './llm'
import { assertAsciiKeys, validateSdkOutput } from './schemas'

export const regenerateQuestionsManual = action({
  args: {
    projectId: v.id('projects'),
    runId: v.id('sdkRuns'),
    conversationId: v.optional(v.id('agentConversations')),
  },
  handler: async (ctx, args) => {
    const startedAt = Date.now()
    const lockResult = await ctx.runMutation(internal['sdk/rebase'].acquireManualRegenLock, {
      runId: args.runId,
    })
    if (!lockResult?.ok) {
      throw new Error(lockResult?.reason ?? 'Failed to start regeneration')
    }
    if (lockResult.alreadyRunning) {
      return {
        ok: true,
        status: 'already_running' as const,
        regenRunId: lockResult.regenRunId ?? null,
      }
    }

    const regenRunId = String(lockResult.regenRunId)

    try {
      const inputData = await ctx.runQuery(internal['sdk/rebase'].getManualRegenInputs, {
        projectId: args.projectId,
        runId: args.runId,
      })
      if (!inputData || !inputData.planDoc?.id) {
        throw new Error('PlanDoc not found for project')
      }

      const modelPayload = {
        planDocMarkdown: inputData.planDoc.markdown,
        elementIndex: inputData.elementIndex,
        qapairs: inputData.qaPairs,
        rules: {
          dontReopenResolved: true,
          newBlockersAllowed: true,
          followUpsAllowed: true,
          maxAddsPerRegen: 40,
          maxNewBlockersPerRegen: 10,
          keepCursor: true,
          projectBlockersPreempt: true,
        },
      }

      const { parsed } = await runJsonCompletion({
        ctx,
        systemPrompt: FULL_PROMPTS.REGENERATE_QUESTIONS_MANUAL_SYSTEM,
        userContent: JSON.stringify(modelPayload),
        model: 'gpt-5-mini',
        temperature: 0.1,
        maxCompletionTokens: 10000,
        projectId: args.projectId,
        conversationId: args.conversationId,
        runId: args.runId,
        traceMeta: {
          source: 'sdk',
          toolId: 'rebase.regenerate_questions_manual',
          regenRunId,
        },
      })
      assertAsciiKeys(parsed)

      const validated = validateSdkOutput('rebase.regenerate_questions_manual', parsed)
      if (!validated.ok) {
        throw new Error('Manual regeneration response failed schema validation')
      }
      const data: any = validated.data

      await ctx.runMutation(internal.sdk.telemetry.logEvent, {
        runId: args.runId,
        type: 'sdk_regen_model_result',
        payload: {
          regenRunId,
          summary: data.summary ?? null,
        },
      })

      const applyResult = await ctx.runMutation(internal['sdk/rebase'].applyRegenerationPatch, {
        projectId: args.projectId,
        runId: args.runId,
        regenRunId,
        expectedPlanVersion: Number(inputData.planDoc.version ?? 0),
        newPlanDocMarkdown: String(data.newPlanDocMarkdown ?? ''),
        questionOps: {
          add: Array.isArray(data.questionOps?.add) ? data.questionOps.add : [],
          dismiss: Array.isArray(data.questionOps?.dismiss) ? data.questionOps.dismiss : [],
          promote: Array.isArray(data.questionOps?.promote) ? data.questionOps.promote : [],
          dedupe: Array.isArray(data.questionOps?.dedupe) ? data.questionOps.dedupe : [],
        },
      })

      if (!applyResult?.ok) {
        throw new Error(String(applyResult?.reason ?? 'Failed to apply regeneration patch'))
      }

      const durationMs = Date.now() - startedAt
      await ctx.runMutation(internal.sdk.telemetry.logEvent, {
        runId: args.runId,
        type: 'sdk_regen_metrics',
        payload: {
          regenRunId,
          durationMs,
          summary: applyResult.summary,
        },
      })

      return {
        ok: true,
        status: 'ok' as const,
        regenRunId,
        durationMs,
        summary: applyResult.summary,
      }
    } catch (error: any) {
      const errorMessage = error?.message ?? String(error)
      await ctx.runMutation(internal['sdk/rebase'].failManualRegen, {
        runId: args.runId,
        regenRunId,
        errorMessage,
      })
      return {
        ok: false,
        status: 'failed' as const,
        regenRunId,
        error: errorMessage,
      }
    }
  },
})

