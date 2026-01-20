type BrainDumpStructuredDraftV1 = {
  version: 1
  extractedAt: number
  rawHash: string
  summaryLines: string[]
  contacts: {
    emails: string[]
    phones: string[]
  }
  hints: {
    budgetNis?: number
    dueDateText?: string
    locationText?: string
  }
  keywords: string[]
}

function fnv1a32(input: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i)
    hash = (hash * 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

function normalizeLines(raw: string): string[] {
  return raw
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
}

function stableUnique(items: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const item of items) {
    const key = item.trim()
    if (!key) continue
    if (seen.has(key)) continue
    seen.add(key)
    out.push(key)
  }
  return out
}

function extractEmails(text: string): string[] {
  const matches = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? []
  return stableUnique(matches.map((m) => m.toLowerCase())).sort((a, b) => a.localeCompare(b))
}

function extractPhones(text: string): string[] {
  const matches = text.match(/(?:\+?972[- ]?)?(?:0)?\d[- ]?\d{7,8}/g) ?? []
  const normalized = matches
    .map((m) => m.replace(/\s+/g, ' ').trim())
    .map((m) => m.replace(/[- ]+/g, '-'))
  return stableUnique(normalized).sort((a, b) => a.localeCompare(b))
}

function extractBudgetNis(text: string): number | undefined {
  const m = text.match(/(?:תקציב|budget)[^0-9]{0,20}([0-9][0-9,._\s]{0,15})/i)
  if (!m) return undefined

  const raw = m[1]
    .replace(/[_\s]/g, '')
    .replace(/,/g, '')
    .replace(/\.(?=.*\.)/g, '')

  const n = Number(raw)
  if (!Number.isFinite(n)) return undefined
  if (n <= 0) return undefined
  return Math.round(n)
}

function extractDueDateText(lines: string[]): string | undefined {
  const dueLine = lines.find((l) => /(?:תאריך|עד|דדליין|deadline|ביצוע)/i.test(l))
  return dueLine ? dueLine.slice(0, 120) : undefined
}

function extractLocationText(lines: string[]): string | undefined {
  const locLine = lines.find((l) => /(?:כתובת|מיקום|עיר|יישוב|location|address)/i.test(l))
  return locLine ? locLine.slice(0, 120) : undefined
}

function extractKeywords(lines: string[]): string[] {
  const joined = lines.join(' | ').toLowerCase()
  const candidates = [
    'התקנה',
    'פירוק',
    'הובלה',
    'לוגיסטיקה',
    'חשמל',
    'תאורה',
    'נגרות',
    'ברזל',
    'צביעה',
    'מדידה',
    'site',
    'install',
    'delivery',
    'paint',
    'electric',
    'carpentry',
  ]

  const found = candidates.filter((k) => joined.includes(k))
  return stableUnique(found).sort((a, b) => a.localeCompare(b))
}

export function extractBrainDumpStructuredDraft(raw: string): BrainDumpStructuredDraftV1 | null {
  const normalizedRaw = (raw ?? '').trim()
  if (!normalizedRaw) return null

  const lines = normalizeLines(normalizedRaw)
  const limitedLines = lines.slice(0, 80)

  const emails = extractEmails(normalizedRaw)
  const phones = extractPhones(normalizedRaw)

  return {
    version: 1,
    extractedAt: Date.now(),
    rawHash: fnv1a32(normalizedRaw),
    summaryLines: limitedLines.slice(0, 12),
    contacts: {
      emails,
      phones,
    },
    hints: {
      budgetNis: extractBudgetNis(normalizedRaw),
      dueDateText: extractDueDateText(limitedLines),
      locationText: extractLocationText(limitedLines),
    },
    keywords: extractKeywords(limitedLines),
  }
}
