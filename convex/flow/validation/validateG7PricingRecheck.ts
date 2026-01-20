import { ProjectSnapshotV1 } from '../snapshotBuilder'
import { IssueV1, ValidationReportV1 } from './types'
import { computeReadiness } from './readiness'

function isPositiveNumber(n: unknown) {
  return typeof n === 'number' && Number.isFinite(n) && n > 0
}

function isValidConfidence(n: unknown) {
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1
}

const DAY_MS = 24 * 60 * 60 * 1000

function ttlMsForSource(source: unknown): number {
  switch (String(source ?? '')) {
    case 'web':
      return 7 * DAY_MS
    case 'purchase_actual':
      return 180 * DAY_MS
    case 'catalog_manual':
      return 30 * DAY_MS
    case 'estimate':
      return 14 * DAY_MS
    case 'override':
      return 90 * DAY_MS
    default:
      return 30 * DAY_MS
  }
}

export function validateG7PricingRecheck(snapshot: ProjectSnapshotV1): ValidationReportV1 {
  const blockingIssues: IssueV1[] = []
  const warnings: IssueV1[] = []

  const materialLineIdsMissingProvenance: string[] = []
  const materialLineIdsMissingCheckedAt: string[] = []
  const materialLineIdsMissingConfidence: string[] = []
  const materialLineIdsStale: string[] = []
  const materialLineIdsLowConfidence: string[] = []

  const now = Date.now()

  for (const l of snapshot.materialLines) {
    const source = String(l.pricingSourceCode ?? '')
    const ttl = ttlMsForSource(source)

    if (!source) materialLineIdsMissingProvenance.push(String(l.id))
    if (!isPositiveNumber(l.priceCheckedAt)) {
      materialLineIdsMissingCheckedAt.push(String(l.id))
    } else if (now - (l.priceCheckedAt as number) > ttl) {
      materialLineIdsStale.push(String(l.id))
    }

    if (!isValidConfidence(l.confidence)) {
      materialLineIdsMissingConfidence.push(String(l.id))
    } else if ((l.confidence as number) < 0.4) {
      materialLineIdsLowConfidence.push(String(l.id))
    }
  }

  if (snapshot.counts.materialLines === 0) {
    // For now, pricing recheck focuses on material pricing only.
    blockingIssues.push({
      key: 'pricing.recheck.no_material_lines',
      severity: 'CRITICAL',
      titleHe: 'אין שורות חומר לתמחור',
      detailHe: 'כדי להתקדם נדרש לפחות שורת חומר אחת או לשנות את מודל התמחור.',
    })
  }

  if (materialLineIdsMissingProvenance.length > 0) {
    blockingIssues.push({
      key: 'pricing.recheck.provenance_missing',
      severity: 'HIGH',
      titleHe: 'חסרה פרובננס לתמחור',
      detailHe: 'יש שורות חומר ללא pricingSourceCode. ראו מזהים במטריקות.',
    })
  }

  if (materialLineIdsMissingCheckedAt.length > 0) {
    blockingIssues.push({
      key: 'pricing.recheck.checked_at_missing',
      severity: 'HIGH',
      titleHe: 'חסר תאריך בדיקת מחיר',
      detailHe: 'יש שורות חומר ללא priceCheckedAt. ראו מזהים במטריקות.',
    })
  }

  if (materialLineIdsMissingConfidence.length > 0) {
    blockingIssues.push({
      key: 'pricing.recheck.confidence_missing',
      severity: 'MEDIUM',
      titleHe: 'חסר confidence לתמחור',
      detailHe: 'יש שורות חומר ללא confidence או מחוץ לטווח 0..1. ראו מזהים במטריקות.',
    })
  }

  if (materialLineIdsStale.length > 0) {
    blockingIssues.push({
      key: 'pricing.recheck.stale',
      severity: 'MEDIUM',
      titleHe: 'תמחור מיושן — נדרש רענון',
      detailHe: 'יש שורות שהמחיר שלהן ישן לפי TTL של מקור התמחור. ראו מזהים במטריקות.',
    })
  }

  if (materialLineIdsLowConfidence.length > 0) {
    warnings.push({
      key: 'pricing.recheck.low_confidence',
      severity: 'LOW',
      titleHe: 'יש שורות עם confidence נמוך',
      detailHe: 'מומלץ לבדוק מחדש שורות עם confidence < 0.4. ראו מזהים במטריקות.',
    })
  }

  const report: ValidationReportV1 = {
    status: blockingIssues.length === 0 ? 'pass' : 'fail',
    blockingIssues,
    fixableIssues: [],
    opportunities: [],
    warnings,
    metrics: {
      gateId: 'G7',
      materialLineCount: snapshot.counts.materialLines,
      materialLineIdsMissingProvenance,
      materialLineIdsMissingCheckedAt,
      materialLineIdsMissingConfidence,
      materialLineIdsStale,
      materialLineIdsLowConfidence,
    },
  }

  report.readinessScore = computeReadiness(report)
  return report
}
