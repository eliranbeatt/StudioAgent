import { ProjectSnapshotV1 } from '../snapshotBuilder'
import { IssueV1, ValidationReportV1 } from './types'
import { computeReadiness } from './readiness'

function hasAnyText(s: unknown) {
  return typeof s === 'string' && s.trim().length > 0
}

export function validateG0Brief(snapshot: ProjectSnapshotV1): ValidationReportV1 {
  const blockingIssues: IssueV1[] = []

  const hasBrief =
    hasAnyText(snapshot.project.brainDumpRaw) ||
    hasAnyText(snapshot.project.description) ||
    hasAnyText(snapshot.project.notes) ||
    hasAnyText(snapshot.project.overviewSummary)

  if (!hasBrief) {
    blockingIssues.push({
      key: 'brief.missing',
      severity: 'CRITICAL',
      titleHe: 'חסר בריף לפרויקט',
      detailHe: 'יש להזין Brain Dump או תיאור/הערות לפרויקט לפני שמתקדמים בזרימה.',
    })
  }

  const report: ValidationReportV1 = {
    status: blockingIssues.length === 0 ? 'pass' : 'fail',
    blockingIssues,
    fixableIssues: [],
    opportunities: [],
    warnings: [],
    metrics: {
      elementCount: snapshot.counts.elements,
      taskCount: snapshot.counts.tasks,
      hasBrainDump: hasAnyText(snapshot.project.brainDumpRaw),
    },
  }

  report.readinessScore = computeReadiness(report)
  return report
}
