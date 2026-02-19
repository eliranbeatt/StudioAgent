import { z } from 'zod';

const zStringArray = z.array(z.string());
const zBlocks = z.array(z.any());

const zIntent = z.object({
  type: z.string(),
  payload: z.any().optional(),
}).passthrough();

const zBasicMeta = z.object({
  stageKey: z.string().optional(),
  stageKeyHint: z.string().optional(),
}).passthrough();

const zChangeSetOps = z.object({
  op: z.enum(['create', 'patch', 'delete']),
  entity: z.string(),
  id: z.string().nullable().optional(),
  tempId: z.string().nullable().optional(),
  patch: z.any().nullable().optional(),
  create: z.any().nullable().optional(),
  delete: z.any().nullable().optional(),
  dedupKey: z.string().nullable().optional(),
});

const zChangeSet = z.object({
  ops: z.array(zChangeSetOps),
});

const zRegenQuestionAdd = z.object({
  scopeType: z.enum(['project', 'element']),
  scopeKey: z.string(),
  blockingLevel: z.enum(['blocker', 'helpful', 'optional']),
  sectionPath: z.string(),
  questionText: z.string(),
  questionType: z.enum([
    'choice',
    'number',
    'date',
    'shortText',
    'longText',
    'fileRef',
    'single',
    'multi',
    'toggle',
    'text',
  ]).optional(),
  options: z.array(z.string()).optional(),
  followUp: z.boolean().optional(),
  triggeredBy: z.array(z.string()).optional(),
  dedupeKey: z.string().optional(),
  whyNow: z.string().optional(),
}).passthrough()

export const zQaPairOption = z.object({
  value: z.string(),
  labelHe: z.string().optional(),
});

function normalizePlanningQuestionType(value: unknown) {
  if (typeof value !== 'string') return value
  const key = value.trim().toLowerCase()
  if (!key) return undefined
  if (['single', 'choice', 'select', 'radio', 'single_select'].includes(key)) return 'single'
  if (['multi', 'multiple', 'multi_select', 'checkbox'].includes(key)) return 'multi'
  if (['toggle', 'boolean', 'bool', 'yesno'].includes(key)) return 'toggle'
  if (['text', 'shorttext', 'longtext', 'string', 'freetext', 'textarea'].includes(key)) return 'text'
  if (['number', 'numeric', 'int', 'float'].includes(key)) return 'number'
  if (['date', 'datetime'].includes(key)) return 'date'
  return value
}

const zPlanningOption = z.preprocess((value) => {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    const text = String(value).trim()
    if (!text) return { value: '' }
    return { value: text, labelHe: text }
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const item = value as Record<string, unknown>
    const normalizedValue = String(item.value ?? item.labelHe ?? item.label ?? item.name ?? item.text ?? '').trim()
    const normalizedLabel = String(item.labelHe ?? item.label ?? item.name ?? item.text ?? item.value ?? '').trim()
    return {
      value: normalizedValue,
      labelHe: normalizedLabel || undefined,
    }
  }
  return value
}, z.object({
  value: z.string().min(1),
  labelHe: z.string().optional(),
}))

function normalizeBlockingLevel(value: unknown): string | undefined {
  if (value == null) return undefined
  const key = String(value).trim().toLowerCase()
  if (!key) return undefined
  if (['blocker', 'critical', 'high', 'must', 'blocking', 'required'].includes(key)) return 'blocker'
  if (['helpful', 'medium', 'important', 'nice', 'recommended'].includes(key)) return 'helpful'
  if (['optional', 'low', 'nice_to_have', 'suggestion', 'minor'].includes(key)) return 'optional'
  return 'helpful'
}

function coerceToBooleanOptional(value: unknown): boolean | undefined {
  if (value == null) return undefined
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') {
    const key = value.trim().toLowerCase()
    if (['true', 'yes', '1'].includes(key)) return true
    if (['false', 'no', '0', ''].includes(key)) return false
  }
  if (typeof value === 'number') return value !== 0
  return undefined
}

