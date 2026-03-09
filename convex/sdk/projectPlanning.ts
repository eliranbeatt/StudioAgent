import { v } from 'convex/values';
import { action, internalAction, internalMutation, mutation, query } from '../_generated/server';
import { api, internal } from '../_generated/api';
import { Id } from '../_generated/dataModel';

/**
 * PROJECT PLANNING FLOW
 * Structured, deterministic planning flow from context to complete project plan
 */

const FINALIZE_PHASES = ['elements', 'tasks', 'budget', 'pricing', 'audit', 'repair', 'package'] as const
type FinalizePhase = typeof FINALIZE_PHASES[number]
type PlanningMode = 'separated' | 'combined'
type PlanningLlmConfig = { model: 'gpt-5.4' }

const TOOL_BY_PHASE: Record<Exclude<FinalizePhase, 'audit' | 'repair' | 'package'>, string> = {
  elements: 'plan.elements',
  tasks: 'plan.tasks',
  budget: 'cost.build_budget',
  pricing: 'pricing.resolve_lines',
}

function nextFinalizePhase(phase: FinalizePhase | null | undefined): FinalizePhase | null {
  if (!phase) return FINALIZE_PHASES[0]
  const index = FINALIZE_PHASES.indexOf(phase)
  if (index < 0 || index >= FINALIZE_PHASES.length - 1) return null
  return FINALIZE_PHASES[index + 1]
}

function resolvePlanningMode(value: unknown): PlanningMode {
  return value === 'combined' ? 'combined' : 'separated'
}

function nextFinalizePhaseForMode(phase: FinalizePhase | null | undefined, mode: PlanningMode): FinalizePhase | null {
  if (!phase) return FINALIZE_PHASES[0]
  if (mode === 'combined') {
    if (phase === 'elements') return 'pricing'
    if (phase === 'tasks' || phase === 'budget') return 'pricing'
  }
  return nextFinalizePhase(phase)
}

function planningLlmConfigForMode(mode: PlanningMode): PlanningLlmConfig {
  if (mode === 'combined') {
    return { model: 'gpt-5.4' }
  }
  return { model: 'gpt-5.4' }
}

function defaultFinalizePolicy() {
  return {
    mode: 'force_full_finalize',
    assumeMissing: true,
    pricingOrder: ['catalog', 'web', 'estimate'],
    requireAll: ['elements', 'tasks', 'accounting'],
  }
}

function collectIntentsFromResult(result: any, sourceToolId?: string | null): any[] {
  const mergePayloadFromResult = (intent: any) => {
    if (!intent || typeof intent !== 'object') return intent
    const type = String(intent?.type ?? '')
    if (!type) return intent
    const payload =
      intent?.payload && typeof intent.payload === 'object' && !Array.isArray(intent.payload)
        ? { ...intent.payload }
        : {}
    let changed = false
    const setIfMissing = (key: string, value: any) => {
      if (payload[key] !== undefined || value === undefined) return
      payload[key] = value
      changed = true
    }

    if (type === 'plan.tasks_intent') {
      setIfMissing('tasks', Array.isArray(result?.tasks) ? result.tasks : undefined)
      setIfMissing('elements', Array.isArray(result?.elements) ? result.elements : undefined)
      setIfMissing('meta', result?.meta)
    } else if (type === 'plan.elements_intent') {
      setIfMissing('elements', Array.isArray(result?.elements) ? result.elements : undefined)
      setIfMissing('meta', result?.meta)
    } else if (type === 'cost.budget_intent') {
      setIfMissing('materialLines', Array.isArray(result?.materialLines) ? result.materialLines : undefined)
      setIfMissing('workLines', Array.isArray(result?.workLines) ? result.workLines : undefined)
      setIfMissing('meta', result?.meta)
    } else if (type === 'quote.intent') {
      setIfMissing('quote', result?.quote)
      setIfMissing('meta', result?.meta)
    } else if (type === 'runbook.install_intent') {
      setIfMissing('runbook', result?.runbook)
      setIfMissing('meta', result?.meta)
    } else if (type === 'ops.daily_plan_intent') {
      setIfMissing('dailyPlan', Array.isArray(result?.dailyPlan) ? result.dailyPlan : undefined)
      setIfMissing('meta', result?.meta)
    }

    if (!changed) return intent
    return { ...intent, payload }
  }

  const out: any[] = []
  if (result?.intent) out.push(mergePayloadFromResult(result.intent))
  if (Array.isArray(result?.intents)) out.push(...result.intents.map((item: any) => mergePayloadFromResult(item)))
  if (Array.isArray(result?.fixIntents)) out.push(...result.fixIntents.map((item: any) => mergePayloadFromResult(item)))
  if (Array.isArray(result?.repairIntents)) out.push(...result.repairIntents.map((item: any) => mergePayloadFromResult(item)))

  const source = String(sourceToolId ?? '').trim()
  if (out.length === 0 && source) {
    if (source === 'plan.tasks' && Array.isArray(result?.tasks) && result.tasks.length > 0) {
      out.push({
        type: 'plan.tasks_intent',
        payload: {
          tasks: result.tasks,
          elements: Array.isArray(result?.elements) ? result.elements : undefined,
          meta: result?.meta,
        },
      })
    } else if (source === 'plan.elements' && Array.isArray(result?.elements) && result.elements.length > 0) {
      out.push({
        type: 'plan.elements_intent',
        payload: {
          elements: result.elements,
          meta: result?.meta,
        },
      })
    } else if (
      source === 'cost.build_budget' &&
      (
        (Array.isArray(result?.materialLines) && result.materialLines.length > 0) ||
        (Array.isArray(result?.workLines) && result.workLines.length > 0)
      )
    ) {
      out.push({
        type: 'cost.budget_intent',
        payload: {
          materialLines: Array.isArray(result?.materialLines) ? result.materialLines : [],
          workLines: Array.isArray(result?.workLines) ? result.workLines : [],
          meta: result?.meta,
        },
      })
    }
  }

  return out.filter(Boolean)
}

function normalizePlanningQuestionType(value: unknown): 'text' | 'number' | 'date' | 'single' | 'multi' | 'toggle' {
  const key = String(value ?? '').trim().toLowerCase()
  if (key === 'number') return 'number'
  if (key === 'date') return 'date'
  if (key === 'single' || key === 'choice' || key === 'select' || key === 'single_select') return 'single'
  if (key === 'multi' || key === 'multiple' || key === 'multi_select' || key === 'checkbox') return 'multi'
  if (key === 'toggle' || key === 'boolean' || key === 'bool' || key === 'yesno') return 'toggle'
  return 'text'
}

function normalizePlanningOptions(value: unknown): Array<{ value: string; labelHe: string }> | undefined {
  if (!Array.isArray(value)) return undefined
  const out = value
    .map((item) => {
      if (typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean') {
        const text = String(item).trim()
        if (!text) return null
        return { value: text, labelHe: text }
      }
      if (!item || typeof item !== 'object') return null
      const source = item as Record<string, unknown>
      const normalizedValue = String(source.value ?? source.labelHe ?? '').trim()
      if (!normalizedValue) return null
      const normalizedLabel = String(source.labelHe ?? source.value ?? '').trim() || normalizedValue
      return { value: normalizedValue, labelHe: normalizedLabel }
    })
    .filter(Boolean) as Array<{ value: string; labelHe: string }>
  return out.length > 0 ? out : undefined
}

function normalizePlanningQuestionText(question: any): string {
  return String(question?.textHe ?? question?.questionHe ?? question?.questionText ?? '').trim()
}

