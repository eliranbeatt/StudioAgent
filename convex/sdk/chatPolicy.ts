export type ChatIntent =
  | 'chat_smalltalk'
  | 'project_read_qna'
  | 'project_write_change'
  | 'planning_request'
  | 'explicit_skill_run'
  | 'audit_request'
  | 'deep_research'

const SMALLTALK_PATTERNS = [
  'hi',
  'hello',
  'hey',
  'shalom',
  'yo',
  "what's up",
  'how are you',
  '\u05de\u05d4 \u05e7\u05d5\u05e8\u05d4',
  '\u05d4\u05d9\u05d9',
  '\u05e9\u05dc\u05d5\u05dd',
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
  '\u05d4\u05e6\u05d2',
  '\u05e8\u05e9\u05d9\u05de\u05d4',
  '\u05e1\u05d9\u05db\u05d5\u05dd',
  '\u05e1\u05d8\u05d8\u05d5\u05e1',
  '\u05de\u05e9\u05d9\u05de\u05d5\u05ea',
  '\u05ea\u05e7\u05e6\u05d9\u05d1',
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
  '\u05e9\u05e0\u05d4',
  '\u05e2\u05d3\u05db\u05df',
  '\u05e2\u05e8\u05d5\u05da',
  '\u05e6\u05d5\u05e8',
  '\u05d4\u05d5\u05e1\u05e3',
  '\u05de\u05d7\u05e7',
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
  'plan tasks',
  'build plan',
  'create plan',
  'runbook',
  '\u05ea\u05d9\u05d9\u05e6\u05e8',
  '\u05ea\u05e6\u05d5\u05e8',
  '\u05ea\u05db\u05e0\u05df',
  '\u05de\u05e9\u05d9\u05de\u05d5\u05ea',
  '\u05ea\u05d9\u05d9\u05e6\u05e8 \u05de\u05e9\u05d9\u05de\u05d5\u05ea',
  '\u05ea\u05e6\u05d5\u05e8 \u05de\u05e9\u05d9\u05de\u05d5\u05ea',
  '\u05ea\u05d9\u05d9\u05e6\u05e8 \u05de\u05d6\u05d4 \u05de\u05e9\u05d9\u05de\u05d5\u05ea',
  '\u05d0\u05dc\u05de\u05e0\u05d8\u05d9\u05dd',
  '\u05d1\u05e0\u05d4 \u05ea\u05e7\u05e6\u05d9\u05d1',
  '\u05e6\u05d5\u05e8 \u05ea\u05e7\u05e6\u05d9\u05d1',
  '\u05e6\u05d5\u05e8 \u05d4\u05e6\u05e2\u05ea \u05de\u05d7\u05d9\u05e8',
  '\u05d1\u05e0\u05d4 \u05d4\u05e6\u05e2\u05ea \u05de\u05d7\u05d9\u05e8',
]

const EXPLICIT_SKILL_PATTERNS = [
  'run ',
  'execute ',
  'use tool',
  'use skill',
  'call ',
  '\u05d4\u05e4\u05e2\u05dc',
  '\u05ea\u05e8\u05d9\u05e5',
]

const AUDIT_PATTERNS = [
  'audit',
  'review project',
  'critique',
  '\u05d1\u05d3\u05d9\u05e7\u05d4',
  '\u05d0\u05d5\u05d3\u05d9\u05d8',
  '\u05d1\u05e7\u05e8\u05ea \u05d0\u05d9\u05db\u05d5\u05ea',
]

const DEEP_RESEARCH_PATTERNS = [
  'deep research',
  'deep dive',
  'think deeply',
  'strategy',
  'אסטרטגיה',
  'מחקר עמוק',
  'חשיבה עמוקה',
]

const WORKFLOW_REPLY_PATTERNS = [
  'yes',
  'no',
  'approve',
  'reject',
  'cancel',
  'ok',
  'k',
  '1',
  '2',
  '3',
  '\u05db\u05df',
  '\u05dc\u05d0',
  '\u05de\u05d0\u05e9\u05e8',
  '\u05de\u05d0\u05e9\u05e8\u05ea',
  '\u05de\u05d1\u05d8\u05dc',
  '\u05d9\u05d0\u05dc\u05dc\u05d4',
  '\u05e1\u05d1\u05d1\u05d4',
]

function includesAny(text: string, patterns: string[]) {
  return patterns.some((pattern) => text.includes(pattern))
}

function looksLikeSmalltalk(text: string) {
  const trimmed = text.trim()
  if (!trimmed) return true
  return includesAny(text, SMALLTALK_PATTERNS)
}

export function isWorkflowReply(userText: string): boolean {
  const text = String(userText ?? '').trim().toLowerCase()
  if (!text) return false
  return text.length <= 12 && includesAny(text, WORKFLOW_REPLY_PATTERNS)
}

export function detectChatIntent(
  userText: string,
  options?: {
    hasPendingAction?: boolean
  }
): ChatIntent {
  const text = String(userText ?? '').trim().toLowerCase()
  if (!text) return 'chat_smalltalk'
  if (options?.hasPendingAction && isWorkflowReply(text)) return 'project_write_change'
  if (includesAny(text, DEEP_RESEARCH_PATTERNS)) return 'deep_research'
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
    if (text.includes('task') || text.includes('\u05de\u05e9\u05d9\u05de')) return ['project', 'tasks', 'elements', 'knowledge', 'qa']
    if (text.includes('budget') || text.includes('\u05ea\u05e7\u05e6\u05d9\u05d1')) return ['project', 'accounting', 'tasks', 'elements', 'quote', 'knowledge', 'qa']
    if (text.includes('quote') || text.includes('\u05d4\u05e6\u05e2\u05ea')) return ['project', 'quote', 'accounting', 'tasks', 'elements', 'knowledge']
    return ['project', 'elements', 'tasks', 'accounting', 'quote', 'knowledge', 'qa']
  }
  if (intent === 'audit_request') return ['project', 'elements', 'tasks', 'accounting', 'quote']
  if (intent === 'deep_research') return ['project', 'elements', 'tasks', 'accounting', 'quote', 'knowledge']
  if (intent === 'planning_request' || intent === 'project_write_change' || intent === 'explicit_skill_run') {
    return ['project', 'elements', 'tasks', 'accounting', 'quote', 'knowledge']
  }
  return ['project', 'knowledge']
}

export function allowedToolsForChatIntent(intent: ChatIntent): string[] {
  if (intent === 'chat_smalltalk') return []
  if (intent === 'project_read_qna') return ['context.get']
  if (intent === 'audit_request') return ['context.get', 'audit.project']
  if (intent === 'deep_research') return ['context.get', 'think.deep', 'knowledge.summarize_or_update']
  if (intent === 'planning_request') {
    return [
      'context.get',
      'changeset.compile',
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
  if (source.includes('?') || source.includes('next') || source.includes('\u05d4\u05d1\u05d0')) return true
  if (args.intent === 'project_write_change' || args.intent === 'planning_request') return true
  return false
}
