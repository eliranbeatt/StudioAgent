import { ProjectSnapshotV1 } from '../snapshotBuilder'
import { IssueV1, ValidationReportV1 } from './types'
import { computeReadiness } from './readiness'

function norm(s: unknown) {
  return typeof s === 'string' ? s.trim().toLowerCase() : ''
}

function includesAny(haystack: string, needles: string[]) {
  for (const n of needles) {
    if (haystack.includes(n)) return true
  }
  return false
}

type OpsCoverage = {
  hasTransport: boolean
  hasMeals: boolean
  hasTools: boolean
  hasConsumables: boolean
  hasPackaging: boolean
  hasTeardownOrReturns: boolean
  hasBufferOrRisk: boolean
}

export function validateG6OpsCompleteness(snapshot: ProjectSnapshotV1): ValidationReportV1 {
  const blockingIssues: IssueV1[] = []
  const warnings: IssueV1[] = []

  const coverage: OpsCoverage = {
    hasTransport: false,
    hasMeals: false,
    hasTools: false,
    hasConsumables: false,
    hasPackaging: false,
    hasTeardownOrReturns: false,
    hasBufferOrRisk: false,
  }

  const transportLineIds: string[] = []
  const mealsLineIds: string[] = []
  const toolsLineIds: string[] = []
  const consumablesLineIds: string[] = []
  const packagingLineIds: string[] = []
  const teardownLineIds: string[] = []
  const bufferLineIds: string[] = []

  const scanLine = (id: unknown, sectionKey: unknown, workType: unknown, itemOrRole: unknown) => {
    const sk = norm(sectionKey)
    const wt = norm(workType)
    const name = norm(itemOrRole)
    const all = `${sk} ${wt} ${name}`

    if (!coverage.hasTransport && (wt === 'transport_logistics' || includesAny(all, ['transport', 'logistics', 'delivery', 'shipping', 'pickup']))) {
      coverage.hasTransport = true
      transportLineIds.push(String(id))
    }

    if (!coverage.hasMeals && includesAny(all, ['meals', 'food', 'catering', 'ארוחות'])) {
      coverage.hasMeals = true
      mealsLineIds.push(String(id))
    }

    if (!coverage.hasTools && includesAny(all, ['tools', 'tool', 'ppe', 'safety', 'ladder', 'drill', 'מסור', 'מברגה', 'סולם', 'כלים', 'ציוד'])) {
      coverage.hasTools = true
      toolsLineIds.push(String(id))
    }

    if (!coverage.hasConsumables && includesAny(all, ['consumable', 'consumables', 'tape', 'glue', 'screws', 'blades', 'דבק', 'ברגים', 'סכינים', 'מתכלים', 'טייפ'])) {
      coverage.hasConsumables = true
      consumablesLineIds.push(String(id))
    }

    if (!coverage.hasPackaging && includesAny(all, ['packaging', 'wrap', 'foam', 'box', 'קרטון', 'אריזה', 'ניילון', 'בועות'])) {
      coverage.hasPackaging = true
      packagingLineIds.push(String(id))
    }

    if (!coverage.hasTeardownOrReturns && includesAny(all, ['teardown', 'return', 'returns', 'strike', 'loadout', 'פירוק', 'החזרה', 'החזרות'])) {
      coverage.hasTeardownOrReturns = true
      teardownLineIds.push(String(id))
    }

    if (!coverage.hasBufferOrRisk && includesAny(all, ['buffer', 'risk', 'contingency', 'בופר', 'רזרבה', 'סיכון'])) {
      coverage.hasBufferOrRisk = true
      bufferLineIds.push(String(id))
    }
  }

  for (const l of snapshot.materialLines) {
    scanLine(l.id, l.sectionKey, l.workType, l.itemName)
  }

  for (const l of snapshot.workLines) {
    scanLine(l.id, l.sectionKey, l.workType, l.roleHe)
  }

  if (!coverage.hasTransport) {
    blockingIssues.push({
      key: 'ops.transport_missing',
      severity: 'HIGH',
      titleHe: 'חסרה לוגיסטיקה/הובלה',
      detailHe: 'לא נמצאו שורות transport/logistics. נדרש להוסיף תכנון הובלה/איסוף/משלוח.',
    })
  }

  if (!coverage.hasConsumables) {
    blockingIssues.push({
      key: 'ops.consumables_missing',
      severity: 'HIGH',
      titleHe: 'חסרים מתכלים',
      detailHe: 'לא נמצאו שורות consumables (דבק/טייפ/ברגים/להבים וכו׳).',
    })
  }

  if (!coverage.hasBufferOrRisk) {
    blockingIssues.push({
      key: 'ops.buffer_missing',
      severity: 'MEDIUM',
      titleHe: 'חסר בופר/רזרבה',
      detailHe: 'לא נמצאה שורת buffer/risk/contingency. מומלץ להוסיף רזרבה סדורה.',
    })
  }

  if (!coverage.hasTeardownOrReturns) {
    blockingIssues.push({
      key: 'ops.teardown_missing',
      severity: 'MEDIUM',
      titleHe: 'חסר פירוק/החזרות',
      detailHe: 'לא נמצאו שורות teardown/returns/פירוק. נדרש לוודא תכנון סגירה והחזרות.',
    })
  }

  const hasInstallStageTask = snapshot.tasks.some((t) => norm(t.stage) === 'install')
  if (hasInstallStageTask && !coverage.hasMeals) {
    warnings.push({
      key: 'ops.meals_missing',
      severity: 'LOW',
      titleHe: 'ייתכן שחסרות ארוחות ליום התקנה',
      detailHe: 'יש משימות stage=install אך לא נמצאו שורות meals/ארוחות. אם יש יום התקנה מלא—מומלץ להוסיף.',
    })
  }

  const report: ValidationReportV1 = {
    status: blockingIssues.length === 0 ? 'pass' : 'fail',
    blockingIssues,
    fixableIssues: [],
    opportunities: [],
    warnings,
    metrics: {
      gateId: 'G6',
      coverage,
      transportLineIds,
      mealsLineIds,
      toolsLineIds,
      consumablesLineIds,
      packagingLineIds,
      teardownLineIds,
      bufferLineIds,
    },
  }

  report.readinessScore = computeReadiness(report)
  return report
}
