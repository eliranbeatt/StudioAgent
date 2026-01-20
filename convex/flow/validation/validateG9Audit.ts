import { ProjectSnapshotV1 } from '../snapshotBuilder'
import { IssueV1, ValidationReportV1 } from './types'
import { computeReadiness } from './readiness'

function hasAnyText(s: unknown) {
  return typeof s === 'string' && s.trim().length > 0
}

function isPositiveNumber(n: unknown) {
  return typeof n === 'number' && Number.isFinite(n) && n > 0
}

export function validateG9Audit(snapshot: ProjectSnapshotV1): ValidationReportV1 {
  const blockingIssues: IssueV1[] = []
  const warnings: IssueV1[] = []

  const taskIdsMissingElementLink: string[] = []
  const lineIdsMissingElementLink: string[] = []
  const materialLineIdsMissingPricingFields: string[] = []

  for (const t of snapshot.tasks) {
    if (!t.elementId) taskIdsMissingElementLink.push(String(t.id))
  }

  for (const l of snapshot.materialLines) {
    const hasElement = !!l.elementId || (l.taskId ? snapshot.tasks.some((t) => String(t.id) === String(l.taskId) && !!t.elementId) : false)
    if (!hasElement) lineIdsMissingElementLink.push(String(l.id))

    const missingPricing =
      !hasAnyText(l.pricingSourceCode) ||
      !isPositiveNumber(l.priceCheckedAt) ||
      typeof l.confidence !== 'number'
    if (missingPricing) materialLineIdsMissingPricingFields.push(String(l.id))
  }

  for (const l of snapshot.workLines) {
    const hasElement = !!l.elementId || (l.taskId ? snapshot.tasks.some((t) => String(t.id) === String(l.taskId) && !!t.elementId) : false)
    if (!hasElement) lineIdsMissingElementLink.push(String(l.id))
  }

  const latestQuote = snapshot.quoteVersions?.[0] ?? null

  if (snapshot.counts.elements === 0) {
    blockingIssues.push({
      key: 'audit.elements.none',
      severity: 'CRITICAL',
      titleHe: 'אין אלמנטים בפרויקט',
      detailHe: 'נדרש לפחות אלמנט אחד כדי לסיים Audit.',
    })
  }

  if (snapshot.counts.tasks === 0) {
    blockingIssues.push({
      key: 'audit.tasks.none',
      severity: 'CRITICAL',
      titleHe: 'אין משימות בפרויקט',
      detailHe: 'נדרש לפחות task אחד כדי לסיים Audit.',
    })
  }

  if (taskIdsMissingElementLink.length > 0) {
    blockingIssues.push({
      key: 'audit.tasks.missing_element_link',
      severity: 'HIGH',
      titleHe: 'יש משימות לא מקושרות לאלמנט',
      detailHe: 'בשלב זה, כל משימה חייבת להיות מקושרת לאלמנט. ראו מזהים במטריקות.',
    })
  }

  if (lineIdsMissingElementLink.length > 0) {
    blockingIssues.push({
      key: 'audit.accounting.lines_missing_element_link',
      severity: 'HIGH',
      titleHe: 'יש שורות תמחיר לא מקושרות לאלמנט',
      detailHe: 'בשלב זה, כל שורת תמחיר חייבת להיות מקושרת לאלמנט (ישירות או דרך taskId). ראו מזהים במטריקות.',
    })
  }

  if (materialLineIdsMissingPricingFields.length > 0) {
    warnings.push({
      key: 'audit.pricing.fields_missing',
      severity: 'LOW',
      titleHe: 'יש שורות חומר ללא שדות תמחור מלאים',
      detailHe: 'חלק משורות החומר חסרות pricingSourceCode/priceCheckedAt/confidence. מומלץ להשלים לפני סגירה.',
    })
  }

  if (!latestQuote) {
    blockingIssues.push({
      key: 'audit.quote.missing',
      severity: 'CRITICAL',
      titleHe: 'אין הצעת מחיר לסגירה',
      detailHe: 'נדרש ליצור quoteVersion כדי לסיים את ה-Audit.',
    })
  }

  const report: ValidationReportV1 = {
    status: blockingIssues.length === 0 ? 'pass' : 'fail',
    blockingIssues,
    fixableIssues: [],
    opportunities: [],
    warnings,
    metrics: {
      gateId: 'G9',
      elementCount: snapshot.counts.elements,
      taskCount: snapshot.counts.tasks,
      materialLineCount: snapshot.counts.materialLines,
      workLineCount: snapshot.counts.workLines,
      quoteVersionCount: snapshot.counts.quoteVersions,
      taskIdsMissingElementLink,
      lineIdsMissingElementLink,
      materialLineIdsMissingPricingFields,
      latestQuoteId: latestQuote ? String(latestQuote.id) : null,
    },
  }

  report.readinessScore = computeReadiness(report)
  return report
}
