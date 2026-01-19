import { IssueSeverity, ValidationReportV1 } from './types'

const penaltyBySeverity: Record<IssueSeverity, number> = {
  CRITICAL: 0.25,
  HIGH: 0.12,
  MEDIUM: 0.06,
  LOW: 0.02,
}

export function computeReadiness(report: ValidationReportV1): number {
  let score = 1

  const allIssues = [
    ...(report.blockingIssues ?? []),
    ...(report.fixableIssues ?? []),
    ...(report.warnings ?? []),
  ]

  for (const issue of allIssues) {
    score -= penaltyBySeverity[issue.severity] ?? 0
  }

  const contradictionCount = Number((report.metrics as any)?.contradictionCount ?? 0)
  if (contradictionCount > 0) {
    score -= 0.2
  }

  const unknownAcceptedCriticalCount = Number((report.metrics as any)?.unknownAcceptedCriticalCount ?? 0)
  if (unknownAcceptedCriticalCount > 0) {
    score -= 0.1 * unknownAcceptedCriticalCount
  }

  if (score < 0) score = 0
  if (score > 1) score = 1
  return score
}
