"use node"

import { internal } from '../../_generated/api'
import { runToolInternal } from '../runner'
import { VNextStageKey } from './contracts'
import { VNEXT_STAGE_SKILLS } from './stages'

export async function runStageSkills(args: {
  ctx: any
  projectId: any
  conversationId: any
  runId: any
  stageKey: VNextStageKey
  input: any
  stageBudgetsEnabled?: boolean
}) {
  const toolIds = VNEXT_STAGE_SKILLS[args.stageKey] ?? []
  const outputs: Record<string, any> = {}
  const pricingBatch = Array.isArray(args.input?.pricingBatch) ? args.input.pricingBatch : null
  if (args.stageKey === 'pricing' && pricingBatch && pricingBatch.length === 0) {
    return outputs
  }
  const stageStart = Date.now()
  const stageBudgetsEnabled = args.stageBudgetsEnabled !== false
  const defaultBudgetMs = args.stageKey === 'pricing' ? 180000 : 90000
  const stageBudgetMs = Number(process.env.SDK_STAGE_BUDGET_MS ?? defaultBudgetMs)
  const toolBudgetMs = Number(process.env.SDK_TOOL_BUDGET_MS ?? 60000)

  // Phase A: execute at most one call per skill and keep deterministic merge outside.
  for (const toolId of toolIds) {
    if (args.stageKey === 'compile') continue
    const elapsedStageMs = Date.now() - stageStart
    if (stageBudgetsEnabled && elapsedStageMs > stageBudgetMs) {
      await args.ctx.runMutation((internal as any).sdk.telemetry.logEvent, {
        runId: args.runId,
        type: 'vnext_stage_budget_checkpoint',
        payload: {
          stageKey: args.stageKey,
          elapsedMs: elapsedStageMs,
          stageBudgetMs,
          executedTools: Object.keys(outputs),
        },
      })
      break
    }
    const toolStart = Date.now()
    const result = await runToolInternal({
      ctx: args.ctx,
      projectId: args.projectId,
      toolId,
      input: args.input,
      runId: args.runId,
      conversationId: args.conversationId,
    })
    const toolElapsedMs = Date.now() - toolStart
    if (stageBudgetsEnabled && toolElapsedMs > toolBudgetMs) {
      await args.ctx.runMutation((internal as any).sdk.telemetry.logEvent, {
        runId: args.runId,
        type: 'vnext_tool_budget_warn',
        payload: {
          stageKey: args.stageKey,
          toolId,
          elapsedMs: toolElapsedMs,
          toolBudgetMs,
        },
      })
    }
    outputs[toolId] = result
  }

  return outputs
}
