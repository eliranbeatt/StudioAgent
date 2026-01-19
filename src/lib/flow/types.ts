export type GateId =
  | 'G0'
  | 'G1'
  | 'G2'
  | 'G3'
  | 'G4'
  | 'G5'
  | 'G6'
  | 'G7'
  | 'G8'
  | 'G9'

export type IssueSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'

export type ValidationStatus = 'pass' | 'fail'

export type ValidationIssueV1 = {
  key: string
  severity: IssueSeverity
  titleHe?: string
  detailHe?: string
  detailEn?: string
}

export type ValidationOpportunityV1 = {
  key: string
  titleHe?: string
  detailHe?: string
  detailEn?: string
}

export type ValidationReportV1 = {
  status: ValidationStatus
  blockingIssues: ValidationIssueV1[]
  fixableIssues: ValidationIssueV1[]
  opportunities: ValidationOpportunityV1[]
  warnings: ValidationIssueV1[]
  metrics?: Record<string, unknown>
  readinessScore?: number
}
