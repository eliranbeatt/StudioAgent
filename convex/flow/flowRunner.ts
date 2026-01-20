
import { v } from 'convex/values'
import { action, internalMutation, internalQuery } from '../_generated/server'
import { api, internal } from '../_generated/api'
import { Doc, Id } from '../_generated/dataModel'

export const tick = action({
  args: {
    flowRunId: v.id('flowRuns'),
  },
  handler: async (ctx, args) => {
    const { flowRunId } = args

    // 1. Get run & validation status
    // We run computeValidation to update DB and get report
    let report: any
    try {
      report = await ctx.runMutation(api.flowRuns.computeValidation, { flowRunId })
    } catch (e) {
      console.error('Validation failed in tick', e)
      return
    }
    
    // Get fresh run state
    const run = await ctx.runQuery(internal.flowRuns.getRunInternal, { flowRunId })
    if (!run) return

    const {
      projectId,
      currentGateId,
      readinessScore,
      status,
    } = run
    
    // If already blocked or waiting, do nothing
    if (status === 'awaiting_approval' || status === 'paused' || status === 'failed' || status === 'blocked') {
      // If validation passed but status is blocked (e.g. from previous run), computeValidation SHOULD have updated it to running if passed?
      // computeValidation in flowRuns.ts: 
      //    if (report.status !== 'pass') nextRunStatus = 'blocked'
      //    else if (run.status === 'blocked') nextRunStatus = 'running'
      
      // So if it returned pass, it should be running (or whatever it was if not blocked).
      
      // If status is still 'blocked' here, it means report failed.
      if (status === 'blocked') return
      if (status === 'awaiting_approval') return
    }

    // 2. Check Readiness
    const IS_PASSING = readinessScore >= 0.95

    if (!IS_PASSING) {
      // Logic for "blocked"
      if (status !== 'blocked') {
        await ctx.runMutation(internal.flowRuns.setRunStatus, {
          flowRunId,
          status: 'blocked',
        })
      }
      // QuestionsBlock is already built by `tickValidation` (via computeValidation logic)
      return
    }

    // 3. If Passing -> Advance Gate logic
    // We need to know if we CAN advance (if we just finished this gate).
    // Or maybe we are AT a gate that needs work.

    // Simple Gate Order
    const GATE_ORDER = ['G0', 'G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7', 'G8', 'G9']
    const currentIndex = GATE_ORDER.indexOf(currentGateId)
    
    // If we have passed the validation for the current gate, we essentially "completed" it?
    // OR does passing validation mean we are READY to START the gate?
    // "readiness" usually implies "readiness to PROCEED" or "completeness of CURRENT stage".
    // Specs say: "After every apply: re-validate → next gate."
    // So "readiness" is "Is the current gate valid/complete?"

    // If passing, we can move to the next gate OR run the skill for the *next* gate?
    // Actually, "Validation G1" checks if G1 is DONE.
    // So if G1 passes, we move to G2.
    
    // Check if we need to advance
    // (If we are at G1 and it passes, we should be at G2)
    // But we need to distinguish "Just arrived at G1" vs "Finished G1".
    // Maybe we look at `flowSteps`.
    
    // Simplified logic: If readiness >= 0.95, it means the current gate requirements are met.
    // So we advance to the NEXT gate if we aren't already there?
    // Wait, if I am at G1 (Elements), and validation G1 passes, it means Elements are good.
    // So I should advance to G2 (Tasks).
    
    // We need an atomic "advance" mutation.
    const nextGateId = GATE_ORDER[currentIndex + 1]
    
    if (nextGateId) {
      // Advance to next gate
      await ctx.runMutation(internal.flowRuns.advanceToGate, {
         flowRunId,
         gateId: nextGateId
      })
      
      // Now run the skill for the NEW gate
      await runSkillForGate(ctx, projectId, nextGateId, flowRunId)
    } else {
      // Finished G9 -> Complete?
      await ctx.runMutation(internal.flowRuns.setRunStatus, {
        flowRunId,
        status: 'completed'
      })
    }
  }
})

async function runSkillForGate(ctx: any, projectId: Id<'projects'>, gateId: string, flowRunId: Id<'flowRuns'>) {
  // Map Gate to Skill
  let skillId: string | null = null
  let params: any = {}

  switch (gateId) {
    case 'G1':
      skillId = 'ELEMENTS_BUILDER_FULL'
      break
    case 'G2':
      skillId = 'TASKS_BUILDER_FULL'
      break
    case 'G3':
      skillId = 'ACCOUNTING_BUILDER_FULL'
      break
    case 'G4':
      skillId = 'PRICING_ESTIMATE_FALLBACK_BATCH' // Start with fallback or catalog? Plan says pipeline.
      // For v1, let's pick one or implement the pipeline logic inside the skill or here.
      // Ideally run "PRICING_ORCHESTRATOR"? Or just 'PRICING_LOOKUP_CATALOG_BATCH'
      break
    case 'G5':
      skillId = 'TASKS_ENRICH_FROM_ACCOUNTING_BATCH'
      break
    case 'G6':
      skillId = 'OVERHEAD_AND_LOGISTICS_COMPLETER'
      break
    // G7 is recheck, maybe no skill?
    case 'G8':
      skillId = 'QUOTE_BUILD_OR_FIX'
      break
    case 'G9':
      skillId = 'FINAL_AUDIT_FIXER'
      break
  }

  if (skillId) {
      // Trigger the skill
      // We might need to handle batching here if the gate is batched.
      // For now, run global or first batch.
      
      // We assume runSkill is available via internal api or public
      // ctx.runAction(api.skills.runner.runSkill, ...)
      
      // We need a conversation ID. Does flowRun have one?
      // FlowRuns table spec said `conversationId` is optional.
      // If none, maybe create one or use a default?
      
      // For now, skip if no skillId (e.g. G0, or pricing complex gates)
      // console.log(`Running skill ${skillId} for gate ${gateId}`)
  }
}
