export type ChatIntent =
  | 'chat_smalltalk'
  | 'project_read_qna'
  | 'project_write_change'
  | 'planning_request'
  | 'explicit_skill_run'
  | 'audit_request'

const SMALLTALK_PATTERNS = [
  'hi',
  'hello',
  'hey',
  'shalom',
  'yo',
  'what\'s up',
  'how are you',
  'מה קורה',
  'היי',
  'שלום',
]

const READ_PATTERNS = [
  'show',
  'list',
  'what',
  'status',
  'summary',
  'summarize',
  'tasks',
  'priorities',
  'elements',
  'budget',
  'quote',
  'project',
  'הצג',
  'רשימה',
  'סיכום',
  'סטטוס',
  'משימות',
  'תקציב',
]

const WRITE_PATTERNS = [
  'change',
  'update',
  'edit',
  'set',
  'replace',
  'delete',
  'create',
  'add',
  'remove',
  'modify',
  'שנה',
  'עדכן',
  'ערוך',
  'צור',
  'הוסף',
  'מחק',
]

const PLANNING_PATTERNS = [
  'build budget',
  'create budget',
  'make budget',
  'generate quote',
  'build quote',
  'create quote',
  'generate elements',
  'create elements',
  'generate tasks',
  'create tasks',
  'runbook',
  'אלמנטים',
  'משימות',
  'בנה תקציב',
  'צור תקציב',
  'צור הצעת מחיר',
  'בנה הצעת מחיר',
]

const EXPLICIT_SKILL_PATTERNS = [
  'run ',
  'execute ',
  'use tool',
  'use skill',
  'call ',
  'הפעל',
  'תריץ',
]

const AUDIT_PATTERNS = [
  'audit',
  'review project',
  'critique',
  'בדיקה',
  'אודיט',
  'בקרת איכות',
]

function includesAny(text: string, patterns: string[]) {
  return patterns.some((pattern) => text.includes(pattern))
}

function looksLikeSmalltalk(text: string) {
  const trimmed = text.trim()
  if (!trimmed) return true
  if (trimmed.length <= 4) return true
  return includesAny(text, SMALLTALK_PATTERNS)
}

export function detectChatIntent(userText: string): ChatIntent {
  const text = String(userText ?? '').trim().toLowerCase()
  if (!text) return 'chat_smalltalk'
  if (includesAny(text, AUDIT_PATTERNS)) return 'audit_request'
  if (includesAny(text, EXPLICIT_SKILL_PATTERNS)) return 'explicit_skill_run'
  if (includesAny(text, PLANNING_PATTERNS)) return 'planning_request'
  if (includesAny(text, WRITE_PATTERNS)) return 'project_write_change'
  if (includesAny(text, READ_PATTERNS)) return 'project_read_qna'
  if (looksLikeSmalltalk(text)) return 'chat_smalltalk'
  return 'project_read_qna'
}

export function packsForIntent(intent: ChatIntent, userText: string): string[] {
  const text = String(userText ?? '').toLowerCase()
  if (intent === 'chat_smalltalk') return []
  if (intent === 'project_read_qna') {
    if (text.includes('task') || text.includes('משימ')) return ['project', 'tasks', 'elements']
    if (text.includes('budget') || text.includes('תקציב')) return ['project', 'accounting', 'tasks', 'elements']
    if (text.includes('quote') || text.includes('הצעת')) return ['project', 'quote', 'accounting']
    return ['project', 'knowledge']
  }
  if (intent === 'audit_request') return ['project', 'elements', 'tasks', 'accounting', 'quote']
  if (intent === 'planning_request' || intent === 'project_write_change' || intent === 'explicit_skill_run') {
    return ['project', 'elements', 'tasks', 'accounting', 'quote', 'knowledge']
  }
  return ['project', 'knowledge']
}

export function allowedToolsForChatIntent(intent: ChatIntent): string[] {
  if (intent === 'chat_smalltalk') return []
  if (intent === 'project_read_qna') return ['context.get']
  if (intent === 'audit_request') return ['context.get', 'audit.project']
  if (intent === 'planning_request') {
    return [
      'context.get',
      'plan.elements',
      'plan.tasks',
      'cost.build_budget',
      'quote.generate',
      'clarify.next_questions',
      'knowledge.summarize_or_update',
    ]
  }
  if (intent === 'project_write_change') {
    return [
      'context.get',
      'changeset.compile',
      'changeset.review',
      'changeset.apply',
      'plan.elements',
      'plan.tasks',
      'cost.build_budget',
      'quote.generate',
      'clarify.next_questions',
      'knowledge.summarize_or_update',
      'admin.set_labor_rates',
      'admin.confirm_measurements',
    ]
  }
  if (intent === 'explicit_skill_run') {
    return [
      'context.get',
      'plan.elements',
      'plan.tasks',
      'cost.build_budget',
      'quote.generate',
      'changeset.compile',
      'changeset.review',
      'changeset.apply',
      'clarify.next_questions',
      'pricing.resolve_lines',
      'procurement.shopping_plan',
      'finance.ingest_receipt',
      'qa.print_files',
      'runbook.installation',
      'ops.daily_plan',
      'knowledge.summarize_or_update',
      'admin.set_labor_rates',
      'admin.confirm_measurements',
    ]
  }
  return ['context.get']
}

export function shouldAttachSuggestions(args: {
  intent: ChatIntent | 'planning_flow'
  userText: string
  summaryHe?: string
}) {
  if (args.intent === 'chat_smalltalk') return false
  const source = `${args.userText ?? ''} ${args.summaryHe ?? ''}`.toLowerCase()
  if (source.includes('?') || source.includes('next') || source.includes('הבא')) return true
  if (args.intent === 'project_write_change' || args.intent === 'planning_request') return true
  return false
}