function normalizePricingKey(value: unknown) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^\w\u0590-\u05ff]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 120)
}

async function persistPricingEvidenceFromToolResult(args: {
  ctx: any
  projectId: any
  result: any
  runId?: any
}) {
  const recommendations = Array.isArray(args.result?.recommendations)
    ? args.result.recommendations
    : Array.isArray(args.result?.output?.recommendations)
      ? args.result.output.recommendations
      : []

  for (const rec of recommendations) {
    const itemHe = String(rec?.itemHe ?? '').trim()
    const unitPrice = Number(rec?.recommended?.unitPrice)
    if (!itemHe || !Number.isFinite(unitPrice) || unitPrice <= 0) continue

    try {
      const upsert = await args.ctx.runMutation(
        internal.pricingEvidence.upsertWebPriceRunFromRecommendation,
        {
          projectId: args.projectId,
          itemHe,
          normalizedKey: normalizePricingKey(itemHe),
          constraints: {
            region: 'IL',
            maxDeliveryDays: 7,
            unitHe: rec?.recommended?.unitHe,
          },
          recommended: {
            unitPrice,
            currency: rec?.recommended?.currency,
            unitHe: rec?.recommended?.unitHe,
            priceBasisHe: rec?.recommended?.priceBasisHe,
          },
          confidence: rec?.confidence,
          assumptionsHe: Array.isArray(rec?.assumptionsHe) ? rec.assumptionsHe : [],
          candidates: Array.isArray(rec?.candidates) ? rec.candidates : [],
          summaryHe: rec?.summaryHe,
        }
      )

      const lineId = String(rec?.lineRef?.lineId ?? '').trim()
      if (!lineId) continue
      await args.ctx.runMutation(api.pricingEvidence.applyRecommendationToMaterialLine, {
        materialLineId: lineId as any,
        webPriceRunId: upsert?.runId,
        itemHe,
        recommended: {
          unitPrice,
          currency: rec?.recommended?.currency,
          unitHe: rec?.recommended?.unitHe,
          priceBasisHe: rec?.recommended?.priceBasisHe,
        },
        confidence: rec?.confidence,
        assumptionsHe: Array.isArray(rec?.assumptionsHe) ? rec.assumptionsHe : [],
        candidates: Array.isArray(rec?.candidates) ? rec.candidates : [],
        appliedBy: 'agent',
      })
    } catch (error: any) {
      if (args.runId) {
        await args.ctx.runMutation(internal.sdk.telemetry.logEvent, {
          runId: args.runId,
          type: 'pricing_evidence_persist_error',
          payload: {
            itemHe,
            lineId: String(rec?.lineRef?.lineId ?? ''),
            message: String(error?.message ?? 'unknown'),
          },
        })
      }
    }
  }
}


function normalizeQuestionGroups(result: any): Array<{ key: string; labelHe: string; questions: any[] }> {
  const grouped = Array.isArray(result?.questionGroups) ? result.questionGroups : []
  if (grouped.length > 0) {
    return grouped.map((group: any) => ({
      key: String(group?.key ?? group?.phase ?? 'general'),
      labelHe: String(group?.labelHe ?? group?.key ?? group?.phase ?? 'general'),
      questions: Array.isArray(group?.questions)
        ? group.questions.map((q: any) => ({
          questionKey: q?.questionKey,
          textHe: normalizePlanningQuestionText(q),
          questionHe: normalizePlanningQuestionText(q),
          questionType: normalizePlanningQuestionType(q?.questionType ?? q?.type),
          sectionPath: Array.isArray(q?.sectionPath) ? q.sectionPath : [],
          blockingLevel: q?.blockingLevel ?? 'helpful',
          scopeType: q?.scopeType,
          scopeKey: q?.scopeKey,
          orderKey: q?.orderKey,
          followUp: q?.followUp,
          options: normalizePlanningOptions(q?.options),
          suggestedAnswers: q?.suggestedAnswers,
          allowDontKnow: q?.allowDontKnow,
          allowFreeText: q?.allowFreeText,
        }))
        : [],
    }))
  }

  const flat = Array.isArray(result?.questions) ? result.questions : []
  if (flat.length === 0) return []

  const labelByKey: Record<string, string> = {
    blockers: 'Blockers',
    project_level: 'Project Level',
    per_element: 'Per Element',
    suggestions: 'Suggestions',
    general: 'General',
  }

  const order: string[] = []
  const buckets = new Map<string, any[]>()

  for (const q of flat) {
    const sectionPath = Array.isArray(q?.sectionPath) ? q.sectionPath : []
    const level1 = String(sectionPath[0] ?? '')
    const level2 = String(sectionPath[1] ?? '')
    const key =
      level1 === 'per_element'
        ? String(q?.groupKey ?? `element:${level2 || q?.scopeKey || 'general'}`)
        : String(q?.groupKey ?? level1 ?? 'general')
    if (!buckets.has(key)) {
      buckets.set(key, [])
      order.push(key)
    }
    buckets.get(key)!.push({
      questionKey: q?.questionKey,
      textHe: normalizePlanningQuestionText(q),
      questionHe: normalizePlanningQuestionText(q),
      questionType: normalizePlanningQuestionType(q?.questionType ?? q?.type),
      sectionPath,
      blockingLevel: q?.blockingLevel ?? 'helpful',
      scopeType: q?.scopeType,
      scopeKey: q?.scopeKey,
      orderKey: q?.orderKey,
      followUp: q?.followUp,
      options: normalizePlanningOptions(q?.options),
      suggestedAnswers: q?.suggestedAnswers,
      allowDontKnow: q?.allowDontKnow,
      allowFreeText: q?.allowFreeText,
    })
  }

  return order.map((key) => ({
    key,
    labelHe: labelByKey[key] ?? key,
    questions: buckets.get(key) ?? [],
  }))
}

function validateGeneratedQuestionGroups(
  groups: Array<{ key: string; questions: any[] }>,
  options?: { minQuestions?: number; requireGroups?: boolean }
): { ok: boolean; reason?: string; questionsCount: number } {
  const minQuestions = Math.max(1, Number(options?.minQuestions ?? 4))
  const requireGroups = options?.requireGroups !== false
  if (requireGroups && groups.length === 0) {
    return { ok: false, reason: 'no_groups', questionsCount: 0 }
  }
  const questionsCount = groups.reduce((sum, g) => sum + (Array.isArray(g.questions) ? g.questions.length : 0), 0)
  if (questionsCount < minQuestions) {
    return { ok: false, reason: 'too_few_questions', questionsCount }
  }
  return { ok: true, questionsCount }
}

