"use node"

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
}) {
  const toolIds = VNEXT_STAGE_SKILLS[args.stageKey] ?? []
  const outputs: Record<string, any> = {}

  // Phase A: execute at most one call per skill and keep deterministic merge outside.
  for (const toolId of toolIds) {
    if (args.stageKey === 'compile') continue
    const result = await runToolInternal({
      ctx: args.ctx,
      projectId: args.projectId,
      toolId,
      input: args.input,
      runId: args.runId,
      conversationId: args.conversationId,
    })
    outputs[toolId] = result
  }

  return outputs
}

