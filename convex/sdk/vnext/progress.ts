import type { VNextStageProgressMeta } from './contracts'

export const MAX_NO_PROGRESS_CYCLES = 3

export function computeStageProgress(args: {
  stageKey: string
  specHash: string
  artifactHash: string
  runStageKey?: string
  runProgressCount?: number
  runNoProgressCount?: number
  runProgressKey?: string
  fallbackProgressKey?: string
  lastProgressAt?: number
  now?: number
}): { madeProgress: boolean; progressMeta: VNextStageProgressMeta } {
  const progressKey = `${args.stageKey}:${args.specHash}:${args.artifactHash}`
  const runOnSameStage = String(args.runStageKey ?? '') === args.stageKey
  const baselineProgressCount = runOnSameStage ? Number(args.runProgressCount ?? 0) : 0
  const baselineNoProgressCount = runOnSameStage ? Number(args.runNoProgressCount ?? 0) : 0
  const previousProgressKey = runOnSameStage
    ? String(args.runProgressKey ?? args.fallbackProgressKey ?? '')
    : ''
  const madeProgress = previousProgressKey !== progressKey
  const now = Number(args.now ?? Date.now())

  const progressMeta: VNextStageProgressMeta = madeProgress
    ? {
      progressKey,
      progressCount: baselineProgressCount + 1,
      noProgressCount: 0,
      lastProgressAt: now,
    }
    : {
      progressKey,
      progressCount: baselineProgressCount,
      noProgressCount: baselineNoProgressCount + 1,
      lastProgressAt: args.lastProgressAt,
    }

  return { madeProgress, progressMeta }
}

export function shouldTriggerNoProgressGuard(args: {
  madeProgress: boolean
  noProgressCount: number
  threshold?: number
}) {
  const threshold = Number(args.threshold ?? MAX_NO_PROGRESS_CYCLES)
  return !args.madeProgress && args.noProgressCount >= threshold
}
