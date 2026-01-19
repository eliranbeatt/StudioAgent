import { ProjectSnapshotV1 } from '../snapshotBuilder'
import { IssueV1, ValidationReportV1 } from './types'
import { computeReadiness } from './readiness'

function hasAnyText(s: unknown) {
  return typeof s === 'string' && s.trim().length > 0
}

function isPositiveNumber(n: unknown) {
  return typeof n === 'number' && Number.isFinite(n) && n > 0
}

export function validateG3Accounting(snapshot: ProjectSnapshotV1): ValidationReportV1 {
  const blockingIssues: IssueV1[] = []
  const warnings: IssueV1[] = []

  const taskElementById = new Map<string, string | undefined>()
  for (const t of snapshot.tasks) {
    taskElementById.set(String(t.id), t.elementId ? String(t.elementId) : undefined)
  }

  const materialLineIdsMissingItemName: string[] = []
  const materialLineIdsMissingQuantity: string[] = []
  const materialLineIdsMissingTaskLink: string[] = []
  const materialLineIdsDanglingTask: string[] = []
  const materialLineIdsMissingElementLink: string[] = []

  const workLineIdsMissingQuantity: string[] = []
  const workLineIdsMissingTaskLink: string[] = []
  const workLineIdsDanglingTask: string[] = []
  const workLineIdsMissingElementLink: string[] = []
  const workLineIdsMissingRole: string[] = []

  const taskIdsWithAnyAccountingLine = new Set<string>()

  for (const l of snapshot.materialLines) {
    if (!hasAnyText(l.itemName)) materialLineIdsMissingItemName.push(String(l.id))
    if (l.quantity !== undefined && !isPositiveNumber(l.quantity)) materialLineIdsMissingQuantity.push(String(l.id))
    if (l.quantity === undefined) materialLineIdsMissingQuantity.push(String(l.id))

    if (l.taskId) {
      const tid = String(l.taskId)
      taskIdsWithAnyAccountingLine.add(tid)
      if (!taskElementById.has(tid)) materialLineIdsDanglingTask.push(String(l.id))
    } else {
      materialLineIdsMissingTaskLink.push(String(l.id))
    }

    const derivedElementId =
      (l.elementId ? String(l.elementId) : undefined) ||
      (l.taskId ? taskElementById.get(String(l.taskId)) : undefined)

    if (!derivedElementId) {
      materialLineIdsMissingElementLink.push(String(l.id))
    }
  }

  for (const l of snapshot.workLines) {
    if (l.plannedQuantity !== undefined && !isPositiveNumber(l.plannedQuantity)) {
      workLineIdsMissingQuantity.push(String(l.id))
    }
    if (l.plannedQuantity === undefined) workLineIdsMissingQuantity.push(String(l.id))

    if (l.taskId) {
      const tid = String(l.taskId)
      taskIdsWithAnyAccountingLine.add(tid)
      if (!taskElementById.has(tid)) workLineIdsDanglingTask.push(String(l.id))
    } else {
      // Allow some overhead/management work lines to be taskless, but still surface it.
      workLineIdsMissingTaskLink.push(String(l.id))
    }

    const derivedElementId =
      (l.elementId ? String(l.elementId) : undefined) ||
      (l.taskId ? taskElementById.get(String(l.taskId)) : undefined)

    if (!derivedElementId) {
      workLineIdsMissingElementLink.push(String(l.id))
    }

    if (!hasAnyText(l.roleHe)) {
      workLineIdsMissingRole.push(String(l.id))
    }
  }

  if (snapshot.materialLines.length === 0 && snapshot.workLines.length === 0) {
    blockingIssues.push({
      key: 'accounting.none',
      severity: 'CRITICAL',
      titleHe: 'חסרים נתוני תמחיר (חומרים/עבודה)',
      detailHe: 'כדי להתקדם יש ליצור לפחות שורת חומרים אחת או שורת עבודה אחת.',
    })
  }

  if (materialLineIdsMissingItemName.length > 0) {
    blockingIssues.push({
      key: 'accounting.material.item_name_missing',
      severity: 'HIGH',
      titleHe: 'לחלק משורות החומר חסר שם פריט',
      detailHe: 'יש שורות חומרים ללא itemName. ראו מזהים במטריקות.',
    })
  }

  if (materialLineIdsMissingQuantity.length > 0) {
    blockingIssues.push({
      key: 'accounting.material.quantity_missing_or_invalid',
      severity: 'HIGH',
      titleHe: 'לחלק משורות החומר חסרה כמות תקינה',
      detailHe: 'יש שורות חומרים ללא quantity או עם quantity לא חיובי. ראו מזהים במטריקות.',
    })
  }

  if (workLineIdsMissingQuantity.length > 0) {
    blockingIssues.push({
      key: 'accounting.work.quantity_missing_or_invalid',
      severity: 'HIGH',
      titleHe: 'לחלק משורות העבודה חסרה כמות תקינה',
      detailHe: 'יש שורות עבודה ללא plannedQuantity או עם plannedQuantity לא חיובי. ראו מזהים במטריקות.',
    })
  }

  if (materialLineIdsDanglingTask.length > 0 || workLineIdsDanglingTask.length > 0) {
    blockingIssues.push({
      key: 'accounting.lines.dangling_task_link',
      severity: 'HIGH',
      titleHe: 'יש שורות תמחיר שמפנות למשימה שאינה קיימת',
      detailHe: 'יש שורות עם taskId שאינו קיים בטבלת tasks. ראו מזהים במטריקות.',
    })
  }

  if (materialLineIdsMissingElementLink.length > 0 || workLineIdsMissingElementLink.length > 0) {
    blockingIssues.push({
      key: 'accounting.lines.missing_element_link',
      severity: 'HIGH',
      titleHe: 'יש שורות תמחיר לא מקושרות לאלמנט',
      detailHe: 'בשלב זה, כל שורת תמחיר חייבת להיות מקושרת לאלמנט (ישירות או דרך taskId). ראו מזהים במטריקות.',
    })
  }

  if (workLineIdsMissingRole.length > 0) {
    warnings.push({
      key: 'accounting.work.role_missing',
      severity: 'LOW',
      titleHe: 'לחלק משורות העבודה חסר תפקיד',
      detailHe: 'יש שורות עבודה ללא roleHe. ראו מזהים במטריקות.',
    })
  }

  const taskIdsMissingAnyAccounting: string[] = []
  for (const t of snapshot.tasks) {
    const tid = String(t.id)
    if (!taskIdsWithAnyAccountingLine.has(tid)) taskIdsMissingAnyAccounting.push(tid)
  }

  if (taskIdsMissingAnyAccounting.length > 0) {
    blockingIssues.push({
      key: 'accounting.tasks_missing_lines',
      severity: 'HIGH',
      titleHe: 'יש משימות ללא שורות תמחיר',
      detailHe: 'בשלב זה, לכל משימה נדרש לפחות שורת חומרים או עבודה. ראו מזהים במטריקות.',
    })
  }

  // Non-blocking: surface taskless lines as a signal (overhead/management can be taskless).
  const tasklessLineCount = materialLineIdsMissingTaskLink.length + workLineIdsMissingTaskLink.length
  if (tasklessLineCount > 0) {
    warnings.push({
      key: 'accounting.lines.missing_task_link',
      severity: 'LOW',
      titleHe: 'יש שורות תמחיר ללא קישור למשימה',
      detailHe: 'חלק מהשורות ללא taskId. זה יכול להיות תקין עבור overhead/management, אבל מומלץ לקשר למשימות כשאפשר.',
    })
  }

  const report: ValidationReportV1 = {
    status: blockingIssues.length === 0 ? 'pass' : 'fail',
    blockingIssues,
    fixableIssues: [],
    opportunities: [],
    warnings,
    metrics: {
      gateId: 'G3',
      materialLineCount: snapshot.counts.materialLines,
      workLineCount: snapshot.counts.workLines,
      materialLineIdsMissingItemName,
      materialLineIdsMissingQuantity,
      materialLineIdsMissingTaskLink,
      materialLineIdsDanglingTask,
      materialLineIdsMissingElementLink,
      workLineIdsMissingQuantity,
      workLineIdsMissingTaskLink,
      workLineIdsDanglingTask,
      workLineIdsMissingElementLink,
      workLineIdsMissingRole,
      taskIdsMissingAnyAccounting,
    },
  }

  report.readinessScore = computeReadiness(report)
  return report
}