async function insertQuestionGroups(args: {
  ctx: any
  projectId: Id<'projects'>
  runId: Id<'sdkRuns'>
  groups: Array<{ key: string; labelHe: string; questions: any[] }>
}) {
  let inserted = 0
  for (const group of args.groups) {
    const groupKey = group.key ?? 'general'
    const groupLabel = group.labelHe ?? 'General'
    const questions = Array.isArray(group.questions) ? group.questions : []
    for (const q of questions) {
      const questionHe = normalizePlanningQuestionText(q)
      if (!String(questionHe).trim()) continue
      await args.ctx.runMutation(internal.sdk.questions.createQuestion, {
        projectId: args.projectId,
        runId: args.runId,
        questionHe,
        groupKey,
        groupLabelHe: groupLabel,
        questionKey: typeof q?.questionKey === 'string' ? q.questionKey : undefined,
        questionType: normalizePlanningQuestionType(q.questionType ?? q.type),
        sectionPath: Array.isArray(q.sectionPath) ? q.sectionPath : [groupKey],
        blockingLevel: q.blockingLevel ?? 'helpful',
        scopeType: q.scopeType,
        scopeKey: q.scopeKey,
        orderKey: q.orderKey,
        followUp: typeof q.followUp === 'boolean' ? q.followUp : undefined,
        options: normalizePlanningOptions(q.options),
        suggestedAnswers: q.suggestedAnswers,
        allowDontKnow: typeof q.allowDontKnow === 'boolean' ? q.allowDontKnow : true,
      })
      inserted += 1
    }
  }
  return inserted
}
// Get or create planning session (for state persistence)
export const getPlanningSession = query({
  args: {
    projectId: v.id('projects'),
  },
  handler: async (ctx, args) => {
    // Look for most recent planning-related run for this project.
    // Some legacy runs may miss runMode, so fall back to planning step fields.
    const existingRun = await ctx.db
      .query('sdkRuns')
      .withIndex('by_project', (q) => q.eq('projectId', args.projectId))
      .filter((q) =>
        q.or(
          q.eq(q.field('runMode'), 'PLANNING_FLOW'),
          q.eq(q.field('planningCurrentStep'), 'start'),
          q.eq(q.field('planningCurrentStep'), 'braindump'),
          q.eq(q.field('planningCurrentStep'), 'questions'),
          q.eq(q.field('planningCurrentStep'), 'finalizing'),
          q.eq(q.field('planningCurrentStep'), 'report')
        )
      )
      .order('desc')
      .first();

    if (!existingRun) {
      return null;
    }

    const inferredStep =
      existingRun.planningCurrentStep ??
      (((existingRun as any).planningFinalizeCheckpoint || (existingRun.planningFinalizationPhases?.length ?? 0) > 0)
        ? 'finalizing'
        : (existingRun.runMode === 'PLANNING_FLOW' || typeof existingRun.planningQuestionSetIndex === 'number')
          ? 'questions'
          : 'start');

    return {
      runId: existingRun._id,
      conversationId: existingRun.conversationId,
      currentStep: inferredStep,
      questionSetIndex: existingRun.planningQuestionSetIndex ?? 0,
      finalizationPhases: existingRun.planningFinalizationPhases ?? [],
      planningMode:
        (existingRun as any)?.planningFinalizeCheckpoint?.planningMode === 'combined' ||
          (existingRun as any)?.planningFinalizeCheckpoint?.planningMode === 'separated'
          ? (existingRun as any).planningFinalizeCheckpoint.planningMode
          : undefined,
    };
  },
});

// Save current planning step state
export const savePlanningState = mutation({
  args: {
    runId: v.id('sdkRuns'),
    currentStep: v.union(
      v.literal('start'),
      v.literal('braindump'),
      v.literal('questions'),
      v.literal('finalizing'),
      v.literal('report')
    ),
    questionSetIndex: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.runId, {
      planningCurrentStep: args.currentStep,
      planningQuestionSetIndex: args.questionSetIndex,
      updatedAt: Date.now(),
    });
  },
});

// Update finalization phase status
export const updatePhaseStatus = mutation({
  args: {
    runId: v.id('sdkRuns'),
    phase: v.string(),
    status: v.union(v.literal('pending'), v.literal('running'), v.literal('success'), v.literal('failed')),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run) return;

    const phases = run.planningFinalizationPhases ?? [];
    const existingIndex = phases.findIndex(p => p.phase === args.phase);

    if (existingIndex >= 0) {
      phases[existingIndex] = {
        phase: args.phase,
        status: args.status,
        error: args.error,
        completedAt: args.status === 'success' || args.status === 'failed' ? Date.now() : undefined,
      };
    } else {
      phases.push({
        phase: args.phase,
        status: args.status,
        error: args.error,
        completedAt: args.status === 'success' || args.status === 'failed' ? Date.now() : undefined,
      });
    }

    await ctx.db.patch(args.runId, {
      planningFinalizationPhases: phases,
      updatedAt: Date.now(),
    });
  },
});

// Submit brain dump when no context exists
export const submitBrainDump = mutation({
  args: {
    projectId: v.id('projects'),
    brainDump: v.string(),
  },
  handler: async (ctx, args) => {
    // Create conversation for this planning session
    const conversationId = await ctx.runMutation(api.sdk.api.createConversation, {
      projectId: args.projectId,
      title: 'Project Planning Session',
    });

    // Create run with PLANNING_FLOW mode
    const { runId } = await ctx.runMutation(api.sdk.api.startRun, {
      projectId: args.projectId,
      conversationId,
      mode: 'planning',
    });

    // Set run mode to PLANNING_FLOW
    await ctx.db.patch(runId, {
      runMode: 'PLANNING_FLOW',
      planningCurrentStep: 'braindump',
    });

    // Store brain dump as initial message and context
    await ctx.runMutation(internal.sdk.telemetry.appendMessage, {
      conversationId,
      role: 'user',
      text: args.brainDump,
      runId,
    });

    await ctx.runMutation(internal.sdk.knowledgeRefresh.queueProjectContextRefresh, {
      projectId: args.projectId,
      reason: 'planning.brain_dump_submitted',
      newFacts: ['Planning brain dump submitted.'],
      userText: args.brainDump,
      runId,
      conversationId,
    });

    return { conversationId, runId };
  },
});

// Initiate planning - generates plan + all questions grouped
export const initiatePlanning = action({
  args: {
    projectId: v.id('projects'),
    conversationId: v.optional(v.id('agentConversations')),
  },
  handler: async (ctx, args) => {
    let conversationId = args.conversationId;
    let runId: Id<'sdkRuns'> | null = null;

    if (!conversationId) {
      // Create new conversation and run
      conversationId = await ctx.runMutation(api.sdk.api.createConversation, {
        projectId: args.projectId,
        title: 'Project Planning Session',
      });
    }

    const result = await ctx.runMutation(api.sdk.api.startRun, {
      projectId: args.projectId,
      conversationId,
      mode: 'planning',
    });
    runId = result.runId;

    // Set run mode to PLANNING_FLOW and save state
    await ctx.runMutation(api.sdk.projectPlanning.savePlanningState, {
      runId,
      currentStep: 'questions',
      questionSetIndex: 0,
    });
    await ctx.runMutation(internal.sdk.projectPlanning.setRunMode, {
      runId,
    });

    // Get comprehensive context for LLM
    const projectContext = await ctx.runQuery(api.sdk.api.contextGet, {
      projectId: args.projectId,
      packs: ['project', 'elements', 'tasks', 'materials', 'files', 'qa'],
    });

    // Get all past answered QA pairs
    const pastQA = await ctx.runQuery(api.sdk.questions.getResolvedAnswers, {
      projectId: args.projectId,
    });

    // Get project files
    const files = await ctx.runQuery(api.files.listProjectFiles, {
      projectId: args.projectId,
    });

    // Step 1: Generate full plan (text format) + questions WITH FULL CONTEXT
    const planResult = await ctx.runAction(api.sdk.runner.runTool, {
      projectId: args.projectId,
      toolId: 'draft.plan_and_questions',
      input: {
        llm: {
          model: 'gpt-5.4',
          reasoningEffort: 'medium',
        },
        includeQuestions: true,
        groupQuestions: true,
        // Pass full context to LLM
        projectContext,
        pastQA,
        files: files?.map((f: any) => ({ name: f.name, contentHe: f.contentText })),
        groupByPhase: ['blockers', 'per_element', 'project_level', 'suggestions'],
        questionsPerSet: { min: 4, max: 8 },
      },
      runId,
      conversationId,
    });

    // Step 2: Extract, validate, and save questions to qaPairs with groups
    const questionGroups = normalizeQuestionGroups(planResult)
    const validation = validateGeneratedQuestionGroups(questionGroups, { minQuestions: 4, requireGroups: true })
    if (!validation.ok) {
      throw new Error(`Planning questions generation failed validation: ${validation.reason ?? 'unknown'}`)
    }
    await insertQuestionGroups({ ctx, projectId: args.projectId, runId, groups: questionGroups })

    // Step 3: Queue project context refresh with the generated draft
    const planText = (planResult as any)?.planMd ?? (planResult as any)?.planText ?? (planResult as any)?.summary ?? '';
    await ctx.runMutation(internal.sdk.knowledgeRefresh.queueProjectContextRefresh, {
      projectId: args.projectId,
      reason: 'planning.initial_draft_generated',
      newFacts: [
        `Planning draft generated. Questions inserted: ${validation.questionsCount}.`,
      ],
      userText: planText || undefined,
      runId,
      conversationId,
    });

    return { conversationId, runId };
  },
});

