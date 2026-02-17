const FALLBACK_FOOTER =
  'אפשרויות המשך: 1) שאכין תוכנית מלאה, 2) שאפעיל הבהרות ממוקדות. אפשר לענות במספר.'

function nonEmptyLines(text: string) {
  return String(text ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

function looksLikeSuggestionFooter(line: string) {
  const value = String(line ?? '').trim()
  if (!value) return false
  if (value.startsWith('אפשרויות המשך:')) return true
  if (value.startsWith('אפשרות המשך:')) return true
  if (value.startsWith('האם אתה רוצה ש')) return true
  if (value.startsWith('אם תרצה')) return true
  if (value.startsWith('אפשר להמשיך')) return true
  if (value.startsWith('בחר')) return true
  if (/^\d+[\).]/.test(value)) return true
  if (value.includes('1)') && value.includes('2)')) return true
  return false
}

export function extractSuggestionFooter(text: string): string | null {
  const lines = nonEmptyLines(text)
  if (lines.length === 0) return null
  const last = lines[lines.length - 1]
  return looksLikeSuggestionFooter(last) ? last : null
}

export function ensureSuggestionFooter(text: string) {
  const raw = String(text ?? '').trim()
  if (!raw) return FALLBACK_FOOTER
  const footer = extractSuggestionFooter(raw)
  if (footer) {
    // Keep footer concise and selectable: at most two numbered options.
    if (footer.includes('1)') && footer.includes('2)') && footer.includes('3)')) {
      const compact = footer.replace(/\s*3\)[\s\S]*$/, '').trim()
      return raw.slice(0, raw.length - footer.length) + compact
    }
    return raw
  }
  return `${raw}\n${FALLBACK_FOOTER}`
}
