import { ProjectSnapshotV1 } from '../snapshotBuilder'
import { IssueV1, ValidationReportV1 } from './types'
import { computeReadiness } from './readiness'

function isPositiveNumber(n: unknown) {
  return typeof n === 'number' && Number.isFinite(n) && n > 0
}

function isValidConfidence(n: unknown) {
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1
}

function approxEqual(a: number, b: number, relTol = 0.02, absTol = 0.5) {
  const diff = Math.abs(a - b)
  if (diff <= absTol) return true
  const denom = Math.max(Math.abs(a), Math.abs(b), 1)
  return diff / denom <= relTol
}

const DAY_MS = 24 * 60 * 60 * 1000

function ttlForSource(source: unknown): number {
  switch (source) {
    case 'catalog_manual':
      return 90 * DAY_MS
    case 'web':
      return 14 * DAY_MS
    case 'estimate':
      return 365 * DAY_MS
    case 'purchase_actual':
      return 180 * DAY_MS
    case 'override':
      return 60 * DAY_MS
    default:
      return 30 * DAY_MS
  }
}

export function validateG4Pricing(snapshot: ProjectSnapshotV1): ValidationReportV1 {
  const blockingIssues: IssueV1[] = []
  const warnings: IssueV1[] = []

  const materialLineIdsMissingUnitCost: string[] = []
  const materialLineIdsMissingTotalCost: string[] = []
  const materialLineIdsMissingProvenance: string[] = []
  const materialLineIdsMissingCheckedAt: string[] = []
  const materialLineIdsMissingConfidence: string[] = []
  const materialLineIdsStaleCheckedAt: string[] = []
  const materialLineIdsTotalMismatch: string[] = []
  const materialLineIdsMissingEvidence: string[] = []

  const workLineIdsMissingUnitCost: string[] = []
  const workLineIdsMissingTotalCost: string[] = []
  const workLineIdsMissingConfidence: string[] = []
  const workLineIdsTotalMismatch: string[] = []

  let contradictionCount = 0
  const now = Date.now()

  // Material lines: pricing provenance + checkedAt + confidence are required.
  for (const l of snapshot.materialLines) {
    if (!isPositiveNumber(l.plannedUnitCost)) materialLineIdsMissingUnitCost.push(String(l.id))
    if (!isPositiveNumber(l.plannedTotalCost)) materialLineIdsMissingTotalCost.push(String(l.id))

    if (!l.pricingSourceCode || String(l.pricingSourceCode).trim().length === 0) {
      materialLineIdsMissingProvenance.push(String(l.id))
    }

    if (!isPositiveNumber(l.priceCheckedAt)) {
      materialLineIdsMissingCheckedAt.push(String(l.id))
    } else {
      const ttl = ttlForSource(l.pricingSourceCode)
      if (now - (l.priceCheckedAt as number) > ttl) {
        materialLineIdsStaleCheckedAt.push(String(l.id))
      }
    }

    if (l.pricingSourceCode === 'web' && !l.priceUrl) {
      materialLineIdsMissingEvidence.push(String(l.id))
    }

    if (!isValidConfidence(l.confidence)) {
      materialLineIdsMissingConfidence.push(String(l.id))
    }

    if (isPositiveNumber(l.plannedUnitCost) && isPositiveNumber(l.plannedTotalCost) && isPositiveNumber(l.quantity)) {
      const expected = (l.plannedUnitCost as number) * (l.quantity as number)
      if (!approxEqual(expected, l.plannedTotalCost as number)) {
        contradictionCount += 1
        materialLineIdsTotalMismatch.push(String(l.id))
      }
    }
  }

  // Work lines: we don't have checkedAt/provenance in schema, but costs should exist.
  for (const l of snapshot.workLines) {
    if (!isPositiveNumber(l.plannedUnitCost)) workLineIdsMissingUnitCost.push(String(l.id))
    if (!isPositiveNumber(l.plannedTotalCost)) workLineIdsMissingTotalCost.push(String(l.id))

    if (!isValidConfidence(l.confidence)) {
      workLineIdsMissingConfidence.push(String(l.id))
    }

    if (isPositiveNumber(l.plannedUnitCost) && isPositiveNumber(l.plannedTotalCost) && isPositiveNumber(l.plannedQuantity)) {
      const expected = (l.plannedUnitCost as number) * (l.plannedQuantity as number)
      if (!approxEqual(expected, l.plannedTotalCost as number)) {
        contradictionCount += 1
        workLineIdsTotalMismatch.push(String(l.id))
      }
    }
  }

  if (snapshot.materialLines.length === 0 && snapshot.workLines.length === 0) {
    blockingIssues.push({
      key: 'pricing.none',
      severity: 'CRITICAL',
      titleHe: 'אין שורות לתמחור',
      detailHe: 'כדי לתמחר יש ליצור שורות חומרים/עבודה בשלבים הקודמים.',
    })
  }

  if (materialLineIdsMissingUnitCost.length > 0) {
    blockingIssues.push({
      key: 'pricing.material.unit_cost_missing_or_invalid',
      severity: 'HIGH',
      titleHe: 'לחלק משורות החומר חסר מחיר יחידה תקין',
      detailHe: 'יש שורות חומרים ללא plannedUnitCost או עם ערך לא חיובי. ראו מזהים במטריקות.',
    })
  }

  if (materialLineIdsMissingTotalCost.length > 0) {
    blockingIssues.push({
      key: 'pricing.material.total_cost_missing_or_invalid',
      severity: 'HIGH',
      titleHe: 'לחלק משורות החומר חסר מחיר כולל תקין',
      detailHe: 'יש שורות חומרים ללא plannedTotalCost או עם ערך לא חיובי. ראו מזהים במטריקות.',
    })
  }

  if (materialLineIdsMissingProvenance.length > 0) {
    blockingIssues.push({
      key: 'pricing.material.provenance_missing',
      severity: 'HIGH',
      titleHe: 'חסרה פרובננס לתמחור בשורות חומר',
      detailHe: 'יש שורות ללא pricingSourceCode. ראו מזהים במטריקות.',
    })
  }

  if (materialLineIdsMissingCheckedAt.length > 0) {
    blockingIssues.push({
      key: 'pricing.material.checked_at_missing',
      severity: 'MEDIUM',
      titleHe: 'חסר תאריך בדיקת מחיר בשורות חומר',
      detailHe: 'יש שורות ללא priceCheckedAt. ראו מזהים במטריקות.',
    })
  }

  if (materialLineIdsMissingConfidence.length > 0) {
    blockingIssues.push({
      key: 'pricing.material.confidence_missing',
      severity: 'MEDIUM',
      titleHe: 'חסר ציון בטחון (confidence) בשורות חומר',
      detailHe: 'יש שורות ללא confidence או עם ערך מחוץ לטווח 0..1. ראו מזהים במטריקות.',
    })
  }

  if (workLineIdsMissingUnitCost.length > 0) {
    blockingIssues.push({
      key: 'pricing.work.unit_cost_missing_or_invalid',
      severity: 'HIGH',
      titleHe: 'לחלק משורות העבודה חסר מחיר יחידה תקין',
      detailHe: 'יש שורות עבודה ללא plannedUnitCost או עם ערך לא חיובי. ראו מזהים במטריקות.',
    })
  }

  if (workLineIdsMissingTotalCost.length > 0) {
    blockingIssues.push({
      key: 'pricing.work.total_cost_missing_or_invalid',
      severity: 'HIGH',
      titleHe: 'לחלק משורות העבודה חסר מחיר כולל תקין',
      detailHe: 'יש שורות עבודה ללא plannedTotalCost או עם ערך לא חיובי. ראו מזהים במטריקות.',
    })
  }

  if (workLineIdsMissingConfidence.length > 0) {
    warnings.push({
      key: 'pricing.work.confidence_missing',
      severity: 'LOW',
      titleHe: 'חסר confidence בשורות עבודה',
      detailHe: 'אין שדה checkedAt/provenance לעבודה כרגע, אבל מומלץ לציין confidence. ראו מזהים במטריקות.',
    })
  }

  if (materialLineIdsStaleCheckedAt.length > 0) {
    warnings.push({
      key: 'pricing.material.checked_at_stale',
      severity: 'LOW',
      titleHe: 'חלק ממחירי החומרים ישנים',
      detailHe: 'יש שורות עם priceCheckedAt ישן לפי TTL לפי מקור (web קצר יותר). ראו מזהים במטריקות.',
    })
  }

  if (materialLineIdsMissingEvidence.length > 0) {
    warnings.push({
      key: 'pricing.material.evidence_missing',
      severity: 'LOW',
      titleHe: 'חסרה ראיה למחיר מהאינטרנט',
      detailHe: 'יש שורות web ללא priceUrl. מומלץ לשמור מקור מחיר. ראו מזהים במטריקות.',
    })
  }

  if (materialLineIdsTotalMismatch.length > 0 || workLineIdsTotalMismatch.length > 0) {
    warnings.push({
      key: 'pricing.totals_mismatch',
      severity: 'LOW',
      titleHe: 'יש אי-התאמות בין מחיר יחידה למחיר כולל',
      detailHe: 'במקרים מסוימים plannedTotalCost אינו תואם plannedUnitCost×quantity. ראו מזהים במטריקות.',
    })
  }

  const report: ValidationReportV1 = {
    status: blockingIssues.length === 0 ? 'pass' : 'fail',
    blockingIssues,
    fixableIssues: [],
    opportunities: [],
    warnings,
    metrics: {
      gateId: 'G4',
      contradictionCount,
      materialLineCount: snapshot.counts.materialLines,
      workLineCount: snapshot.counts.workLines,
      materialLineIdsMissingUnitCost,
      materialLineIdsMissingTotalCost,
      materialLineIdsMissingProvenance,
      materialLineIdsMissingCheckedAt,
      materialLineIdsMissingConfidence,
      materialLineIdsStaleCheckedAt,
      materialLineIdsTotalMismatch,
      materialLineIdsMissingEvidence,
      workLineIdsMissingUnitCost,
      workLineIdsMissingTotalCost,
      workLineIdsMissingConfidence,
      workLineIdsTotalMismatch,
    },
  }

  report.readinessScore = computeReadiness(report)
  return report
}