// Get next question set
export const getQuestionSets = query({
  args: {
    runId: v.id('sdkRuns'),
    setIndex: v.number(),
  },
  handler: async (ctx, args) => {
    // First get the run to find projectId
    const run = await ctx.db.get(args.runId);
    if (!run) return { currentSet: null, hasMore: false, totalSets: 0 };

    // Get all open questions for this project
    const allProjectQuestions = await ctx.db
      .query('qaPairs')
      .withIndex('by_project', (q) => q.eq('projectId', run.projectId))
      .filter((q) => q.eq(q.field('status'), 'open'))
      .collect();
    const runStartedAt = Number((run as any)?._creationTime ?? 0);
    const allQuestions = allProjectQuestions.filter((q: any) => Number(q.createdAt ?? 0) >= runStartedAt);

    const priorityFor = (q: any) => {
      const sectionPath = Array.isArray(q?.sectionPath) ? q.sectionPath : [];
      const level1 = String(sectionPath[0] ?? '');
      const level2 = String(sectionPath[1] ?? '');

      if (level1 === 'blockers' || q?.blockingLevel === 'blocker') return { key: 'blockers', order: 0 };
      if (level1 === 'per_element') return { key: `element:${level2 || 'general'}`, order: 100 };
      if (level1 === 'project_level') return { key: 'project_level', order: 900 };
      if (level1 === 'suggestions' || q?.blockingLevel === 'optional') return { key: 'suggestions', order: 1000 };
      return { key: level1 || 'general', order: 950 };
    };

    const grouped = new Map<string, { order: number; questions: any[] }>();
    for (const q of allQuestions) {
      const { key, order } = priorityFor(q as any);
      if (!grouped.has(key)) grouped.set(key, { order, questions: [] });
      grouped.get(key)!.questions.push({
        id: q._id,
        questionHe: q.question_he ?? '',
        type: q.questionType ?? 'text',
        options: q.options,
        suggestedAnswers: (q as any).suggestedAnswers,
        allowDontKnow: (q as any).allowDontKnow ?? true,
        blockingLevel: q.blockingLevel ?? 'helpful',
      });
    }

    const groups = Array.from(grouped.entries())
      .sort((a, b) => {
        const orderDiff = a[1].order - b[1].order;
        if (orderDiff !== 0) return orderDiff;
        return a[0].localeCompare(b[0]);
      })
      .map(([key, value]) => {
        const label =
          key === 'blockers'
            ? 'Blockers'
            : key === 'project_level'
              ? 'Project Level'
              : key === 'suggestions'
                ? 'Suggestions'
                : key.startsWith('element:')
                  ? key.replace('element:', '').replace(/_/g, ' ')
                  : key;
        return {
          groupKey: key,
          groupLabelHe: label,
          questions: value.questions,
        };
      });

    // Keep each set between 4-8 questions when possible.
    const sets: typeof groups = [];
    const minPerSet = 4;
    const maxPerSet = 8;
    for (let i = 0; i < groups.length; i += 1) {
      const g = groups[i];
      let cursor = 0;
      while (cursor < g.questions.length) {
        const chunk = g.questions.slice(cursor, cursor + maxPerSet);
        cursor += chunk.length;

        if (chunk.length < minPerSet && cursor >= g.questions.length && i < groups.length - 1) {
          const next = groups[i + 1];
          const needed = minPerSet - chunk.length;
          const borrowed = next.questions.splice(0, needed);
          chunk.push(...borrowed);
        }

        sets.push({
          groupKey: g.groupKey,
          groupLabelHe: g.groupLabelHe,
          questions: chunk,
        });
      }
    }
    if (sets.length > 1) {
      const last = sets[sets.length - 1];
      const prev = sets[sets.length - 2];
      while (last.questions.length < minPerSet && prev.questions.length > minPerSet) {
        const moved = prev.questions.pop();
        if (!moved) break;
        last.questions.unshift(moved);
      }
    }

    const currentSet = sets[args.setIndex] ?? null;
    return {
      currentSet,
      hasMore: args.setIndex < sets.length - 1,
      totalSets: sets.length,
    };
  },
});

export const setPlanningModePreference = mutation({
  args: {
    runId: v.id('sdkRuns'),
    planningMode: v.union(v.literal('separated'), v.literal('combined')),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId)
    if (!run) return
    const planningLlm = planningLlmConfigForMode(args.planningMode)
    const existingCheckpoint =
      (run as any).planningFinalizeCheckpoint && typeof (run as any).planningFinalizeCheckpoint === 'object'
        ? (run as any).planningFinalizeCheckpoint
        : {}
    await ctx.db.patch(args.runId, {
      planningFinalizeCheckpoint: {
        ...existingCheckpoint,
        planningMode: args.planningMode,
        planningModel: planningLlm.model,
        updatedAt: Date.now(),
      },
      updatedAt: Date.now(),
    })
  },
})

// Submit answers for current question set
export const submitAnswers = mutation({
  args: {
    runId: v.id('sdkRuns'),
    answers: v.array(
      v.object({
        questionId: v.id('qaPairs'),
        answer: v.string(),
      })
    ),
    setNotes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const answeredFacts: string[] = [];
    for (const { questionId, answer } of args.answers) {
      const trimmed = String(answer ?? '').trim()
      if (!trimmed) continue
      const qa = await ctx.db.get(questionId)
      await ctx.db.patch(questionId, {
        answerText: trimmed,
        answer_he: trimmed,
        answer: trimmed,
        answerSource: 'typed',
        status: 'resolved',
      });
      const questionText = String((qa as any)?.question_he ?? '').trim()
      answeredFacts.push(questionText ? `Q: ${questionText} -> A: ${trimmed}` : `Answer submitted: ${trimmed}`)
    }
    const notes = String(args.setNotes ?? '').trim();
    const run = await ctx.db.get(args.runId);
    if (run) {
      await ctx.runMutation(internal.sdk.knowledgeRefresh.queueProjectContextRefresh, {
        projectId: run.projectId,
        reason: 'planning.question_set_submitted',
        newFacts: answeredFacts.length > 0 ? answeredFacts : ['Planning question set submitted.'],
        userText: notes || undefined,
        runId: args.runId,
        conversationId: run.conversationId ? (run.conversationId as Id<'agentConversations'>) : undefined,
      });
    }
  },
});

