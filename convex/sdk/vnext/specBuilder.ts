import { TargetPlanSpec } from './contracts'

type StageDecisionLike = {
  stageKey?: string
  decisionType?: string
  payload?: {
    answersById?: Record<string, string>
    freeText?: string
  }
}

function stableHash(input: string) {
  let h = 2166136261
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return `h${(h >>> 0).toString(16)}`
}

function normalizeText(value: unknown) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
}

function isUnknownAnswer(value: unknown) {
  const normalized = normalizeText(value)
  if (!normalized) return false
  // Canonical marker from UI chips
  if (normalized === '__dont_know__') return true
  return (
    normalized.includes('unknown') ||
    normalized.includes('tbd') ||
    normalized.includes('not sure') ||
    normalized.includes('not known') ||
    normalized.includes('n/a') ||
    // Hebrew unknown terms
    normalized.includes('לא ידוע') ||
    normalized.includes('לא יודע') ||
    normalized.includes('לא בטוח') ||
    normalized.includes('טרם נקבע')
  )
}

function parseNumberFromText(value: unknown) {
  const text = String(value ?? '')
  if (!text.trim()) return undefined

  const stripped = text.replace(/[^\d.-]/g, '')
  const direct = Number(stripped)
  if (Number.isFinite(direct) && direct > 0) return direct

  const match = text.match(/(\d+(?:\.\d+)?)/)
  if (!match?.[1]) return undefined
  const parsed = Number(match[1])
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined
  return parsed
}

function parseDateFromText(value: unknown) {
  const text = String(value ?? '').trim()
  if (!text) return undefined

  // DD/MM/YYYY or DD.MM.YYYY
  const ddmmyyyy = text.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/)
  if (ddmmyyyy) {
    const [, dd, mm, yyyy] = ddmmyyyy
    const iso = `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`
    const parsed = new Date(iso)
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString()
  }

  // YYYY-MM-DD (native support, but be explicit)
  const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (isoMatch) {
    const parsed = new Date(text)
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString()
  }

  // Fallback: native Date parsing
  const asDate = new Date(text)
  if (Number.isNaN(asDate.getTime())) return undefined
  return asDate.toISOString()
}

function parseRequiredElementCount(texts: string[]) {
  for (const text of texts) {
    const patterns = [
      /(?:exactly)\s*(\d{1,2})/i,
      /(\d{1,2})\s*(?:elements?)/i,
    ]
    for (const pattern of patterns) {
      const matches = text.match(pattern)
      if (!matches?.[1]) continue
      const parsed = Number(matches[1])
      if (Number.isFinite(parsed) && parsed > 0) return parsed
    }
  }
  return undefined
}

function collectAnswerInputs(stageDecisions: StageDecisionLike[]) {
  const mergedAnswers: Record<string, string> = {}
  const freeTexts: string[] = []
  const acceptedAssumptions = new Set<string>()

  for (const decision of stageDecisions) {
    if (decision?.decisionType !== 'answers') continue

    const answersById = decision.payload?.answersById ?? {}
    for (const [key, value] of Object.entries(answersById)) {
      mergedAnswers[key] = value

      if (key === 'event_date' && isUnknownAnswer(value)) {
        acceptedAssumptions.add('eventDateUnknown')
      }
      if (key === 'location' && isUnknownAnswer(value)) {
        acceptedAssumptions.add('locationUnknown')
      }
      if (key === 'budget' && isUnknownAnswer(value)) {
        acceptedAssumptions.add('budgetUnknown')
      }
    }

    const freeText = decision.payload?.freeText
    if (typeof freeText === 'string' && freeText.trim()) {
      freeTexts.push(freeText.trim())
    }
  }

  return {
    mergedAnswers,
    freeTexts,
    acceptedAssumptionsHe: [...acceptedAssumptions],
  }
}

export function buildTargetPlanSpec(args: {
  projectId: any
  project: any
  recentUserTexts: string[]
  stageDecisions?: StageDecisionLike[]
  existingScopeElements?: Array<{ elementKey: string; nameHe: string; mustInclude?: boolean }>
  qaPairAnswers?: Record<string, string>
}): TargetPlanSpec {
  const orderedDecisions = [...(args.stageDecisions ?? [])].reverse()
  const answerInputs = collectAnswerInputs(orderedDecisions)

  // Merge qaPair fallback answers for keys not already in stage decisions
  const fallback = args.qaPairAnswers ?? {}
  for (const [key, value] of Object.entries(fallback)) {
    if (!answerInputs.mergedAnswers[key] && value) {
      answerInputs.mergedAnswers[key] = value
      // Also check for unknown answers from fallback
      if (key === 'event_date' && isUnknownAnswer(value)) {
        if (!answerInputs.acceptedAssumptionsHe.includes('eventDateUnknown')) {
          answerInputs.acceptedAssumptionsHe.push('eventDateUnknown')
        }
      }
      if (key === 'location' && isUnknownAnswer(value)) {
        if (!answerInputs.acceptedAssumptionsHe.includes('locationUnknown')) {
          answerInputs.acceptedAssumptionsHe.push('locationUnknown')
        }
      }
      if (key === 'budget' && isUnknownAnswer(value)) {
        if (!answerInputs.acceptedAssumptionsHe.includes('budgetUnknown')) {
          answerInputs.acceptedAssumptionsHe.push('budgetUnknown')
        }
      }
    }
  }

  const eventDateFromAnswers =
    parseDateFromText(answerInputs.mergedAnswers.event_date) ??
    parseDateFromText(answerInputs.mergedAnswers.eventDate)

  const locationFromAnswers =
    answerInputs.mergedAnswers.location ??
    answerInputs.mergedAnswers.venue_location

  const budgetFromAnswers =
    parseNumberFromText(answerInputs.mergedAnswers.budget) ??
    parseNumberFromText(answerInputs.mergedAnswers.budget_ceiling_nis)

  const requiredElementCount =
    parseNumberFromText(answerInputs.mergedAnswers.required_element_count) ??
    parseNumberFromText(answerInputs.mergedAnswers.scope_count) ??
    parseRequiredElementCount([...(args.recentUserTexts ?? []), ...answerInputs.freeTexts])

  const scopeElements = (args.existingScopeElements ?? []).map((item) => ({
    elementKey: item.elementKey,
    nameHe: item.nameHe,
    mustInclude: Boolean(item.mustInclude),
  }))

  const scopeHash = stableHash(
    JSON.stringify({
      requiredElementCount,
      scopeElements,
      projectName: args.project?.name ?? '',
      eventDate: eventDateFromAnswers ?? args.project?.eventDate ?? '',
      location: locationFromAnswers ?? args.project?.details?.location ?? args.project?.location ?? '',
    })
  )

  return {
    projectId: args.projectId,
    constraints: {
      eventDate: eventDateFromAnswers ?? args.project?.eventDate,
      location: locationFromAnswers ?? args.project?.details?.location ?? args.project?.location,
      venueType: 'other',
      budgetCeilingNIS: budgetFromAnswers ?? args.project?.details?.budgetCap,
      requiredElementCount,
    },
    keys: {
      scopeHash,
      promptCacheKey: `sdk_vnext:${args.projectId}:${scopeHash}`,
    },
    scope: {
      locked: scopeElements.length > 0,
      elements: scopeElements,
    },
    decisions: {
      conceptChoiceByElementKey: {},
      acceptedAssumptionsHe: answerInputs.acceptedAssumptionsHe,
    },
    coverageRules: {
      requireOpsLogistics: true,
      requirePrintingQA: true,
      requireTeardown: true,
    },
  }
}
