import { VNextStageKey, VNEXT_STAGE_ORDER } from './contracts'

export const VNEXT_STAGE_META: Record<VNextStageKey, { titleEn: string; titleHe: string }> = {
  brief: { titleEn: 'Brief & Constraints', titleHe: 'בריף ואילוצים' },
  scope: { titleEn: 'Scope Lock', titleHe: 'נעילת אלמנטים' },
  concept: { titleEn: 'Concepts', titleHe: 'קונספטים וכיוונים' },
  tasks: { titleEn: 'Task Breakdown', titleHe: 'פירוק למשימות' },
  budget: { titleEn: 'Budget Binding', titleHe: 'קישור תקציב למשימות' },
  pricing: { titleEn: 'Price Evidence', titleHe: 'אימות מחירים' },
  ops: { titleEn: 'Execution & Logistics', titleHe: 'תוכנית ביצוע ולוגיסטיקה' },
  quote: { titleEn: 'Quote Draft', titleHe: 'טיוטת הצעת מחיר' },
  audit: { titleEn: 'Quality Audit', titleHe: 'ביקורת איכות' },
  compile: { titleEn: 'Approval Package', titleHe: 'מוכן לאישור' },
}

export const VNEXT_STAGE_SKILLS: Record<VNextStageKey, string[]> = {
  brief: ['intake.parse_brief', 'clarify.next_questions'],
  scope: ['plan.elements'],
  concept: ['chat.free'],
  tasks: ['plan.tasks'],
  budget: ['cost.build_budget'],
  pricing: ['pricing.resolve_lines'],
  ops: ['plan.execution_phases', 'runbook.installation', 'ops.daily_plan'],
  quote: ['quote.generate'],
  audit: ['audit.project'],
  compile: [],
}

export function normalizeVNextStage(value: unknown): VNextStageKey {
  const raw = String(value ?? '').trim().toLowerCase()
  if ((VNEXT_STAGE_ORDER as readonly string[]).includes(raw)) {
    return raw as VNextStageKey
  }
  return 'brief'
}

export function getNextVNextStage(stageKey: VNextStageKey): VNextStageKey | null {
  const index = VNEXT_STAGE_ORDER.indexOf(stageKey)
  if (index < 0 || index >= VNEXT_STAGE_ORDER.length - 1) return null
  return VNEXT_STAGE_ORDER[index + 1]
}