const zPlanningQuestion = z.object({
  questionKey: z.string().optional(),
  questionHe: z.string().optional(),
  textHe: z.string().optional(),
  questionText: z.string().optional(),
  questionType: z.preprocess(
    normalizePlanningQuestionType,
    z.enum(['text', 'number', 'date', 'single', 'multi', 'toggle']).optional()
  ),
  options: z.array(zPlanningOption).optional(),
  blockingLevel: z.preprocess(
    normalizeBlockingLevel,
    z.enum(['blocker', 'helpful', 'optional']).optional()
  ),
  scopeType: z.enum(['global', 'project', 'element', 'task', 'section']).optional(),
  scopeKey: z.string().optional(),
  sectionPath: z.preprocess((value) => {
    if (typeof value === 'string') return [value]
    if (Array.isArray(value)) return value.map((item) => String(item ?? '').trim()).filter(Boolean)
    return value
  }, z.array(z.string()).optional()),
  orderKey: z.string().optional(),
  followUp: z.preprocess(coerceToBooleanOptional, z.boolean().optional()),
  triggeredBy: z.union([z.string(), z.array(z.string())]).optional(),
  allowDontKnow: z.preprocess(coerceToBooleanOptional, z.boolean().optional()),
  allowFreeText: z.preprocess(coerceToBooleanOptional, z.boolean().optional()),
}).passthrough().refine((value) => {
  const text = String(value.questionHe ?? value.textHe ?? value.questionText ?? '').trim()
  return text.length > 0
}, {
  message: 'planning question must include questionHe/textHe/questionText',
});

const zPlanningQuestionGroup = z.object({
  key: z.string().optional(),
  labelHe: z.string().optional(),
  phase: z.enum(['blockers', 'per_element', 'project_level', 'suggestions']).optional(),
  phaseOrder: z.preprocess((value) => {
    if (typeof value === 'string' && value.trim()) return Number(value)
    return value
  }, z.number().optional()),
  setOrder: z.preprocess((value) => {
    if (typeof value === 'string' && value.trim()) return Number(value)
    return value
  }, z.number().optional()),
  questions: z.array(zPlanningQuestion),
}).passthrough();

export const zQaPairFast = z.object({
  id: z.string(),
  projectId: z.string(),
  elementId: z.string().optional().nullable(),
  questionHe: z.string(),
  questionText: z.string().optional(),
  questionKey: z.string().optional(),
  answerHe: z.string().optional(),
  answerText: z.string().optional(),
  status: z.enum(['open', 'answered', 'assumed', 'resolved', 'skipped', 'dismissed']).optional(),
  questionType: z.enum(['text', 'number', 'date', 'single', 'multi', 'toggle']).optional(),
  options: z.array(zQaPairOption).optional(),
  answer: z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]).optional(),
  scopeType: z.enum(['global', 'project', 'element', 'task', 'section']).optional(),
  scopeKey: z.string().optional(),
  sectionPath: z.array(z.string()).optional(),
  blockingLevel: z.enum(['blocker', 'helpful', 'optional']).optional(),
  orderKey: z.string().optional(),
  createdFrom: z.enum(['seed', 'rebase', 'manual', 'chat_parse', 'clarification', 'system']).optional(),
  followUp: z.boolean().optional(),
  triggeredBy: z.string().optional(),
  dedupeKey: z.string().optional(),
  version: z.number().optional(),
  source: z.any().optional(),
  createdAt: z.number(),
}).passthrough();

