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
  continueAction?: {
    labelHe: string
    payload?: { targetSkillId?: string }
  }
  followupAction?: {
    labelHe: string
    payload?: { targetSkillId?: string }
  }
  freeTextTitleHe?: string
  freeTextPromptHe?: string
  questions: Array<{
    id: string
    textHe: string
    detailHe?: string
    type?: 'text' | 'date' | 'number' | 'single' | 'multi' | 'toggle'
    optionsHe?: string[]
    topicKey?: string
  }>
  suggestions?: Array<{ key: string; titleHe: string; detailHe?: string }>
  hideSuggestions?: boolean
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

const FRIENDLY_QUESTION_MAP: Record<string, string> = {
  'pricing.material.unit_cost_missing_or_invalid': 'חלק משורות החומר חסרות מחיר יחידה. האם לאשר הערכה אוטומטית?',
  'pricing.material.total_cost_missing_or_invalid': 'יש שורות חומר ללא מחיר כולל. האם לחשב אוטומטית לפי הכמות?',
  'pricing.material.provenance_missing': 'חסר מקור מחיר (ספק/לינק) לחלק מהשורות. האם להשתמש בהערכות?',
  'pricing.material.checked_at_missing': 'תאריך בדיקת המחיר חסר. האם לאשר שימוש במחירים קיימים?',
  'pricing.material.confidence_missing': 'חסר ציון ביטחון (Confidence) למחירים. האם להגדיר כנמוך ולהמשיך?',
  'pricing.work.unit_cost_missing_or_invalid': 'חסרה הערכת עלות לשעות עבודה. האם להשלים לפי תעריף ברירת מחדל?',
  'pricing.work.total_cost_missing_or_invalid': 'יש שורות עבודה ללא מחיר כולל. האם לחשב אוטומטית?',
}

function toQuestion(issue: IssueV1): {
  id: string
  textHe: string
  detailHe?: string
  type?: 'text' | 'date' | 'number' | 'single' | 'multi' | 'toggle'
  optionsHe?: string[]
  topicKey?: string
} {
  const rawIssue = issue as any
  const friendlyText = FRIENDLY_QUESTION_MAP[issue.key] ?? issue.titleHe
  return {
    id: issue.key,
    textHe: friendlyText,
    detailHe: issue.detailHe,
    type: rawIssue.type ?? 'text',
    optionsHe: Array.isArray(rawIssue.optionsHe) ? rawIssue.optionsHe : undefined,
    topicKey: typeof rawIssue.topicKey === 'string' ? rawIssue.topicKey : undefined,
  }
}

function issueDomain(issue: IssueV1): string {
  const key = String(issue.key || '').trim()
  if (!key) return 'general'
  const [domain] = key.split('.')
  return domain || 'general'
}

function issueSort(a: IssueV1, b: IssueV1): number {
  const dw = severityWeight(b.severity) - severityWeight(a.severity)
  if (dw !== 0) return dw
  return String(a.key).localeCompare(String(b.key))
}

export function buildQuestionsBlock(args: {
  gateId?: string
  report: ValidationReportV1
  qaPairs: QAPairV1[]
  unknownAcceptedKeys?: unknown
  assumptionsAccepted?: unknown
  dismissedOppKeys?: unknown
  hideSuggestions?: boolean
}): QuestionsBlockV1 | null {
  const { report } = args

  const blocking = Array.isArray(report.blockingIssues) ? report.blockingIssues : []
  if (blocking.length === 0) return null

  const answered = answeredKeysFromQaPairs(Array.isArray(args.qaPairs) ? args.qaPairs : [])
  const unknownAccepted = normalizeUnknownAcceptedKeys(args.unknownAcceptedKeys)
  const assumptionsAccepted = normalizeAssumptionsAccepted(args.assumptionsAccepted)

  const remaining = blocking
    .filter((i) => i && typeof i.key === 'string')
    .filter((i) => (i as any)?.askUser === true)
    .filter((i) => {
      const key = String(i.key || '')
      if (!key) return true
      if (key === 'elements.none') return false
      if (key === 'tasks.none') return false
      if (key === 'accounting.none') return false
      if (key === 'pricing.none') return false
      if (key === 'quote.missing') return false
      if (key === 'audit.quote.missing') return false
      return true
    })
    .filter((i) => !answered.has(i.key))
    .filter((i) => !unknownAccepted.has(i.key))
    .filter((i) => !assumptionsAccepted.has(i.key))
    .slice()
    .sort(issueSort)

  const domainBuckets = new Map<string, IssueV1[]>()
  for (const issue of remaining) {
    const domain = issueDomain(issue)
    const list = domainBuckets.get(domain) ?? []
    list.push(issue)
    domainBuckets.set(domain, list)
  }

  for (const list of domainBuckets.values()) {
    list.sort(issueSort)
  }

  const domainOrder = Array.from(domainBuckets.entries())
    .map(([domain, list]) => ({ domain, maxSeverity: list[0]?.severity ?? 'LOW' }))
    .sort((a, b) => {
      const dw = severityWeight(b.maxSeverity) - severityWeight(a.maxSeverity)
      if (dw !== 0) return dw
      return a.domain.localeCompare(b.domain)
    })

  const prioritized: IssueV1[] = []
  const leftovers: IssueV1[] = []

  for (const { domain } of domainOrder) {
    const list = domainBuckets.get(domain) ?? []
    if (list.length === 0) continue
    const [first, ...rest] = list
    prioritized.push(first)
    leftovers.push(...rest)
  }

  leftovers.sort(issueSort)
  const questions = [...prioritized, ...leftovers].slice(0, 6).map(toQuestion)

  const dismissedOpp = normalizeDismissedOppKeys(args.dismissedOppKeys)
  const suggestions = args.hideSuggestions
    ? []
    : (Array.isArray(report.opportunities) ? report.opportunities : [])
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
    continueAction: { labelHe: 'Submit and skip to next level' },
    followupAction: { labelHe: 'Submit and ask more' },
    freeTextTitleHe: '???????? ??????????',
    freeTextPromptHe: '?????????? ????????????...',
    questions,
    suggestions: suggestions.length > 0 ? suggestions : undefined,
    hideSuggestions: !!args.hideSuggestions
  }
}
