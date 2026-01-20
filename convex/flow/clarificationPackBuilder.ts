import type { IssueSeverity, IssueV1, ValidationReportV1 } from './validation/types'

type QAPairV1 = {
  questionKey?: string
  answer_he?: string
}

type AssumptionAcceptedV1 = {
  key: string
  valueHe: string
  acceptedAt: number
}

export type QuestionsBlockV1 = {
  type: 'QuestionsBlock'
  titleHe: string
  submitLabelHe: string
  questions: Array<{ id: string; textHe: string; detailHe?: string }>
  suggestions?: Array<{ key: string; titleHe: string; detailHe?: string }>
}

function severityWeight(sev: IssueSeverity): number {
  switch (sev) {
    case 'CRITICAL':
      return 4
    case 'HIGH':
      return 3
    case 'MEDIUM':
      return 2
    case 'LOW':
      return 1
    default:
      return 0
  }
}

function stableUnique(items: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const item of items) {
    const key = String(item || '').trim()
    if (!key) continue
    if (seen.has(key)) continue
    seen.add(key)
    out.push(key)
  }
  return out
}

function answeredKeysFromQaPairs(qaPairs: QAPairV1[]): Set<string> {
  const answered = new Set<string>()
  for (const qa of qaPairs) {
    const key = typeof qa.questionKey === 'string' ? qa.questionKey.trim() : ''
    if (!key) continue
    const ans = typeof qa.answer_he === 'string' ? qa.answer_he.trim() : ''
    if (!ans) continue
    answered.add(key)
  }
  return answered
}

function normalizeUnknownAcceptedKeys(keys: unknown): Set<string> {
  if (!Array.isArray(keys)) return new Set<string>()
  return new Set(stableUnique(keys.map((k) => String(k))))
}

function normalizeDismissedOppKeys(keys: unknown): Set<string> {
  if (!Array.isArray(keys)) return new Set<string>()
  return new Set(stableUnique(keys.map((k) => String(k))))
}

function normalizeAssumptionsAccepted(list: unknown): Set<string> {
  if (!Array.isArray(list)) return new Set<string>()
  const out = new Set<string>()
  for (const item of list as AssumptionAcceptedV1[]) {
    const k = typeof item?.key === 'string' ? item.key.trim() : ''
    if (k) out.add(k)
  }
  return out
}

function toQuestion(issue: IssueV1): { id: string; textHe: string; detailHe?: string } {
  return {
    id: issue.key,
    textHe: issue.titleHe,
    detailHe: issue.detailHe,
  }
}

export function buildQuestionsBlock(args: {
  gateId?: string
  report: ValidationReportV1
  qaPairs: QAPairV1[]
  unknownAcceptedKeys?: unknown
  assumptionsAccepted?: unknown
  dismissedOppKeys?: unknown
}): QuestionsBlockV1 | null {
  const { report } = args

  const blocking = Array.isArray(report.blockingIssues) ? report.blockingIssues : []
  if (blocking.length === 0) return null

  const answered = answeredKeysFromQaPairs(Array.isArray(args.qaPairs) ? args.qaPairs : [])
  const unknownAccepted = normalizeUnknownAcceptedKeys(args.unknownAcceptedKeys)
  const assumptionsAccepted = normalizeAssumptionsAccepted(args.assumptionsAccepted)

  const remaining = blocking
    .filter((i) => i && typeof i.key === 'string')
    .filter((i) => !answered.has(i.key))
    .filter((i) => !unknownAccepted.has(i.key))
    .filter((i) => !assumptionsAccepted.has(i.key))
    .slice()
    .sort((a, b) => {
      const dw = severityWeight(b.severity) - severityWeight(a.severity)
      if (dw !== 0) return dw
      return String(a.key).localeCompare(String(b.key))
    })

  const questions = remaining.slice(0, 6).map(toQuestion)

  const dismissedOpp = normalizeDismissedOppKeys(args.dismissedOppKeys)
  const suggestions = (Array.isArray(report.opportunities) ? report.opportunities : [])
    .filter((o: any) => o && typeof o.key === 'string')
    .filter((o: any) => !dismissedOpp.has(o.key))
    .slice()
    .sort((a: any, b: any) => String(a.key).localeCompare(String(b.key)))
    .slice(0, 2)
    .map((o: any) => ({
      key: o.key,
      titleHe: o.titleHe,
      detailHe: o.detailHe,
    }))

  const gateLabel = args.gateId ? ` (${args.gateId})` : ''

  return {
    type: 'QuestionsBlock',
    titleHe: `שאלות להשלמה${gateLabel}`,
    submitLabelHe: 'שמור תשובות',
    questions,
    suggestions: suggestions.length > 0 ? suggestions : undefined,
  }
}