// Regenerate questions based on all answers so far
export const regenerateQuestions = action({
  args: {
    projectId: v.id('projects'),
    runId: v.id('sdkRuns'),
  },
  handler: async (ctx, args) => {
    // Get comprehensive context for LLM
    const projectContext = await ctx.runQuery(api.sdk.api.contextGet, {
      projectId: args.projectId,
      packs: ['project', 'elements', 'tasks', 'materials', 'files', 'qa'],
    });

    // Get all existing answers
    const allQA = await ctx.runQuery(api.sdk.questions.getAllQAPairs, {
      projectId: args.projectId,
    });

    // Get project files for context
    const files = await ctx.runQuery(api.files.listProjectFiles, {
      projectId: args.projectId,
    });

    const oldOpenQuestions = await ctx.runQuery(api.sdk.questions.listOpenForProject, {
      projectId: args.projectId,
    });

    // Generate fresh questions using the same structured contract as initial planning
    const regenResult = await ctx.runAction(api.sdk.runner.runTool, {
      projectId: args.projectId,
      toolId: 'draft.plan_and_questions',
      input: {
        llm: {
          model: 'gpt-5.4',
          reasoningEffort: 'medium',
        },
        mode: 'regenerate_questions',
        includeQuestions: true,
        groupQuestions: true,
        projectContext,
        existingQA: allQA ?? [],
        files: files?.map((f: any) => ({ name: f.name, contentHe: f.contentText })) ?? [],
        groupByPhase: ['blockers', 'per_element', 'project_level', 'suggestions'],
        questionsPerSet: { min: 4, max: 8 },
      },
      runId: args.runId,
    });

    // Validate before mutating existing open questions
    const questionGroups = normalizeQuestionGroups(regenResult);
    const validation = validateGeneratedQuestionGroups(questionGroups, { minQuestions: 4, requireGroups: true })
    if (!validation.ok) {
      return { ok: false, groupsCount: 0, reason: validation.reason ?? 'validation_failed' };
    }

    const inserted = await insertQuestionGroups({
      ctx,
      projectId: args.projectId,
      runId: args.runId,
      groups: questionGroups,
    })

    // Dismiss only previously-open questions once new questions exist
    for (const qa of oldOpenQuestions) {
      await ctx.runMutation(internal.sdk.questions.dismissQuestionById, {
        qaPairId: qa.id as Id<'qaPairs'>,
      })
    }

    await ctx.runMutation(internal.sdk.knowledgeRefresh.queueProjectContextRefresh, {
      projectId: args.projectId,
      reason: 'planning.questions_regenerated',
      newFacts: [
        `Questions regenerated. Groups: ${questionGroups.length}, inserted: ${inserted}.`,
      ],
      runId: args.runId,
    });

    return { ok: true, groupsCount: questionGroups.length, inserted };
  },
});

export const setFinalizeCheckpoint = internalMutation({
  args: {
    runId: v.id('sdkRuns'),
    checkpoint: v.any(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.runId, {
      planningFinalizeCheckpoint: args.checkpoint,
      updatedAt: Date.now(),
    })
  },
})

export const startFinalizePhases = action({
  args: {
    projectId: v.id('projects'),
    runId: v.id('sdkRuns'),
    conversationId: v.id('agentConversations'),
    startFromPhase: v.optional(v.string()),
    planningMode: v.optional(v.union(v.literal('separated'), v.literal('combined'))),
  },
  handler: async (ctx, args) => {
    const run = await ctx.runQuery(internal.sdk.queries.getRun, { runId: args.runId })
    if (!run) throw new Error('Run not found')

    const phases = FINALIZE_PHASES.map((phase) => ({
      phase,
      status: 'pending' as const,
      error: undefined,
      completedAt: undefined,
    }))
    const requestedPhase = String(args.startFromPhase ?? '')
    const startPhase = (FINALIZE_PHASES.includes(requestedPhase as FinalizePhase)
      ? (requestedPhase as FinalizePhase)
      : FINALIZE_PHASES[0])
    const planningMode = resolvePlanningMode(
      args.planningMode ?? (run as any)?.planningFinalizeCheckpoint?.planningMode
    )
    const planningLlm = planningLlmConfigForMode(planningMode)
    const checkpoint = {
      version: 1,
      status: 'running',
      startedAt: Date.now(),
      updatedAt: Date.now(),
      planningMode,
      planningModel: planningLlm.model,
      nextPhase: startPhase,
      lastCompletedPhase: null as string | null,
      latestUserText: '',
      toolOutputs: {},
      context: null,
      needsRepair: false,
      auditFindings: [] as any[],
      toolErrors: [] as Array<{ phase: string; toolId: string; message: string; at: number }>,
      finalReport: null as any,
    }

    await ctx.runMutation(internal.sdk.projectPlanning.setFinalizeCheckpoint, {
      runId: args.runId,
      checkpoint,
    })
    await ctx.runMutation(internal.sdk.projectPlanning.clearPhases, {
      runId: args.runId,
    })
    for (const phase of phases) {
      await ctx.runMutation(api.sdk.projectPlanning.updatePhaseStatus, {
        runId: args.runId,
        phase: phase.phase,
        status: phase.status,
      })
    }

    await ctx.runMutation(internal.sdk.telemetry.logEvent, {
      runId: args.runId,
      type: 'project_planning_finalize_started',
      payload: { stage: startPhase, percent: 0, mode: 'checkpointed' },
    })
    await ctx.scheduler.runAfter(0, internal.sdk.projectPlanning.runFinalizePhase, {
      projectId: args.projectId,
      runId: args.runId,
      conversationId: args.conversationId,
      phase: startPhase,
    })

    return { queued: true, runId: args.runId, startPhase }
  },
})