export const SDK_SCHEMAS: Record<string, z.ZodTypeAny> = {
  'orchestrator.response': z.object({
    summaryHe: z.string().optional(),
    meta: zBasicMeta.optional(),
    blocks: zBlocks.optional(),
  }).passthrough(),
  'clarify.next_questions': z.object({
    summaryHe: z.string().optional(),
    meta: zBasicMeta.optional(),
    knowledgeUpdate: z.any().optional(),
    blocks: zBlocks.optional(),
  }).passthrough(),
  'chat.free': z.object({
    summaryHe: z.string().optional(),
    text: z.string().optional(),
    captured: z.any().optional(),
    meta: zBasicMeta.optional(),
    knowledgeUpdate: z.any().optional(),
    blocks: zBlocks.optional(),
  }).passthrough(),
  'think.deep': z.object({
    summaryHe: z.string().optional(),
    text: z.string().optional(),
    references: z.array(z.any()).optional(),
    meta: z.any().optional(),
  }).passthrough(),
  'intake.parse_brief': z.object({
    brief: z.any(),
    meta: zBasicMeta.optional(),
    intent: zIntent.optional(),
  }).passthrough(),
  'draft.plan_and_questions': z.object({
    planMd: z.string().optional(),
    planText: z.string().optional(),
    summaryHe: z.string().optional(),
    assumptionsHe: z.preprocess((value) => {
      if (typeof value === 'string') return [value]
      return value
    }, z.array(z.string()).optional()),
    planningAnalysis: z.any().optional(),
    questionGroups: z.array(zPlanningQuestionGroup).optional(),
    questions: z.array(zPlanningQuestion).optional(),
    meta: z.any().optional(),
  }).passthrough().refine((value) => {
    const hasPlan = String(value.planMd ?? value.planText ?? '').trim().length > 0
    const groupsCount = Array.isArray(value.questionGroups) ? value.questionGroups.length : 0
    const questionsCount = Array.isArray(value.questions) ? value.questions.length : 0
    return hasPlan && (groupsCount > 0 || questionsCount > 0)
  }, {
    message: 'draft.plan_and_questions must include planMd/planText and questionGroups or questions',
  }),
  'plan.elements': z.object({
    elements: z.array(z.any()),
    meta: z.any().optional(),
    intent: zIntent.optional(),
  }).passthrough(),
  'plan.tasks': z.object({
    tasks: z.array(z.any()),
    meta: z.any().optional(),
    intent: zIntent.optional(),
  }).passthrough(),
  'plan.execution_phases': z.object({
    phases: z.array(z.any()),
    meta: z.any().optional(),
    intent: zIntent.optional(),
  }).passthrough(),
  'cost.build_budget': z.object({
    materialLines: z.array(z.any()).optional(),
    workLines: z.array(z.any()).optional(),
    meta: z.any().optional(),
    intent: zIntent.optional(),
  }).passthrough(),
  'quote.generate': z.object({
    quote: z.any(),
    meta: z.any().optional(),
    intent: zIntent.optional(),
  }).passthrough(),
  'runbook.installation': z.object({
    runbook: z.any(),
    meta: z.any().optional(),
    intent: zIntent.optional(),
  }).passthrough(),
  'ops.daily_plan': z.object({
    dailyPlan: z.array(z.any()),
    meta: z.any().optional(),
    intent: zIntent.optional(),
  }).passthrough(),
  'pricing.resolve_lines': z.object({
    summaryHe: z.string().optional(),
    recommendations: z.array(z.any()).optional(),
    intent: zIntent.optional(),
    meta: z.any().optional(),
  }).passthrough(),
  'procurement.shopping_plan': z.object({
    summaryHe: z.string().optional(),
    shoppingPlan: z.array(z.any()).optional(),
    intent: zIntent.optional(),
    meta: z.any().optional(),
  }).passthrough(),
  'finance.ingest_receipt': z.object({
    summaryHe: z.string().optional(),
    receipt: z.any().optional(),
    mapping: z.array(z.any()).optional(),
    intent: zIntent.optional(),
  }).passthrough(),
  'audit.project': z.object({
    summaryHe: z.string().optional(),
    findings: z.array(z.any()).optional(),
    fixIntents: z.array(z.any()).optional(),
    meta: z.any().optional(),
  }).passthrough(),
  'qa.print_files': z.object({
    summaryHe: z.string().optional(),
    checks: z.array(z.any()).optional(),
    criticalQuestions: z.array(z.any()).optional(),
    intent: zIntent.optional(),
  }).passthrough(),
  'maint.sync_and_repair': z.object({
    summaryHe: z.string().optional(),
    passes: z.array(z.any()).optional(),
    repairIntents: z.array(z.any()).optional(),
    meta: z.any().optional(),
  }).passthrough(),
  'audit.fix_plan': z.object({
    summaryHe: z.string().optional(),
    repairIntents: z.array(z.any()).optional(),
    meta: z.any().optional(),
  }).passthrough(),
  'admin.set_labor_rates': z.object({}).passthrough(),
  'admin.confirm_measurements': z.object({}).passthrough(),
  'knowledge.summarize_or_update': z.object({
    doc: z.any().optional(),
    meta: z.any().optional(),
  }).passthrough(),
  'changeset.compile': z.object({
    changeSet: zChangeSet,
    meta: z.any().optional(),
  }).passthrough(),
  'changeset.review': z.object({
    summaryHe: z.string().optional(),
    issues: z.array(z.any()).optional(),
    errors: z.array(z.any()).optional(),
    warnings: z.array(z.any()).optional(),
    isValid: z.boolean().optional(),
    recommendedNextHe: z.array(z.string()).optional(),
    meta: z.any().optional(),
  }).passthrough(),
  'finalize.build_structured_package': z.object({
    generatedAt: z.number().optional(),
    project: z.any().nullable().optional(),
    elements: z.array(z.any()).optional(),
    tasks: z.array(z.any()).optional(),
    accounting: z.any().optional(),
    quote: z.any().nullable().optional(),
    runbooks: z.array(z.any()).optional(),
    answers: z.array(z.any()).optional(),
    assumptions: z.array(z.string()).optional(),
    unresolvedQuestionCount: z.number().optional(),
  }).passthrough(),
  'rebase.regenerate_questions_manual': z.object({
    newPlanDocMarkdown: z.string(),
    questionOps: z.object({
      add: z.array(zRegenQuestionAdd).optional(),
      dismiss: z.array(z.object({
        questionId: z.string(),
        reason: z.string().optional(),
      })).optional(),
      promote: z.array(z.object({
        questionId: z.string(),
        newBlockingLevel: z.literal('blocker').optional(),
        reason: z.string().optional(),
      })).optional(),
      dedupe: z.array(z.object({
        candidateDedupeKey: z.string(),
        keepQuestionId: z.string(),
        dropCandidate: z.boolean().optional(),
      })).optional(),
    }).passthrough(),
    summary: z.object({
      newBlockersCount: z.number().optional(),
      newQuestionsCount: z.number().optional(),
      dismissedCount: z.number().optional(),
      notes: z.string().optional(),
    }).optional(),
  }).passthrough(),
};

