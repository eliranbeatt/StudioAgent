import type { GateIssue, GateResult } from '../contracts'

export function validatePricing(args: { pricingArtifact?: any; budgetArtifact?: any }): GateResult {
  const issues: GateIssue[] = []
  const queue = Array.isArray(args.pricingArtifact?.workQueue) ? args.pricingArtifact.workQueue : []
  const pendingQueue = queue.filter((item: any) => item?.status === 'pending')
  const failedQueue = queue.filter((item: any) => item?.status === 'failed')
  const estimatedQueue = queue.filter((item: any) => item?.status === 'estimated')

  if (queue.length > 0 && pendingQueue.length > 0) {
    issues.push({
      code: 'pricing.queue_pending',
      messageHe: `Pricing queue still has ${pendingQueue.length} pending items`,
      severity: 'medium',
    })
  }

  for (const item of failedQueue) {
    if (!String(item?.reasonHe ?? '').trim()) {
      issues.push({
        code: 'pricing.failed_without_reason',
        messageHe: `Failed item missing reason: ${item?.titleHe ?? item?.itemName ?? 'line'}`,
        severity: 'high',
      })
    }
  }

  for (const item of estimatedQueue) {
    if (!String(item?.assumptionHe ?? item?.reasonHe ?? '').trim()) {
      issues.push({
        code: 'pricing.estimated_without_reason',
        messageHe: `Estimated item missing assumption: ${item?.titleHe ?? item?.itemName ?? 'line'}`,
        severity: 'high',
      })
    }
  }

  const lines = Array.isArray(args.pricingArtifact?.pricedLines)
    ? args.pricingArtifact.pricedLines
    : Array.isArray(args.pricingArtifact?.pricedBudget?.lines)
      ? args.pricingArtifact.pricedBudget.lines
      : Array.isArray(args.pricingArtifact?.recommendations)
        ? args.pricingArtifact.recommendations
        : []

  if (lines.length === 0 && queue.length === 0) {
    issues.push({
      code: 'pricing.empty',
      messageHe: 'No priced lines were produced',
      severity: 'high',
      question: {
        id: 'pricing_rebuild',
        textHe: 'No pricing output was produced. Re-run pricing?',
        type: 'select',
        optionsHe: ['Yes', 'No'],
        allowDontKnow: false,
      },
    })
  }

  for (const line of lines) {
    const unitPrice = Number(line?.unitPrice ?? line?.plannedUnitCost ?? line?.price ?? 0)
    if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
      issues.push({
        code: 'pricing.zero_or_missing',
        messageHe: `Invalid unit price: ${line?.titleHe ?? line?.itemName ?? 'line'}`,
        severity: 'high',
      })
    }
    const hasEvidence = Boolean(line?.knownPriceId || line?.priceObservationId || line?.purchaseId)
    const isEstimate = Boolean(line?.isEstimate)
    if (!hasEvidence && !isEstimate) {
      issues.push({
        code: 'pricing.missing_evidence_or_estimate',
        messageHe: `Missing evidence or estimate marker: ${line?.titleHe ?? line?.itemName ?? 'line'}`,
        severity: 'medium',
      })
    }
    if (isEstimate && !line?.assumptionHe) {
      issues.push({
        code: 'pricing.estimate_without_assumption',
        messageHe: `Estimate without assumption: ${line?.titleHe ?? line?.itemName ?? 'line'}`,
        severity: 'medium',
      })
    }
  }

  const hasHardFailures = issues.some((issue) => issue.severity === 'high' || issue.severity === 'critical')

  return {
    status: hasHardFailures || pendingQueue.length > 0 ? 'fail' : 'pass',
    issues,
    blockingQuestions: issues.map((issue) => issue.question).filter(Boolean) as any[],
  }
}
