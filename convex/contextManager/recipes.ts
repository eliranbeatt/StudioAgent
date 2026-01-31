import type { ContextView } from './types'

export type ContextRecipe = {
  view: ContextView
  version: string
  packIds: string[]
  toolBundleId: string
}

const BASE_PACKS = ['project', 'elements', 'tasks', 'qaPairs', 'userInput', 'memories']
const ACCOUNTING_PACKS = ['accounting']
const QUOTE_PACKS = ['quote']
const FILE_PACKS = ['files']
const CATALOG_PACKS = ['catalog']

function isPricingSkill(skillId?: string) {
  if (!skillId) return false
  const key = skillId.toUpperCase()
  return key.includes('PRICING') || key.includes('PRICE') || key.includes('CATALOG')
}

function isQuoteSkill(skillId?: string) {
  if (!skillId) return false
  const key = skillId.toUpperCase()
  return key.includes('QUOTE')
}

function isAccountingSkill(skillId?: string) {
  if (!skillId) return false
  const key = skillId.toUpperCase()
  return key.includes('ACCOUNTING') || key.includes('BOM')
}

function isBuilderSkill(skillId?: string) {
  if (!skillId) return false
  const key = skillId.toUpperCase()
  return key.includes('ELEMENTS_BUILDER') || key.includes('TASKS_BUILDER') || key.includes('ACCOUNTING_BUILDER')
}

function isClarificationSkill(skillId?: string) {
  if (!skillId) return false
  const key = skillId.toUpperCase()
  return key.includes('CLARIFICATIONS_GATE') || key.includes('CONTEXT_GENERATION')
}

function isFileHeavySkill(skillId?: string) {
  if (!skillId) return false
  const key = skillId.toUpperCase()
  return key.includes('FILE') || key.includes('IMPORT')
}

export function getRecipeForSkill(args: {
  skillId?: string
  allowedTools?: {
    webSearch?: boolean
    ragSearch?: boolean
    fileInspect?: boolean
    runSkill?: boolean
    generateQuote?: boolean
    estimateTasks?: boolean
  }
}): ContextRecipe {
  const packIds = [...BASE_PACKS]

  if (isAccountingSkill(args.skillId)) {
    packIds.push(...ACCOUNTING_PACKS)
  }

  if (isPricingSkill(args.skillId)) {
    packIds.push(...ACCOUNTING_PACKS, ...CATALOG_PACKS)
  }

  if (isQuoteSkill(args.skillId)) {
    packIds.push(...QUOTE_PACKS, ...ACCOUNTING_PACKS)
  }

  if (isFileHeavySkill(args.skillId) || isBuilderSkill(args.skillId) || isClarificationSkill(args.skillId)) {
    packIds.push(...FILE_PACKS)
  }

  const toolBundleId = [
    args.allowedTools?.webSearch ? 'web' : null,
    args.allowedTools?.ragSearch ? 'rag' : null,
    args.allowedTools?.fileInspect ? 'files' : null,
    args.allowedTools?.runSkill ? 'skill' : null,
  ]
    .filter(Boolean)
    .join('+') || 'none'

  return {
    view: 'project_core_v1',
    version: 'v1',
    packIds: Array.from(new Set(packIds)),
    toolBundleId,
  }
}
