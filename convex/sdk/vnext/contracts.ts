import { Id } from '../../_generated/dataModel'

export const VNEXT_STAGE_ORDER = [
  'brief',
  'scope',
  'concept',
  'tasks',
  'budget',
  'pricing',
  'ops',
  'quote',
  'audit',
  'compile',
] as const

export type VNextStageKey = (typeof VNEXT_STAGE_ORDER)[number]

export type QuestionBlockOption = {
  value: string
  labelHe: string
}

export type QuestionBlock = {
  id: string
  textHe: string
  type?: 'text' | 'date' | 'select' | 'number'
  optionsHe?: string[]
  options?: QuestionBlockOption[]
  suggestedAnswers?: QuestionBlockOption[]
  allowDontKnow?: boolean
}

export type GateIssue = {
  code: string
  messageHe: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  question?: QuestionBlock
}

export type GateResult = {
  status: 'pass' | 'fail'
  issues: GateIssue[]
  blockingQuestions: QuestionBlock[]
}

export type TargetPlanSpec = {
  projectId: Id<'projects'>
  constraints: {
    eventDate?: string
    location?: string
    venueType?: 'mall' | 'studio' | 'outdoor' | 'other'
    budgetCeilingNIS?: number
    requiredElementCount?: number
  }
  keys: {
    scopeHash: string
    promptCacheKey: string
  }
  scope: {
    locked: boolean
    elements: Array<{
      elementKey: string
      nameHe: string
      mustInclude: boolean
    }>
  }
  decisions: {
    conceptChoiceByElementKey: Record<string, string | null>
    acceptedAssumptionsHe: string[]
  }
  coverageRules: {
    requireOpsLogistics: boolean
    requirePrintingQA: boolean
    requireTeardown: boolean
  }
}

export type PlannedTask = {
  elementKey?: string
  titleHe: string
  durationHours?: number
  category?: string
}

export type StageArtifactMap = {
  brief?: { questions?: QuestionBlock[]; normalizedFacts?: Record<string, any> }
  scope?: { proposedElements?: Array<{ nameHe: string; elementKey: string; rationaleHe?: string }> }
  concept?: { directions?: Array<{ elementKey: string; optionsHe: string[] }> }
  tasks?: { tasks?: PlannedTask[] }
  budget?: Record<string, any>
  pricing?: Record<string, any>
  ops?: Record<string, any>
  quote?: Record<string, any>
  audit?: Record<string, any>
  compile?: Record<string, any>
}

export type VNextStageRunOutput = {
  stageKey: VNextStageKey
  status: 'done' | 'needs_input' | 'partial_progress' | 'blocked_error' | 'completed'
  blocks: any[]
  nextStageKey?: VNextStageKey
  telemetry?: Record<string, any>
}

export type VNextStageProgressMeta = {
  progressKey: string
  progressCount: number
  noProgressCount: number
  lastProgressAt?: number
}
