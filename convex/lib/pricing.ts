
export const MODEL_PRICING = [
    { key: 'gpt-5.2-pro', label: 'gpt-5.2-pro', input: 21.0, cachedInput: null, output: 168.0, reasoning: 168.0 },
    { key: 'gpt-5.2', label: 'gpt-5.2', input: 1.75, cachedInput: 0.175, output: 14.0, reasoning: 14.0 },
    { key: 'gpt-5.1', label: 'gpt-5.1', input: 1.25, cachedInput: 0.125, output: 10.0, reasoning: 10.0 },
    { key: 'gpt-5', label: 'gpt-5', input: 1.25, cachedInput: 0.125, output: 10.0, reasoning: 10.0 },
    { key: 'gpt-5-mini', label: 'gpt-5-mini', input: 0.25, cachedInput: 0.025, output: 2.0, reasoning: 2.0 },
    { key: 'gpt-5-nano', label: 'gpt-5-nano', input: 0.05, cachedInput: 0.005, output: 0.4, reasoning: 0.4 },
    { key: 'gpt-4o-mini', label: 'gpt-4o-mini', input: 0.15, cachedInput: null, output: 0.6, reasoning: 0.6 },
    { key: 'gpt-4o', label: 'gpt-4o', input: 2.5, cachedInput: null, output: 10.0, reasoning: 10.0 },
    { key: 'o1-mini', label: 'o1-mini', input: 3.0, cachedInput: null, output: 12.0, reasoning: 12.0 },
    { key: 'o1-preview', label: 'o1-preview', input: 15.0, cachedInput: null, output: 60.0, reasoning: 60.0 },
    { key: 'o1', label: 'o1', input: 15.0, cachedInput: null, output: 60.0, reasoning: 60.0 }
];

const normalizeModelKey = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "")

const resolvePricing = (model: string) => {
    const normalized = normalizeModelKey(model)
    // Sort by length desc to match most specific first
    const sorted = [...MODEL_PRICING].sort((a, b) => b.key.length - a.key.length)
    return sorted.find((entry) => normalized.includes(normalizeModelKey(entry.key))) || null
}

export const calculateCost = (params: {
    model: string
    inputTokens: number
    outputTokens: number
    cachedInputTokens?: number
}) => {
    const pricing = resolvePricing(params.model)
    if (!pricing) return null

    const cachedInputTokens = Math.min(params.cachedInputTokens || 0, params.inputTokens)
    const billableInputTokens = Math.max(params.inputTokens - cachedInputTokens, 0)
    const cachedRate = pricing.cachedInput ?? pricing.input

    const cost =
        (billableInputTokens / 1_000_000) * pricing.input +
        (cachedInputTokens / 1_000_000) * cachedRate +
        (params.outputTokens / 1_000_000) * pricing.output

    return cost
}
