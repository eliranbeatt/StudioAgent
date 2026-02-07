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