export function validateSdkOutput(schemaName: string, payload: unknown) {
  const schema = SDK_SCHEMAS[schemaName];
  if (!schema) {
    return { ok: true, data: payload };
  }
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    // Use .issues (canonical Zod property) with .errors as fallback
    const issues = parsed.error.issues ?? [];
    // Log full error details for debugging
    console.error(
      `[validateSdkOutput] Schema "${schemaName}" validation failed.`,
      `Issues count: ${issues.length}.`,
      `Full error: ${JSON.stringify(parsed.error, null, 2).substring(0, 2000)}`,
      `Payload keys: ${payload && typeof payload === 'object' ? Object.keys(payload as any).join(', ') : typeof payload}`,
    );
    // Ensure we always return a non-empty errors array
    const errors = issues.length > 0
      ? issues
      : [{ path: [], message: parsed.error.message || 'Schema validation failed', code: 'custom' }];
    return { ok: false, errors };
  }
  return { ok: true, data: parsed.data };
}

export function assertAsciiKeys(value: unknown, path = 'root') {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach((item, idx) => assertAsciiKeys(item, `${path}[${idx}]`));
    return;
  }
  const obj = value as Record<string, unknown>;
  for (const key of Object.keys(obj)) {
    if (/[^\x00-\x7F]/.test(key)) {
      throw new Error(`Non-ASCII key "${key}" in ${path}`);
    }
    assertAsciiKeys(obj[key], `${path}.${key}`);
  }
}