export const runFinalizePhase = internalAction({
  args: {
    projectId: v.id('projects'),
    runId: v.id('sdkRuns'),
    conversationId: v.id('agentConversations'),
    phase: v.optional(v.string()),
    autoContinue: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const run = await ctx.runQuery(internal.sdk.queries.getRun, { runId: args.runId })
    if (!run) return { ok: false, error: 'Run not found' }

    const rawCheckpoint = (run as any).planningFinalizeCheckpoint ?? {}
    if (String(rawCheckpoint?.status ?? '') === 'cancelled') {
      return { ok: false, cancelled: true, error: 'Finalization cancelled by user' }
    }
    const checkpointMode = resolvePlanningMode(rawCheckpoint?.planningMode)
    const defaultPlanningLlm = planningLlmConfigForMode(checkpointMode)
    const checkpoint: any = {
      version: 1,
      status: 'running',
      startedAt: Number(rawCheckpoint?.startedAt ?? Date.now()),
      updatedAt: Date.now(),
      planningMode: checkpointMode,
      planningModel: String(rawCheckpoint?.planningModel ?? defaultPlanningLlm.model),
      nextPhase: String(rawCheckpoint?.nextPhase ?? FINALIZE_PHASES[0]),
      lastCompletedPhase: rawCheckpoint?.lastCompletedPhase ?? null,
      latestUserText: String(rawCheckpoint?.latestUserText ?? ''),
      toolOutputs: (rawCheckpoint?.toolOutputs && typeof rawCheckpoint.toolOutputs === 'object') ? rawCheckpoint.toolOutputs : {},
      context: rawCheckpoint?.context ?? null,
      needsRepair: Boolean(rawCheckpoint?.needsRepair),
      auditFindings: Array.isArray(rawCheckpoint?.auditFindings) ? rawCheckpoint.auditFindings : [],
      toolErrors: Array.isArray(rawCheckpoint?.toolErrors) ? rawCheckpoint.toolErrors : [],
      finalReport: rawCheckpoint?.finalReport ?? null,
    }

    const explicitPhase = String(args.phase ?? '')
    const phase = (FINALIZE_PHASES.includes(explicitPhase as FinalizePhase)
      ? (explicitPhase as FinalizePhase)
      : (checkpoint.nextPhase as FinalizePhase))
    const planningMode = resolvePlanningMode(checkpoint.planningMode)
    if (!phase || !FINALIZE_PHASES.includes(phase)) {
      return { ok: false, error: 'Invalid phase' }
    }

    const emitStage = async (status: 'running' | 'completed' | 'failed') => {
      await ctx.runMutation(internal.sdk.telemetry.logEvent, {
        runId: args.runId,
        type: 'sdk_finalize_stage_update',
        payload: {
          stage: phase,
          status,
          ts: Date.now(),
        },
      })
    }

    const runTool = async (toolId: string, input: any) =>
      ctx.runAction(api.sdk.runner.runTool, {
        projectId: args.projectId,
        toolId,
        input,
        runId: args.runId,
        conversationId: args.conversationId,
      })

    try {
      await ctx.runMutation(api.sdk.projectPlanning.updatePhaseStatus, {
        runId: args.runId,
        phase,
        status: 'running',
      })
      await emitStage('running')

      if (!checkpoint.latestUserText) {
        const messages = await ctx.runQuery(api.sdk.api.listMessages, {
          conversationId: args.conversationId,
          runId: args.runId,
          limit: 80,
        })
        checkpoint.latestUserText =
          [...(messages ?? [])]
            .reverse()
            .find((m: any) => m?.role === 'user' && String(m?.text ?? '').trim())?.text ?? ''
      }

      if (!checkpoint.context) {
        checkpoint.context = await ctx.runQuery(api.sdk.api.contextGet, {
          projectId: args.projectId,
          packs: ['project', 'elements', 'tasks', 'accounting', 'qa', 'knowledge'],
        })
      }

      const baseInput = {
        userText: String(checkpoint.latestUserText ?? ''),
        finalizePolicy: defaultFinalizePolicy(),
      }
      const planningLlm = {
        model: String(checkpoint.planningModel ?? 'gpt-5.4'),
      }

      if (phase === 'elements' || phase === 'tasks' || phase === 'budget' || phase === 'pricing') {
        if (planningMode === 'combined' && phase === 'elements') {
          const combinedTools = ['plan.elements', 'plan.tasks', 'cost.build_budget'] as const
          const phaseByTool: Record<(typeof combinedTools)[number], 'elements' | 'tasks' | 'budget'> = {
            'plan.elements': 'elements',
            'plan.tasks': 'tasks',
            'cost.build_budget': 'budget',
          }
          for (const combinedToolId of combinedTools) {
            const combinedResult = await runTool(combinedToolId, {
              ...baseInput,
              context: checkpoint.context,
              llm: planningLlm,
            })
            checkpoint.toolOutputs[combinedToolId] = combinedResult
            await ctx.runAction(internal.sdk.api.persistFinalizeStageCheckpoint, {
              projectId: args.projectId,
              conversationId: args.conversationId,
              runId: args.runId,
              stageKey: phaseByTool[combinedToolId],
              toolOutputs: { ...checkpoint.toolOutputs },
              source: `${combinedToolId}.combined`,
            })
            if (phaseByTool[combinedToolId] !== 'elements') {
              await ctx.runMutation(api.sdk.projectPlanning.updatePhaseStatus, {
                runId: args.runId,
                phase: phaseByTool[combinedToolId],
                status: 'success',
              })
            }
            checkpoint.context = await ctx.runQuery(api.sdk.api.contextGet, {
              projectId: args.projectId,
              packs: ['project', 'elements', 'tasks', 'accounting', 'qa', 'knowledge'],
            })
          }
        } else if (planningMode === 'combined' && (phase === 'tasks' || phase === 'budget')) {
          // Combined mode already generated tasks+budget during elements phase.
        } else {
          const runBeforeTool = await ctx.runQuery(internal.sdk.queries.getRun, { runId: args.runId })
          if (String((runBeforeTool as any)?.planningFinalizeCheckpoint?.status ?? '') === 'cancelled') {
            await ctx.runMutation(api.sdk.projectPlanning.updatePhaseStatus, {
              runId: args.runId,
              phase,
              status: 'failed',
              error: 'Cancelled by user',
            })
            return { ok: false, cancelled: true, phase }
          }
          const toolId = TOOL_BY_PHASE[phase]
          const result = await runTool(toolId, {
            ...baseInput,
            context: checkpoint.context,
            llm: phase === 'pricing'
              ? undefined
              : phase === 'tasks' || phase === 'budget'
                ? { ...planningLlm, reasoningEffort: 'medium' }
                : planningLlm,
          })
          checkpoint.toolOutputs[toolId] = result
          await ctx.runAction(internal.sdk.api.persistFinalizeStageCheckpoint, {
            projectId: args.projectId,
            conversationId: args.conversationId,
            runId: args.runId,
            stageKey: phase,
            toolOutputs: { ...checkpoint.toolOutputs },
            source: toolId,
          })
          if (phase === 'pricing') {
            await persistPricingEvidenceFromToolResult({
              ctx,
              projectId: args.projectId,
              result,
              runId: args.runId,
            })
          }
          checkpoint.context = await ctx.runQuery(api.sdk.api.contextGet, {
            projectId: args.projectId,
            packs: ['project', 'elements', 'tasks', 'accounting', 'qa', 'knowledge'],
          })
        }
      } else if (phase === 'audit') {
        const auditResult = await runTool('audit.project', {
          context: checkpoint.context,
          findings: [],
          source: 'planning_finalize_checkpoint',
          llm: {
            model: 'gpt-5.4',
            reasoningEffort: 'medium',
          },
        })
        const findings = Array.isArray(auditResult?.findings) ? auditResult.findings : []
        const auditIntents = collectIntentsFromResult(auditResult)
        checkpoint.auditFindings = findings
        checkpoint.needsRepair = JSON.stringify(findings).toLowerCase().includes('duplicate')
          || JSON.stringify(findings).toLowerCase().includes('missing')
          || JSON.stringify(findings).toLowerCase().includes('price')
          || JSON.stringify(findings).toLowerCase().includes('pricing')
        if (auditIntents.length > 0) {
          await ctx.runAction(internal.sdk.api.persistFinalizeIntentsCheckpoint, {
            projectId: args.projectId,
            conversationId: args.conversationId,
            runId: args.runId,
            stageKey: 'audit',
            intents: auditIntents,
            source: 'audit.project',
          })
        }
        checkpoint.context = await ctx.runQuery(api.sdk.api.contextGet, {
          projectId: args.projectId,
          packs: ['project', 'elements', 'tasks', 'accounting', 'qa', 'knowledge'],
        })
      } else if (phase === 'repair') {
        if (checkpoint.needsRepair) {
          const repairResult = await runTool('maint.sync_and_repair', {
            context: checkpoint.context,
            findings: checkpoint.auditFindings ?? [],
            source: 'planning_finalize_checkpoint',
          })
          const repairIntents = collectIntentsFromResult(repairResult)
          if (repairIntents.length > 0) {
            await ctx.runAction(internal.sdk.api.persistFinalizeIntentsCheckpoint, {
              projectId: args.projectId,
              conversationId: args.conversationId,
              runId: args.runId,
              stageKey: 'repair',
              intents: repairIntents,
              source: 'maint.sync_and_repair',
            })
          }
          const pricingRetry = await runTool('pricing.resolve_lines', {
            ...baseInput,
            context: checkpoint.context,
          })
          checkpoint.toolOutputs['pricing.resolve_lines.retry'] = pricingRetry
          await persistPricingEvidenceFromToolResult({
            ctx,
            projectId: args.projectId,
            result: pricingRetry,
            runId: args.runId,
          })
          await ctx.runAction(internal.sdk.api.persistFinalizeStageCheckpoint, {
            projectId: args.projectId,
            conversationId: args.conversationId,
            runId: args.runId,
            stageKey: 'pricing',
            toolOutputs: { ...checkpoint.toolOutputs },
            source: 'pricing.resolve_lines.retry',
          })
        }
        checkpoint.context = await ctx.runQuery(api.sdk.api.contextGet, {
          projectId: args.projectId,
          packs: ['project', 'elements', 'tasks', 'accounting', 'qa', 'knowledge'],
        })
      } else if (phase === 'package') {
        const pkg = await ctx.runAction(api.sdk.finalize.buildStructuredPackage, {
          projectId: args.projectId,
          runId: args.runId,
          includeAssumptions: true,
        })
        const counts = (pkg as any)?.counts ?? {}
        const elementsHealth = await ctx.runQuery(api.flow.ui.getElementsHealth, {
          projectId: args.projectId,
        })
        checkpoint.finalReport = {
          counts: {
            elements: counts.elements ?? 0,
            tasks: counts.tasks ?? 0,
            materialLines: counts.materialLines ?? 0,
            workLines: counts.workLines ?? 0,
            totalPrice: (elementsHealth as any)?.totals?.totalCost ?? 0,
          },
          summary: (pkg as any)?.summary ?? 'Project plan generated successfully',
          elements: (elementsHealth as any)?.elements ?? [],
          issues: checkpoint.auditFindings ?? [],
          checkpointed: true,
        }
      }

      const nextPhase = nextFinalizePhaseForMode(phase, planningMode)
      const runBeforeContinue = await ctx.runQuery(internal.sdk.queries.getRun, { runId: args.runId })
      const wasCancelled = String((runBeforeContinue as any)?.planningFinalizeCheckpoint?.status ?? '') === 'cancelled'
      checkpoint.lastCompletedPhase = phase
      checkpoint.nextPhase = nextPhase
      checkpoint.updatedAt = Date.now()
      checkpoint.status = wasCancelled ? 'cancelled' : nextPhase ? 'running' : 'completed'
      await ctx.runMutation(internal.sdk.projectPlanning.setFinalizeCheckpoint, {
        runId: args.runId,
        checkpoint,
      })

      await ctx.runMutation(api.sdk.projectPlanning.updatePhaseStatus, {
        runId: args.runId,
        phase,
        status: 'success',
      })
      await emitStage('completed')

      if (!nextPhase || wasCancelled) {
        if (wasCancelled) {
          await ctx.runMutation(api.sdk.projectPlanning.updatePhaseStatus, {
            runId: args.runId,
            phase,
            status: 'failed',
            error: 'Cancelled by user',
          })
          await emitStage('failed')
          return { ok: false, cancelled: true, phase }
        }
        await ctx.runMutation(internal.sdk.telemetry.logEvent, {
          runId: args.runId,
          type: 'project_planning_finalize_completed',
          payload: { stage: 'completed', percent: 100, mode: 'checkpointed' },
        })
        const finalCounts = (checkpoint as any)?.finalReport?.counts ?? {}
        const finalSummary = String((checkpoint as any)?.finalReport?.summary ?? '').trim()
        await ctx.runMutation(internal.sdk.knowledgeRefresh.queueProjectContextRefresh, {
          projectId: args.projectId,
          reason: 'planning.finalize_completed',
          newFacts: [
            `Planning finalization completed. Elements: ${Number(finalCounts.elements ?? 0)}, tasks: ${Number(finalCounts.tasks ?? 0)}, material lines: ${Number(finalCounts.materialLines ?? 0)}, work lines: ${Number(finalCounts.workLines ?? 0)}.`,
            finalSummary ? `Final report summary: ${finalSummary}` : 'Final report generated.',
          ],
          runId: args.runId,
          conversationId: args.conversationId,
        })
        return { ok: true, phase, completed: true }
      }

      if (args.autoContinue !== false) {
        await ctx.scheduler.runAfter(0, internal.sdk.projectPlanning.runFinalizePhase, {
          projectId: args.projectId,
          runId: args.runId,
          conversationId: args.conversationId,
          phase: nextPhase,
        })
      }
      return { ok: true, phase, nextPhase }
    } catch (error: any) {
      checkpoint.status = 'failed'
      checkpoint.updatedAt = Date.now()
      checkpoint.toolErrors = [
        ...(Array.isArray(checkpoint.toolErrors) ? checkpoint.toolErrors : []),
        {
          phase,
          toolId: phase,
          message: String(error?.message ?? 'Unknown error'),
          at: Date.now(),
        },
      ]
      await ctx.runMutation(internal.sdk.projectPlanning.setFinalizeCheckpoint, {
        runId: args.runId,
        checkpoint,
      })
      await ctx.runMutation(api.sdk.projectPlanning.updatePhaseStatus, {
        runId: args.runId,
        phase,
        status: 'failed',
        error: String(error?.message ?? 'Unknown error'),
      })
      await emitStage('failed')
      return { ok: false, phase, error: String(error?.message ?? 'Unknown error') }
    }
  },
})

