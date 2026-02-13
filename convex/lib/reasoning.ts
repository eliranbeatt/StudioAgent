export function normalizeReasoningEffort(model: string, effort: unknown) {
  const supported = new Set(['none', 'minimal', 'low', 'medium', 'high'])
  const lowerModel = String(model ?? '').toLowerCase()
  const modelRejectsNone =
    lowerModel.includes('gpt-5') ||
    lowerModel.startsWith('o1') ||
    lowerModel.startsWith('o3')

  if (typeof effort === 'string') {
    const normalized = effort.trim().toLowerCase()
    if (supported.has(normalized)) {
      if (normalized === 'none' && modelRejectsNone) return 'minimal'
      return normalized
    }
  }
  if (lowerModel.startsWith('o1') || lowerModel.startsWith('o3')) {
    return 'medium'
  }
  return undefined
}
