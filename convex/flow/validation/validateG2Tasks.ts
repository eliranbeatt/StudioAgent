import { ProjectSnapshotV1 } from '../snapshotBuilder'
import { IssueV1, ValidationReportV1 } from './types'
import { computeReadiness } from './readiness'

function hasAnyText(s: unknown) {
  return typeof s === 'string' && s.trim().length > 0
}

function norm(s: unknown) {
  return typeof s === 'string' ? s.trim().toLowerCase() : ''
}

function isProjectLevelTask(task: { title?: string; workType?: string; stage?: string }) {
  const title = norm(task.title)
  const workType = norm(task.workType)
  const stage = norm(task.stage)
  const combined = `${title} ${workType} ${stage}`
  return (
    workType.includes('management') ||
    workType.includes('admin') ||
    workType.includes('overhead') ||
    combined.includes('management') ||
    combined.includes('manager') ||
    combined.includes('pm') ||
    combined.includes('project manager') ||
    combined.includes('admin') ||
    combined.includes('ניהול') ||
    combined.includes('מנהל') ||
    combined.includes('פיקוח')
  )
}

export function validateG2Tasks(snapshot: ProjectSnapshotV1): ValidationReportV1 {
  const blockingIssues: IssueV1[] = []
  const missingTitleTaskIds: string[] = []
  const missingElementLinkTaskIds: string[] = []

  if (snapshot.tasks.length === 0) {
    blockingIssues.push({
      key: 'tasks.none',
      severity: 'CRITICAL',
      titleHe: 'אין משימות בפרויקט',
      detailHe: 'יש ליצור לפחות משימה אחת כדי להמשיך.',
    })
  }

  for (const t of snapshot.tasks) {
    if (!hasAnyText(t.title)) {
      missingTitleTaskIds.push(String(t.id))
    }

    // Spec invariant: every task must link to elementId OR be explicitly project-global.
    // We don't have an explicit project-global marker in schema yet, so for Phase 2 we block when missing.
    if (!t.elementId && !isProjectLevelTask(t)) {
      missingElementLinkTaskIds.push(String(t.id))
    }
  }

  if (missingTitleTaskIds.length > 0) {
    blockingIssues.push({
      key: 'tasks.title_missing',
      severity: 'HIGH',
      titleHe: 'לחלק מהמשימות חסר שם',
      detailHe: 'יש משימות ללא כותרת. ראו מזהים במטריקות.',
    })
  }

  if (missingElementLinkTaskIds.length > 0) {
    blockingIssues.push({
      key: 'tasks.missing_element_link',
      severity: 'HIGH',
      titleHe: 'יש משימות לא מקושרות לאלמנט',
      detailHe: 'בשלב זה, כל משימה חייבת להיות מקושרת לאלמנט (elementId). ראו מזהים במטריקות.',
    })
  }

  const report: ValidationReportV1 = {
    status: blockingIssues.length === 0 ? 'pass' : 'fail',
    blockingIssues,
    fixableIssues: [],
    opportunities: [],
    warnings: [],
    metrics: {
      taskCount: snapshot.counts.tasks,
      missingTitleTaskIds,
      missingElementLinkTaskIds,
    },
  }

  report.readinessScore = computeReadiness(report)
  return report
}