// Finalize project - checkpointed multi-action flow
export const finalizeProject = action({
  args: {
    projectId: v.id('projects'),
    runId: v.id('sdkRuns'),
    conversationId: v.id('agentConversations'),
    planningMode: v.optional(v.union(v.literal('separated'), v.literal('combined'))),
  },
  handler: async (ctx, args) => {
    await ctx.runMutation(api.sdk.projectPlanning.savePlanningState, {
      runId: args.runId,
      currentStep: 'finalizing',
    })
    return await ctx.runAction(api.sdk.projectPlanning.startFinalizePhases, {
      projectId: args.projectId,
      runId: args.runId,
      conversationId: args.conversationId,
      planningMode: args.planningMode,
    })
  },
});

// Get finalization progress
export const getFinalizationProgress = query({
  args: {
    runId: v.id('sdkRuns'),
  },
  handler: async (ctx, args) => {
    // Get latest finalization events
    const events = await ctx.db
      .query('sdkRunEvents')
      .withIndex('by_run', (q) => q.eq('runId', args.runId))
      .filter((q) =>
        q.or(
          q.eq(q.field('type'), 'project_planning_finalize_started'),
          q.eq(q.field('type'), 'project_planning_finalize_completed'),
          q.eq(q.field('type'), 'sdk_finalize_stage_update')
        )
      )
      .order('desc')
      .take(20);

    const latest = events[0];
    if (!latest) {
      return { stage: '', percent: 0 };
    }

    if (latest.type === 'project_planning_finalize_completed') {
      return { stage: 'completed', percent: 100 };
    }

    if (latest.type === 'sdk_finalize_stage_update') {
      const stage = String(latest.payload?.stage ?? '');
      const status = String(latest.payload?.status ?? '');

      const stagePercents: Record<string, number> = {
        elements: 20,
        tasks: 40,
        budget: 60,
        pricing: 75,
        audit: 90,
        repair: 95,
        package: 98,
      };

      const percent = status === 'completed'
        ? stagePercents[stage] ?? 0
        : (stagePercents[stage] ?? 0) - 5;

      return { stage, percent };
    }

    return { stage: 'elements', percent: 10 };
  },
});

