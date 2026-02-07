import { GateIssue, GateResult } from '../contracts'

export function validatePricing(args: { pricingArtifact?: any; budgetArtifact?: any }): GateResult {
  const issues: GateIssue[] = []
  const lines = Array.isArray(args.pricingArtifact?.pricedLines)
    ? args.pricingArtifact.pricedLines
    : Array.isArray(args.pricingArtifact?.pricedBudget?.lines)
      ? args.pricingArtifact.pricedBudget.lines
      : Array.isArray(args.pricingArtifact?.recommendations)
        ? args.pricingArtifact.recommendations
        : []

  if (lines.length === 0) {
    issues.push({
      code: 'pricing.empty',
      messageHe: 'לא נמצאו שורות מתומחרות',
      severity: 'high',
      question: {
        id: 'pricing_rebuild',
        textHe: 'לא נוצר תמחור. להפיק תמחור מחדש?',
        type: 'select',
        optionsHe: ['כן', 'לא'],
      },
    })
  }

  for (const line of lines) {
    const unitPrice = Number(line?.unitPrice ?? line?.plannedUnitCost ?? line?.price ?? 0)
    if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
      issues.push({
        code: 'pricing.zero_or_missing',
        messageHe: `שורה ללא מחיר תקין: ${line?.titleHe ?? line?.itemName ?? 'ללא שם'}`,
        severity: 'high',
      })
    }
    const hasEvidence = Boolean(line?.knownPriceId || line?.priceObservationId || line?.purchaseId)
    const isEstimate = Boolean(line?.isEstimate)
    if (!hasEvidence && !isEstimate) {
      issues.push({
        code: 'pricing.missing_evidence_or_estimate',
        messageHe: `חסר מקור מחיר או סימון estimate: ${line?.titleHe ?? line?.itemName ?? 'ללא שם'}`,
        severity: 'medium',
      })
    }
    if (isEstimate && !line?.assumptionHe) {
      issues.push({
        code: 'pricing.estimate_without_assumption',
        messageHe: `estimate ללא הנחה מילולית: ${line?.titleHe ?? line?.itemName ?? 'ללא שם'}`,
        severity: 'medium',
      })
    }
  }

  return {
    status: issues.length > 0 ? 'fail' : 'pass',
    issues,
    blockingQuestions: issues.map((issue) => issue.question).filter(Boolean) as any[],
  }
}
