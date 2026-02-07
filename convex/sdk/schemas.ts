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
    captured: z.any().optional(),
    meta: zBasicMeta.optional(),
    knowledgeUpdate: z.any().optional(),
    blocks: zBlocks.optional(),
  }).passthrough(),
  'intake.parse_brief': z.object({
    brief: z.any(),
    meta: zBasicMeta.optional(),
    intent: zIntent.optional(),
  }).passthrough(),
  'draft.plan_and_questions': z.object({
    planMd: z.string(),
    summaryHe: z.string().optional(),
    assumptionsHe: z.array(z.string()).optional(),
    questions: z.array(z.object({
      questionKey: z.string(),
      questionHe: z.string(),
      questionType: z.enum(['text', 'number', 'date', 'single', 'multi', 'toggle']).optional(),
      options: z.array(z.object({
        value: z.string(),
        labelHe: z.string().optional(),
      })).optional(),
      blockingLevel: z.enum(['blocker', 'helpful', 'optional']).optional(),
      scopeType: z.enum(['global', 'project', 'element', 'task', 'section']).optional(),
      scopeKey: z.string().optional(),
      sectionPath: z.array(z.string()).optional(),
      orderKey: z.string().optional(),
      followUp: z.boolean().optional(),
      triggeredBy: z.string().optional(),
    })),
    meta: z.any().optional(),
  }).passthrough(),
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
    return { ok: false, errors: parsed.error.errors };
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