// Get phase results with status
export const getPhaseResults = query({
  args: {
    runId: v.id('sdkRuns'),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run) return [];

    return run.planningFinalizationPhases ?? [];
  },
});

// Rerun a specific phase
export const rerunPhase = action({
  args: {
    projectId: v.id('projects'),
    runId: v.id('sdkRuns'),
    conversationId: v.id('agentConversations'),
    phase: v.string(), // 'elements', 'tasks', 'budget', 'pricing'
    forceNewRun: v.optional(v.boolean()),
    planningMode: v.optional(v.union(v.literal('separated'), v.literal('combined'))),
  },
  handler: async (ctx, args) => {
    let targetRunId = args.runId
    const forceNewRun = args.forceNewRun === true
    const sourceRun = await ctx.runQuery(internal.sdk.queries.getRun, { runId: args.runId })
    const planningMode = resolvePlanningMode(
      args.planningMode ?? (sourceRun as any)?.planningFinalizeCheckpoint?.planningMode
    )

    if (forceNewRun) {
      const started = await ctx.runMutation(api.sdk.api.startRun, {
        projectId: args.projectId,
        conversationId: args.conversationId,
        mode: 'planning',
      })
      targetRunId = started.runId

      await ctx.runMutation(internal.sdk.projectPlanning.setRunMode, {
        runId: targetRunId,
      })
      await ctx.runMutation(api.sdk.projectPlanning.savePlanningState, {
        runId: targetRunId,
        currentStep: 'finalizing',
      })
    }
    await ctx.runAction(api.sdk.projectPlanning.startFinalizePhases, {
      projectId: args.projectId,
      runId: targetRunId,
      conversationId: args.conversationId,
      startFromPhase: args.phase,
      planningMode,
    })
    return { success: true, runId: targetRunId, restartedFromPhase: args.phase }
  },
});

export const getFinalizeCheckpointInfo = query({
  args: {
    runId: v.id('sdkRuns'),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId)
    if (!run) return null
    const checkpoint = (run as any).planningFinalizeCheckpoint ?? {}
    const modeRaw = checkpoint?.planningMode
    const mode =
      modeRaw === 'combined' || modeRaw === 'separated'
        ? (modeRaw as PlanningMode)
        : undefined
    return {
      mode,
      status: typeof checkpoint?.status === 'string' ? checkpoint.status : undefined,
      model: typeof checkpoint?.planningModel === 'string' ? checkpoint.planningModel : undefined,
    }
  },
})

export const cancelFinalizePhase = action({
  args: {
    runId: v.id('sdkRuns'),
    phase: v.string(),
  },
  handler: async (ctx, args) => {
    const run = await ctx.runQuery(internal.sdk.queries.getRun, { runId: args.runId })
    if (!run) throw new Error('Run not found')

    const checkpoint = {
      ...(((run as any).planningFinalizeCheckpoint && typeof (run as any).planningFinalizeCheckpoint === 'object')
        ? (run as any).planningFinalizeCheckpoint
        : {}),
      status: 'cancelled',
      updatedAt: Date.now(),
      cancelledAt: Date.now(),
      cancelledPhase: args.phase,
    }

    await ctx.runMutation(internal.sdk.projectPlanning.setFinalizeCheckpoint, {
      runId: args.runId,
      checkpoint,
    })
    await ctx.runMutation(api.sdk.projectPlanning.updatePhaseStatus, {
      runId: args.runId,
      phase: args.phase,
      status: 'failed',
      error: 'Cancelled by user',
    })
    await ctx.runMutation(internal.sdk.telemetry.logEvent, {
      runId: args.runId,
      type: 'sdk_finalize_stage_update',
      payload: {
        stage: args.phase,
        status: 'failed',
        cancelled: true,
        ts: Date.now(),
      },
    })

    return { ok: true, cancelled: true }
  },
})

export const getFinalReport = query({
  args: {
    runId: v.id('sdkRuns'),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId)
    if (!run) return null
    return (run as any).planningFinalizeCheckpoint?.finalReport ?? null
  },
})

export const compareRecentRunsByMode = query({
  args: {
    projectId: v.id('projects'),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.min(Math.max(args.limit ?? 30, 1), 200)
    const runs = await ctx.db
      .query('sdkRuns')
      .withIndex('by_project', (q) => q.eq('projectId', args.projectId))
      .order('desc')
      .take(limit)

    const planningRuns = runs.filter((run: any) => run.runMode === 'PLANNING_FLOW')
    const normalized = planningRuns.map((run: any) => {
      const checkpoint = (run as any).planningFinalizeCheckpoint ?? {}
      const mode = resolvePlanningMode(checkpoint?.planningMode)
      const finishedAt = typeof run.finishedAt === 'number' ? run.finishedAt : null
      const durationMs = finishedAt ? Math.max(0, finishedAt - run.createdAt) : null
      return {
        runId: run._id,
        mode,
        status: run.status,
        createdAt: run.createdAt,
        finishedAt,
        durationMs,
      }
    })

    const byMode: Record<'separated' | 'combined', { total: number; completed: number; failed: number; running: number; avgDurationMs: number | null }> = {
      separated: { total: 0, completed: 0, failed: 0, running: 0, avgDurationMs: null },
      combined: { total: 0, completed: 0, failed: 0, running: 0, avgDurationMs: null },
    }
    const durationBuckets: Record<'separated' | 'combined', number[]> = { separated: [], combined: [] }

    for (const run of normalized) {
      byMode[run.mode].total += 1
      if (run.status === 'completed') byMode[run.mode].completed += 1
      if (run.status === 'failed') byMode[run.mode].failed += 1
      if (run.status === 'running') byMode[run.mode].running += 1
      if (typeof run.durationMs === 'number') durationBuckets[run.mode].push(run.durationMs)
    }

    for (const mode of ['separated', 'combined'] as const) {
      const values = durationBuckets[mode]
      byMode[mode].avgDurationMs = values.length > 0
        ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)
        : null
    }

    return { runs: normalized, byMode }
  },
})

// Restart planning - go back to questions without deleting context
export const restartPlanning = action({
  args: {
    projectId: v.id('projects'),
    runId: v.id('sdkRuns'),
  },
  handler: async (ctx, args) => {
    // Reset step to questions
    await ctx.runMutation(api.sdk.projectPlanning.savePlanningState, {
      runId: args.runId,
      currentStep: 'questions',
      questionSetIndex: 0,
    });

    // Clear finalization phases
    await ctx.runMutation(internal.sdk.projectPlanning.clearPhases, {
      runId: args.runId,
    });

    // Regenerate questions based on current context
    await ctx.runAction(api.sdk.projectPlanning.regenerateQuestions, {
      projectId: args.projectId,
      runId: args.runId,
    });

    return { success: true };
  },
});

// Internal helper to set run mode
export const setRunMode = internalMutation({
  args: {
    runId: v.id('sdkRuns'),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.runId, {
      runMode: 'PLANNING_FLOW',
    });
  },
});

// Internal helper to clear phases
export const clearPhases = internalMutation({
  args: {
    runId: v.id('sdkRuns'),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.runId, {
      planningFinalizationPhases: [],
      planningFinalizeCheckpoint: undefined,
    });
  },
});
