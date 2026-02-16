export function normalizeReasoningEffort(model: string, effort: unknown) {
  const supported = new Set(['none', 'minimal', 'low', 'medium', 'high', 'xhigh'])
  const lowerModel = String(model ?? '').toLowerCase()
  const isGpt5 = lowerModel.includes('gpt-5')
  const gpt5Supported = new Set(['minimal', 'low', 'medium', 'high'])

  if (typeof effort === 'string') {
    const normalized = effort.trim().toLowerCase()
    if (isGpt5) {
      if (normalized === 'none') return 'minimal'
      if (normalized === 'xhigh') return 'high'
      if (gpt5Supported.has(normalized)) return normalized
      return undefined
    }
    if (supported.has(normalized)) {
      return normalized
    }
  }
  if (lowerModel.startsWith('o1') || lowerModel.startsWith('o3')) {
    return 'medium'
  }
  return undefined
}
