import { ProjectSnapshotV1 } from '../snapshotBuilder'
import { IssueV1, ValidationReportV1 } from './types'
import { computeReadiness } from './readiness'

function hasAnyText(s: unknown) {
  return typeof s === 'string' && s.trim().length > 0
}

export function validateG1Elements(snapshot: ProjectSnapshotV1): ValidationReportV1 {
  const blockingIssues: IssueV1[] = []
  const warnings: IssueV1[] = []
  const missingTitleElementIds: string[] = []
  const missingTypeElementIds: string[] = []

  if (snapshot.elements.length === 0) {
    blockingIssues.push({
      key: 'elements.none',
      severity: 'CRITICAL',
      titleHe: 'אין אלמנטים בפרויקט',
      detailHe: 'יש ליצור לפחות אלמנט אחד כדי להמשיך.',
    })
  }

  for (const el of snapshot.elements) {
    if (!hasAnyText(el.title)) {
      missingTitleElementIds.push(String(el.id))
    }

    if (!hasAnyText(el.type)) {
      missingTypeElementIds.push(String(el.id))
    }
  }

  if (missingTitleElementIds.length > 0) {
    blockingIssues.push({
      key: 'elements.title_missing',
      severity: 'HIGH',
      titleHe: 'לחלק מהאלמנטים חסר שם',
      detailHe: 'יש אלמנטים ללא כותרת. ראו מזהים במטריקות.',
    })
  }

  if (missingTypeElementIds.length > 0) {
    warnings.push({
      key: 'elements.type_missing',
      severity: 'LOW',
      titleHe: 'לחלק מהאלמנטים חסר סוג',
      detailHe: 'יש אלמנטים ללא סוג. ראו מזהים במטריקות.',
    })
  }

  const report: ValidationReportV1 = {
    status: blockingIssues.length === 0 ? 'pass' : 'fail',
    blockingIssues,
    fixableIssues: [],
    opportunities: [],
    warnings,
    metrics: {
      elementCount: snapshot.counts.elements,
      missingTitleElementIds,
      missingTypeElementIds,
    },
  }

  report.readinessScore = computeReadiness(report)
  return report
}
