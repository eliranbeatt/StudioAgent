export type QaResolvedStatus = 'answered' | 'assumed' | 'resolved' | 'skipped' | 'dismissed'

export function isResolvedQaStatus(status: unknown): status is QaResolvedStatus {
  return (
    status === 'answered' ||
    status === 'assumed' ||
    status === 'resolved' ||
    status === 'skipped' ||
    status === 'dismissed'
  )
}

export function canApplyPlanDocCas(expectedPlanVersion: number, currentPlanVersion: number) {
  return expectedPlanVersion === currentPlanVersion
}

export function shouldAllowStatusTransition(currentStatus: unknown, nextStatus: unknown) {
  if (isResolvedQaStatus(currentStatus)) {
    return nextStatus === currentStatus
  }
  return true
}

export function shouldInsertQuestionFromDedupe(args: {
  hasOpenWithSameDedupe: boolean
  hasResolvedWithSameDedupe: boolean
  followUp: boolean
  whyNow: string
}) {
  if (args.hasOpenWithSameDedupe) return false
  if (!args.hasResolvedWithSameDedupe) return true
  return args.followUp && args.whyNow.trim().length > 0
}

export function applyRegenCaps<T extends { blockingLevel?: string }>(
  items: T[],
  maxAddsPerRegen: number,
  maxNewBlockersPerRegen: number
) {
  const kept: T[] = []
  let blockers = 0
  let truncated = 0
  for (const item of items) {
    if (kept.length >= maxAddsPerRegen) {
      truncated += 1
      continue
    }
    const isBlocker = item.blockingLevel === 'blocker'
    if (isBlocker && blockers >= maxNewBlockersPerRegen) {
      truncated += 1
      continue
    }
    if (isBlocker) blockers += 1
    kept.push(item)
  }
  return {
    kept,
    truncated,
    blockersKept: blockers,
  }
}

export function shouldPreemptWithProjectBlockers(args: {
  hasProjectBlockers: boolean
  cursorOrderKey?: string | null
  candidateOrderKey?: string | null
}) {
  if (args.hasProjectBlockers) return true
  const cursor = String(args.cursorOrderKey ?? '')
  const candidate = String(args.candidateOrderKey ?? '')
  if (!cursor) return true
  if (!candidate) return false
  return candidate.localeCompare(cursor) > 0
}

