export type IssueSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'

export type ValidationStatus = 'pass' | 'fail'

export type IssueV1 = {
  key: string
  severity: IssueSeverity
  titleHe: string
  detailHe?: string
}

export type ValidationReportV1 = {
  status: ValidationStatus
  blockingIssues: IssueV1[]
  fixableIssues: IssueV1[]
  opportunities: Array<{ key: string; titleHe: string; detailHe?: string }>
  warnings: IssueV1[]
  metrics?: Record<string, unknown>
  readinessScore?: number
}
