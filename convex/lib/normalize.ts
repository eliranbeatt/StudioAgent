export function normalizeName(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

export function newBusinessId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`
}
