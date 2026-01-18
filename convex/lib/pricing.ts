
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

// ==========================
// CATALOG PRICING ENGINE
// ==========================

export const calculateFormulaPrice = (
  formula: { formulaType: string; params: any },
  inputParams: { widthMm?: number; heightMm?: number; lamination?: boolean; machineHours?: number }
) => {
  if (!formula || !formula.params) return null;

  if (formula.formulaType === "print_m2") {
    const widthM = (inputParams.widthMm || 0) / 1000;
    const heightM = (inputParams.heightMm || 0) / 1000;
    const areaM2 = widthM * heightM;
    
    if (areaM2 <= 0) return null;

    let cost = areaM2 * (Number(formula.params.baseRatePerM2) || 0);

    if (inputParams.lamination) {
      cost += areaM2 * (Number(formula.params.laminationAddPerM2) || 0);
    }

    if (formula.params.minCharge) {
      cost = Math.max(cost, Number(formula.params.minCharge));
    }

    if (formula.params.setupFee) {
      cost += Number(formula.params.setupFee);
    }

    return cost;
  }

  if (formula.formulaType === "cnc_cut") {
    const setup = Number(formula.params.setupFee || 0);
    const machineRate = Number(formula.params.machineRatePerHour || 0);
    const hours = Number(inputParams.machineHours || 0);
    return setup + (machineRate * hours);
  }

  return null;
};

