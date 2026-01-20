import { ProjectSnapshotV1 } from '../snapshotBuilder'
import { IssueV1, ValidationReportV1 } from './types'
import { computeReadiness } from './readiness'

function hasAnyText(s: unknown) {
  return typeof s === 'string' && s.trim().length > 0
}

function isNonNegativeNumber(n: unknown) {
  return typeof n === 'number' && Number.isFinite(n) && n >= 0
}

export function validateG5TasksEnrichment(snapshot: ProjectSnapshotV1): ValidationReportV1 {
  const blockingIssues: IssueV1[] = []
  const warnings: IssueV1[] = []

  const taskIdsMissingWorkType: string[] = []
  const taskIdsMissingStage: string[] = []
  const taskIdsMissingEstimate: string[] = []
  const taskIdsMissingAccountingLinks: string[] = []
  const taskIdsWithAccountingLines: string[] = []

  const tasksWithAccounting = new Set<string>()
  for (const l of snapshot.materialLines) {
    if (l.taskId) tasksWithAccounting.add(String(l.taskId))
  }
  for (const l of snapshot.workLines) {
    if (l.taskId) tasksWithAccounting.add(String(l.taskId))
  }

  for (const t of snapshot.tasks) {
    const taskId = String(t.id)

    if (!hasAnyText(t.workType)) taskIdsMissingWorkType.push(taskId)
    if (!hasAnyText(t.stage)) taskIdsMissingStage.push(taskId)

    const hasEstimate =
      (isNonNegativeNumber(t.estimatedHours) && (t.estimatedHours as number) > 0) ||
      (isNonNegativeNumber(t.estimatedMinutes) && (t.estimatedMinutes as number) > 0)
    if (!hasEstimate) taskIdsMissingEstimate.push(taskId)

    if (tasksWithAccounting.has(taskId)) {
      taskIdsWithAccountingLines.push(taskId)
      const links = t.accountingLinks
      if (!Array.isArray(links) || links.length === 0) {
        taskIdsMissingAccountingLinks.push(taskId)
      }
    }
  }

  if (snapshot.tasks.length === 0) {
    blockingIssues.push({
      key: 'tasks.none',
      severity: 'CRITICAL',
      titleHe: 'אין משימות בפרויקט',
      detailHe: 'נדרש לפחות task אחד כדי להמשיך.',
    })
  }

  if (taskIdsMissingWorkType.length > 0) {
    blockingIssues.push({
      key: 'tasks.enrichment.work_type_missing',
      severity: 'HIGH',
      titleHe: 'לחלק מהמשימות חסר workType',
      detailHe: 'בשלב זה נדרש להגדיר סוג עבודה לכל משימה. ראו מזהים במטריקות.',
    })
  }

  if (taskIdsMissingEstimate.length > 0) {
    blockingIssues.push({
      key: 'tasks.enrichment.estimate_missing',
      severity: 'HIGH',
      titleHe: 'לחלק מהמשימות חסר אומדן זמן',
      detailHe: 'נדרש estimatedHours/estimatedMinutes לכל משימה. ראו מזהים במטריקות.',
    })
  }

  if (taskIdsMissingAccountingLinks.length > 0) {
    blockingIssues.push({
      key: 'tasks.enrichment.accounting_links_missing',
      severity: 'MEDIUM',
      titleHe: 'לחלק מהמשימות חסרים קישורי תמחיר (accountingLinks)',
      detailHe: 'יש משימות שיש להן שורות תמחיר (לפי taskId) אך חסר להן accountingLinks. ראו מזהים במטריקות.',
    })
  }

  if (taskIdsMissingStage.length > 0) {
    warnings.push({
      key: 'tasks.enrichment.stage_missing',
      severity: 'LOW',
      titleHe: 'לחלק מהמשימות חסר stage',
      detailHe: 'מומלץ להגדיר stage כדי לתמוך ב-G6 (ops) ובסדר העבודה. ראו מזהים במטריקות.',
    })
  }

  const report: ValidationReportV1 = {
    status: blockingIssues.length === 0 ? 'pass' : 'fail',
    blockingIssues,
    fixableIssues: [],
    opportunities: [],
    warnings,
    metrics: {
      gateId: 'G5',
      taskCount: snapshot.counts.tasks,
      taskIdsMissingWorkType,
      taskIdsMissingStage,
      taskIdsMissingEstimate,
      taskIdsWithAccountingLines,
      taskIdsMissingAccountingLinks,
    },
  }

  report.readinessScore = computeReadiness(report)
  return report
}
