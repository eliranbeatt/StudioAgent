import { ProjectSnapshotV1 } from '../snapshotBuilder'
import { IssueV1, ValidationReportV1 } from './types'
import { computeReadiness } from './readiness'

function hasAnyText(s: unknown) {
  return typeof s === 'string' && s.trim().length > 0
}

function isPositiveNumber(n: unknown) {
  return typeof n === 'number' && Number.isFinite(n) && n > 0
}

export function validateG8Quote(snapshot: ProjectSnapshotV1): ValidationReportV1 {
  const blockingIssues: IssueV1[] = []
  const warnings: IssueV1[] = []

  const latest = snapshot.quoteVersions?.[0] ?? null

  if (!latest) {
    blockingIssues.push({
      key: 'quote.missing',
      severity: 'CRITICAL',
      titleHe: 'אין הצעת מחיר בפרויקט',
      detailHe: 'כדי להתקדם נדרש ליצור לפחות גרסת הצעת מחיר אחת (quoteVersions).',
    })
  } else {
    const totals = latest.totals as any
    const grandTotal = totals?.grandTotal
    const hasTotals = isPositiveNumber(grandTotal)

    const hasContent = hasAnyText(latest.quoteText_he) || (latest.quoteBlocks !== null && latest.quoteBlocks !== undefined)

    if (!hasTotals) {
      blockingIssues.push({
        key: 'quote.totals_missing',
        severity: 'HIGH',
        titleHe: 'חסרים סכומים בהצעת המחיר',
        detailHe: 'לגרסת ההצעה האחרונה חסר totals.grandTotal תקין. ראו Debug.',
      })
    }

    if (!hasContent) {
      blockingIssues.push({
        key: 'quote.content_missing',
        severity: 'HIGH',
        titleHe: 'חסר תוכן להצעת המחיר',
        detailHe: 'לגרסת ההצעה האחרונה חסר quoteText_he או quoteBlocks.',
      })
    }

    if (!hasAnyText(latest.currency)) {
      warnings.push({
        key: 'quote.currency_missing',
        severity: 'LOW',
        titleHe: 'חסר מטבע להצעת מחיר',
        detailHe: 'מומלץ להגדיר currency ב-quoteVersion כדי למנוע בלבול.',
      })
    }

    if (!hasAnyText(latest.status)) {
      warnings.push({
        key: 'quote.status_missing',
        severity: 'LOW',
        titleHe: 'חסר סטטוס להצעת מחיר',
        detailHe: 'מומלץ להגדיר status ב-quoteVersion.',
      })
    }
  }

  const report: ValidationReportV1 = {
    status: blockingIssues.length === 0 ? 'pass' : 'fail',
    blockingIssues,
    fixableIssues: [],
    opportunities: [],
    warnings,
    metrics: {
      gateId: 'G8',
      quoteVersionCount: snapshot.counts.quoteVersions,
      latestQuoteId: latest ? String(latest.id) : null,
      latestQuoteStatus: latest?.status ?? null,
      latestQuoteCreatedAt: latest?.createdAt ?? null,
    },
  }

  report.readinessScore = computeReadiness(report)
  return report
}
