import type { ContextView } from './types'

export type ContextRecipe = {
  view: ContextView
  version: string
  packIds: string[]
  toolBundleId: string
}

// Skill-specific pack declarations — no blanket BASE_PACKS.
// Each skill category gets only the packs it actually needs.
const CORE_PACKS = ['project', 'knowledge']  // every skill gets project card + knowledge doc
const ELEMENT_PACKS = ['elements']
const TASK_PACKS = ['tasks']
const QA_PACKS = ['qaPairs']
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

function isV3Skill(skillId?: string) {
  if (!skillId) return false
  return skillId.startsWith('V3_')
}

function isChatSkill(skillId?: string) {
  if (!skillId) return false
  const key = skillId.toUpperCase()
  return key.includes('CHAT') || key.includes('CONSULTANT')
}

function isGapAuditSkill(skillId?: string) {
  if (!skillId) return false
  const key = skillId.toUpperCase()
  return key.includes('GAP') || key.includes('AUDIT')
}

function isInstallSkill(skillId?: string) {
  if (!skillId) return false
  const key = skillId.toUpperCase()
  return key.includes('INSTALL') || key.includes('RUNBOOK')
}

/**
 * Returns packs specific to each skill category.
 * Knowledge doc is always included (single source of truth).
 * Other packs are added only as needed.
 */
function packsForSkill(skillId?: string): string[] {
  const packs = [...CORE_PACKS]

  // Chat/consultant: full doc is enough, pull detail via tools
  if (isChatSkill(skillId)) {
    return packs
  }

  // Clarifications: needs QA for dedup
  if (isClarificationSkill(skillId)) {
    packs.push(...QA_PACKS, ...FILE_PACKS)
    return packs
  }

  // Elements builder: needs existing elements for dedup
  if (skillId?.toUpperCase().includes('ELEMENTS_BUILDER')) {
    packs.push(...ELEMENT_PACKS, ...FILE_PACKS)
    return packs
  }

  // Tasks builder: needs elements + tasks for dedup
  if (skillId?.toUpperCase().includes('TASKS_BUILDER')) {
    packs.push(...ELEMENT_PACKS, ...TASK_PACKS)
    return packs
  }

  // Accounting builder: needs tasks + accounting
  if (isAccountingSkill(skillId) || skillId?.toUpperCase().includes('ACCOUNTING_BUILDER')) {
    packs.push(...TASK_PACKS, ...ACCOUNTING_PACKS)
    return packs
  }

  // Pricing: needs accounting + catalog
  if (isPricingSkill(skillId)) {
    packs.push(...ACCOUNTING_PACKS, ...CATALOG_PACKS)
    return packs
  }

  // Quote: needs quote + accounting for totals
  if (isQuoteSkill(skillId)) {
    packs.push(...QUOTE_PACKS, ...ACCOUNTING_PACKS)
    return packs
  }

  // Gap audit: full picture
  if (isGapAuditSkill(skillId)) {
    packs.push(...ELEMENT_PACKS, ...TASK_PACKS, ...QA_PACKS)
    return packs
  }

  // Install/runbook: tasks + elements for logistics
  if (isInstallSkill(skillId)) {
    packs.push(...ELEMENT_PACKS, ...TASK_PACKS)
    return packs
  }

  // File-heavy: file packs
  if (isFileHeavySkill(skillId)) {
    packs.push(...FILE_PACKS)
    return packs
  }

  // Builder skills (catch-all): elements + tasks + files
  if (isBuilderSkill(skillId)) {
    packs.push(...ELEMENT_PACKS, ...TASK_PACKS, ...FILE_PACKS)
    return packs
  }

  // Unknown skill: conservative — elements + tasks + QA
  packs.push(...ELEMENT_PACKS, ...TASK_PACKS, ...QA_PACKS)
  return packs
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
    agentData?: boolean
  }
}): ContextRecipe {
  if (isV3Skill(args.skillId)) {
    const toolBundleId = [
      args.allowedTools?.webSearch ? 'web' : null,
      args.allowedTools?.ragSearch ? 'rag' : null,
      args.allowedTools?.fileInspect ? 'files' : null,
      args.allowedTools?.runSkill ? 'skill' : null,
      args.allowedTools?.agentData ? 'data' : null,
    ]
      .filter(Boolean)
      .join('+') || 'none'

    return {
      view: 'project_core_v1',
      version: 'v3',
      packIds: ['v3RunMeta'],
      toolBundleId,
    }
  }

  const packIds = packsForSkill(args.skillId)

  const toolBundleId = [
    args.allowedTools?.webSearch ? 'web' : null,
    args.allowedTools?.ragSearch ? 'rag' : null,
    args.allowedTools?.fileInspect ? 'files' : null,
    args.allowedTools?.runSkill ? 'skill' : null,
    args.allowedTools?.agentData ? 'data' : null,
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
