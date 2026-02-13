"use node";

import { action } from '../_generated/server';
import { v } from 'convex/values';
import { randomUUID } from 'crypto';
import { api, internal } from '../_generated/api';
import { REGISTRY } from './registry';
import { runToolInternal } from './runner';
import { assertAsciiKeys } from './schemas';
import { searchWeb } from '../lib/webSearch';
import { completionWithTracing } from '../lib/llm';
import { runVNextStage } from './vnext/pipeline';
import { getNextVNextStage, normalizeVNextStage } from './vnext/stages';
import {
  allowedToolsForChatIntent,
  detectChatIntent,
  packsForIntent,
  shouldAttachSuggestions,
} from './chatPolicy';

const MAX_TOOL_LOOPS = 6;

function toHeList(items: any) {
  const list = Array.isArray(items) ? items : items ? [items] : [];
  return list.map((item) => {
    if (typeof item === 'string') return item;
    if (item?.messageHe) return item.messageHe;
    if (item?.message_he) return item.message_he;
    if (item?.labelHe) return item.labelHe;
    if (item?.label_he) return item.label_he;
    if (item?.titleHe) return item.titleHe;
    if (item?.title_he) return item.title_he;
    return JSON.stringify(item);
  });
}

function buildReviewBlock(args: { titleHe: string; summaryHe?: string; risks?: any }) {
  const risksHe = toHeList(args.risks ?? []);
  const highlightsHe = args.summaryHe ? [args.summaryHe] : [];
  return {
    type: 'ReviewBlock',
    titleHe: args.titleHe,
    sections: [
      {
        sectionHe: 'סיכום',
        highlightsHe,
        risksHe,
      },
    ],
    risksHe,
  };
}

function collectIntentsFromResult(result: any): any[] {
  const out: any[] = [];
  if (result?.intent) out.push(result.intent);
  if (Array.isArray(result?.intents)) out.push(...result.intents);
  if (Array.isArray(result?.fixIntents)) out.push(...result.fixIntents);
  if (Array.isArray(result?.repairIntents)) out.push(...result.repairIntents);
  return out.filter(Boolean);
}

function normalizeReviewIssues(review: any): any[] {
  if (!review) return [];
  if (Array.isArray(review.issues)) return review.issues;
  const errors = Array.isArray(review.errors) ? review.errors : [];
  const warnings = Array.isArray(review.warnings) ? review.warnings : [];
  return [...errors, ...warnings];
}


function summarizeChangeSetCoverage(changeSet: any) {
  const ops = Array.isArray(changeSet?.ops) ? changeSet.ops : [];
  const entities = ops.map((op: any) => String(op?.entity ?? '').toLowerCase());
  return {
    opCount: ops.length,
    hasElements: entities.includes('element'),
    hasTasks: entities.includes('task'),
    hasAccounting:
      entities.includes('materialline') ||
      entities.includes('workline'),
  };
}

function extractQuestionTexts(text: string): string[] {
  const source = String(text ?? '').trim();
  if (!source) return [];
  const lines = source
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const direct = lines.filter((line) => line.includes('?'));
  if (direct.length > 0) return direct.slice(0, 3);
  const sentenceMatches = source.match(/[^?]+\?/g) ?? [];
  return sentenceMatches.map((s) => s.trim()).filter(Boolean).slice(0, 3);
}

function buildFallbackSuggestionBlock(isPlanningRequest: boolean) {
  if (isPlanningRequest) {
    return {
      type: 'SuggestionsBlock',
      titleHe: 'פעולות המשך',
      suggestions: [
        {
          id: 's_plan_elements',
          labelHe: 'להפיק אלמנטים',
          whyHe: 'מייצר רשימת אלמנטים מסודרת מהבריף',
          payload: { action: 'plan.elements' },
        },
        {
          id: 's_plan_tasks',
          labelHe: 'להפיק משימות',
          whyHe: 'מפרק את האלמנטים למשימות עבודה',
          payload: { action: 'plan.tasks' },
        },
        {
          id: 's_compile_changeset',
          labelHe: 'לקמפל ChangeSet',
          whyHe: 'מייצר סט שינויים ישים לאישור',
          payload: { action: 'changeset.compile' },
        },
      ],
      freeTextPromptHe: 'אם יש תיקון נקודתי, כתוב לי מה לשנות.',
    };
  }

  return {
    type: 'SuggestionsBlock',
    titleHe: 'פעולות המשך',
    suggestions: [
      {
        id: 's_continue',
        labelHe: 'להמשיך',
        whyHe: 'נמשיך לצעד הבא באופן ממוקד',
      },
    ],
    freeTextPromptHe: 'כתוב מה תרצה שאעשה עכשיו.',
  };
}

function clipText(value: any, maxLen: number) {
  const text = String(value ?? '').trim();
  if (!text) return undefined;
  return text.length > maxLen ? `${text.slice(0, maxLen - 3)}...` : text;
}

function compactBootstrapForChat(intent: string | null, context: any) {
  if (!context || typeof context !== 'object') return context;
  const compact: any = {};
  const maxElements = Number(process.env.SDK_CHAT_BOOTSTRAP_MAX_ELEMENTS ?? 8);
  const maxTasks = Number(process.env.SDK_CHAT_BOOTSTRAP_MAX_TASKS ?? 18);
  const maxLines = Number(process.env.SDK_CHAT_BOOTSTRAP_MAX_LINES ?? 12);

  if (context.project) {
    compact.project = {
      id: context.project.id,
      name: context.project.name,
      stage: context.project.stage,
      eventDate: context.project.eventDate,
      status: context.project.status,
      summary: clipText(context.project.summary, 500),
      notes: clipText(context.project.notes, 350),
    };
  }

  if (Array.isArray(context.elements)) {
    compact.elements = context.elements.slice(0, maxElements).map((e: any) => ({
      id: e.id,
      title: e.title,
      status: e.status,
      type: e.type,
      description: clipText(e.description, 220),
    }));
  }

  if (Array.isArray(context.tasks)) {
    compact.tasks = context.tasks.slice(0, maxTasks).map((t: any) => ({
      id: t.id,
      title: t.title,
      elementId: t.elementId,
      status: t.status,
      workType: t.workType,
      estimatedHours: t.estimatedHours,
      description: clipText(t.description, 200),
    }));
  }

  if (intent === 'project_read_qna' || intent === 'project_write_change' || intent === 'planning_request') {
    if (Array.isArray(context.materialLines)) {
      compact.materialLines = context.materialLines.slice(0, maxLines).map((line: any) => ({
        id: line.id,
        taskId: line.taskId,
        elementId: line.elementId,
        title: line.title,
        sectionKey: line.sectionKey,
        plannedTotalCost: line.plannedTotalCost,
      }));
    }
    if (Array.isArray(context.workLines)) {
      compact.workLines = context.workLines.slice(0, maxLines).map((line: any) => ({
        id: line.id,
        taskId: line.taskId,
        elementId: line.elementId,
        title: line.title,
        workType: line.workType,
        hours: line.hours,
        plannedTotalCost: line.plannedTotalCost,
      }));
    }
  }

  if (context.quote) {
    compact.quote = {
      id: context.quote.id,
      titleHe: clipText(context.quote.titleHe, 160),
      createdAt: context.quote.createdAt,
    };
  }

  return compact;
}

function toPromptMessage(m: any, isChatEditRun: boolean) {
  const text = String(m?.text ?? '').trim();
  if (text) return { role: m.role, content: text };
  if (!isChatEditRun && m?.blocks) {
    return { role: m.role, content: JSON.stringify(m.blocks) };
  }
  const blocks = Array.isArray(m?.blocks) ? m.blocks : [];
  const chatLike = blocks
    .map((b: any) => String(b?.markdownHe ?? b?.contentHe ?? b?.titleHe ?? '').trim())
    .filter(Boolean)
    .join('\n');
  return { role: m.role, content: chatLike || '' };
}

function ensureMinimumBlocks(args: {
  blocks: any;
  summaryHe?: string;
  rawText?: string;
  isPlanningRequest: boolean;
  includeSuggestions?: boolean;
}) {
  const blocks = Array.isArray(args.blocks) ? args.blocks.filter(Boolean) : [];
  if (blocks.length > 0) return blocks;

  const sourceText = String(args.rawText ?? args.summaryHe ?? '').trim();
  const questionTexts = extractQuestionTexts(sourceText);
  if (questionTexts.length > 0) {
    return [
      {
        type: 'QuestionsBlock',
        titleHe: 'שאלות להמשך',
        questions: questionTexts.map((textHe, i) => ({
          id: `q_auto_${i + 1}`,
          textHe,
          type: 'text',
        })),
      },
    ];
  }

  if (sourceText) {
    if (!args.includeSuggestions) {
      return [{ type: 'ChatBlock', markdownHe: sourceText }];
    }
    return [{ type: 'ChatBlock', markdownHe: sourceText }, buildFallbackSuggestionBlock(args.isPlanningRequest)];
  }

  if (!args.includeSuggestions) {
    return [{ type: 'ChatBlock', markdownHe: 'יש לי תשובה קצרה. איך להמשיך?' }];
  }
  return [buildFallbackSuggestionBlock(args.isPlanningRequest)];
}

function stableHash(input: string) {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `h${(h >>> 0).toString(16)}`;
}

function normalizeQaQuestionType(value: any): 'text' | 'number' | 'date' | 'single' | 'multi' | 'toggle' {
  const raw = String(value ?? '').toLowerCase();
  if (raw === 'number') return 'number';
  if (raw === 'date') return 'date';
  if (raw === 'single' || raw === 'select') return 'single';
  if (raw === 'multi' || raw === 'multiselect') return 'multi';
  if (raw === 'toggle' || raw === 'boolean' || raw === 'bool') return 'toggle';
  return 'text';
}

function extractVNextQuestionsFromBlocks(blocks: any[]) {
  const out: Array<{
    id: string;
    textHe: string;
    type: 'text' | 'number' | 'date' | 'single' | 'multi' | 'toggle';
    options: Array<{ value: string; labelHe?: string }>;
    blockingLevel: 'blocker' | 'helpful' | 'optional';
  }> = [];

  for (const block of Array.isArray(blocks) ? blocks : []) {
    if (!block || block.type !== 'QuestionsBlock') continue;
    const rawQuestions = Array.isArray(block.questions) ? block.questions : [];
    for (const raw of rawQuestions) {
      const textHe = String(raw?.textHe ?? raw?.questionHe ?? '').trim();
      if (!textHe) continue;
      const options = (Array.isArray(raw?.optionsHe) ? raw.optionsHe : [])
        .map((item: any, index: number) => {
          if (typeof item === 'string') {
            const label = item.trim();
            if (!label) return null;
            return { value: `opt_${index + 1}`, labelHe: label };
          }
          const label = String(item?.labelHe ?? item?.label ?? item?.value ?? '').trim();
          if (!label) return null;
          const value = String(item?.value ?? `opt_${index + 1}`).trim() || `opt_${index + 1}`;
          return { value, labelHe: label };
        })
        .filter(Boolean) as Array<{ value: string; labelHe?: string }>;

      out.push({
        id: String(raw?.id ?? stableHash(textHe.toLowerCase())),
        textHe,
        type: normalizeQaQuestionType(raw?.type),
        options,
        blockingLevel: 'blocker',
      });
    }
  }

  return out;
}

const STAGE_ORDER = ['intake', 'planning', 'costing', 'quote', 'review', 'execution'] as const;
type StageKey = (typeof STAGE_ORDER)[number];

function normalizeStageKey(value: any): StageKey | null {
  if (!value || typeof value !== 'string') return null;
  const key = value.trim().toLowerCase();
  return (STAGE_ORDER as readonly string[]).includes(key) ? (key as StageKey) : null;
}

function enforceStageTransition(current: StageKey, requested: StageKey) {
  const currentIndex = STAGE_ORDER.indexOf(current);
  const requestedIndex = STAGE_ORDER.indexOf(requested);
  if (requestedIndex === -1) return { next: current, reason: 'invalid' as const };
  if (requestedIndex <= currentIndex) return { next: requested, reason: 'same_or_back' as const };
  if (requestedIndex === currentIndex + 1) return { next: requested, reason: 'ok' as const };
  return { next: STAGE_ORDER[Math.min(currentIndex + 1, STAGE_ORDER.length - 1)], reason: 'skip' as const };
}

type ToolHandler = (args: any) => Promise<any>;

function toOpenAIToolName(name: string) {
  return name.replace(/[^a-zA-Z0-9_-]/g, '_');
}

// Rich tool descriptions that tell the LLM WHEN and WHY to use each tool
const TOOL_DESCRIPTIONS: Record<string, string> = {
  'context.get': 'Fetch project context (elements, tasks, accounting, etc). USE THIS at the start of any planning/costing action to get current state.',
  'knowledge.summarize_or_update': 'Update working knowledge doc with new facts. USE THIS when you learn new info about the project.',
  'changeset.compile': 'Convert intents to ChangeSet ops to create/update entities in database. USE THIS after generating intents from plan.* or cost.* tools.',
  'changeset.review': 'Review a ChangeSet draft for issues. USE THIS before applying a changeset.',
  'changeset.apply': 'Apply ChangeSet after user approval. USE THIS only after review passes and user approves.',
  'clarify.next_questions': 'Ask focused clarifying questions. USE THIS only if you truly cannot proceed with 80% rule - prefer making assumptions.',
  'chat.free': 'Free conversation without structured output. USE THIS only when user explicitly wants to chat, not plan.',
  'pricing.resolve_lines': 'Research prices for materials/items. USE THIS when budget lines need verified pricing.',
  'procurement.shopping_plan': 'Plan procurement/shopping list. USE THIS for purchasing planning after budget exists.',
  'finance.ingest_receipt': 'Process and ingest a receipt. USE THIS when user provides receipt for expense tracking.',
  'audit.project': 'Audit plan for completeness and issues. USE THIS before finalizing quote or when user asks to review.',
  'qa.print_files': 'QA check for print files. USE THIS when reviewing graphics/print deliverables.',
  'maint.sync_and_repair': 'Fix data integrity issues. USE THIS when audit finds problems to fix.',
  'intake.parse_brief': 'Parse initial project brief into structured format. USE THIS at very start with raw user input.',
  'plan.elements': 'Generate elements (deliverables) for the project. USE THIS when user asks to plan a project and you have basic info. Returns element intents.',
  'plan.tasks': 'Generate tasks linked to elements. USE THIS after elements exist or together with plan.elements. Returns task intents.',
  'plan.execution_phases': 'Define execution phases with milestones. USE THIS after tasks are planned to organize timeline.',
  'cost.build_budget': 'Generate material and labor cost lines. USE THIS after tasks exist to build budget. Returns accounting intents.',
  'quote.generate': 'Generate client-facing quote from accounting data. USE THIS after budget is built.',
  'runbook.installation': 'Generate install-day runbook. USE THIS when planning installation day operations.',
  'ops.daily_plan': 'Generate daily execution plan. USE THIS for day-to-day work scheduling.',
  'finalize.build_structured_package': 'Build final structured package from current project context and QA assumptions.',
  'admin.set_labor_rates': 'Set labor rates for work types. USE THIS when updating pricing configuration.',
  'admin.confirm_measurements': 'Confirm/update element measurements. USE THIS when measurements are verified.',
};

function buildToolDefinitions(allowedTools: string[], nameMap: Map<string, string>) {
  const usedNames = new Set<string>();
  const makeUniqueName = (base: string) => {
    let candidate = base || 'tool';
    let counter = 1;
    while (usedNames.has(candidate)) {
      candidate = `${base || 'tool'}_${counter}`;
      counter += 1;
    }
    usedNames.add(candidate);
    return candidate;
  };

  return allowedTools.map((name, index) => {
    const baseName = toOpenAIToolName(name);
    const safeBase = /^[a-zA-Z0-9_-]+$/.test(baseName) ? baseName : `tool_${index}`;
    const openAiName = makeUniqueName(safeBase);
    nameMap.set(openAiName, name);
    if (name === 'context.get') {
      return {
        type: 'function',
        function: {
          name: openAiName,
          description: 'Fetch minimal project context by packs.',
          parameters: {
            type: 'object',
            properties: {
              packs: { type: 'array', items: { type: 'string' } },
              filters: { type: 'object' },
            },
            required: ['packs'],
          },
        },
      };
    }
    if (name === 'knowledge.summarize_or_update') {
      return {
        type: 'function',
        function: {
          name: openAiName,
          description: 'Update working knowledge doc with new facts.',
          parameters: {
            type: 'object',
            properties: {
              currentDoc: { type: 'object' },
              newFacts: { type: 'array', items: { type: 'string' } },
              userText: { type: 'string' },
            },
            required: ['newFacts'],
          },
        },
      };
    }
    if (name === 'changeset.compile') {
      return {
        type: 'function',
        function: {
          name: openAiName,
          description: 'Compile intents into a ChangeSet draft.',
          parameters: {
            type: 'object',
            properties: {
              intents: { type: 'array', items: { type: 'object' } },
              context: { type: 'object' },
            },
            required: ['intents'],
          },
        },
      };
    }
    if (name === 'changeset.review') {
      return {
        type: 'function',
        function: {
          name: openAiName,
          description: 'Review a ChangeSet draft.',
          parameters: {
            type: 'object',
            properties: {
              changeSetId: { type: 'string' },
              changeSet: { type: 'object' },
            },
          },
        },
      };
    }
    if (name === 'changeset.apply') {
      return {
        type: 'function',
        function: {
          name: openAiName,
          description: 'Apply ChangeSet after approval.',
          parameters: {
            type: 'object',
            properties: {
              approvalToken: { type: 'string' },
            },
            required: ['approvalToken'],
          },
        },
      };
    }
    if (name === 'web_search') {
      return {
        type: 'function',
        function: {
          name: openAiName,
          description: 'Search the web for real-time information.',
          parameters: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'Search query' },
              templateId: { type: 'string', description: 'materialTemplates id for logging' },
              variantId: { type: 'string', description: 'materialVariants id for logging' },
              uomCode: { type: 'string', description: 'UOM code for pricing context' },
            },
            required: ['query'],
          },
        },
      };
    }
    return {
      type: 'function',
      function: {
        name: openAiName,
        description: TOOL_DESCRIPTIONS[name] ?? `Run tool ${name}`,
        parameters: {
          type: 'object',
          properties: {
            input: { type: 'object' },
          },
        },
      },
    };
  });
}

export const runNext = action({
  args: {
    projectId: v.id('projects'),
    conversationId: v.id('agentConversations'),
    runId: v.id('sdkRuns'),
    userMessage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const cycleStartedAt = Date.now();
    const cycleBudgetMs = Number(process.env.SDK_DISPATCH_CYCLE_BUDGET_MS ?? 120000);
    const flags = await ctx.runQuery(api.featureFlags.getAll, {});
    const useVNextPipeline = Boolean(flags?.ff_sdk_vnext_pipeline);

    const sdkApi = (api as any)['sdk/api'] ?? (api as any).sdk?.api;
    const sdkKnowledge = (api as any)['sdk/knowledge'] ?? (api as any).sdk?.knowledge;
    const sdkChangeset = (api as any)['sdk/changeset'] ?? (api as any).sdk?.changeset;
    const sdkFinalize = (api as any)['sdk/finalize'] ?? (api as any).sdk?.finalize;
    if (!sdkApi || !sdkKnowledge || !sdkChangeset || !sdkFinalize) {
      throw new Error('SDK API modules not available. Run Convex codegen and restart the server.');
    }

    const run = await ctx.runQuery(internal.sdk.queries.getRun, {
      runId: args.runId,
    });
    if (!run) throw new Error('Run not found');
    const runMode = run.runMode ?? 'PLANNING_FLOW';
    const isPlanningRun = runMode === 'PLANNING_FLOW';
    const shouldUseVNextPipeline = useVNextPipeline && isPlanningRun;

    if (
      run.status === 'paused' ||
      run.status === 'cancelled' ||
      run.status === 'completed' ||
      run.status === 'failed'
    ) {
      return { status: run.status };
    }

    // Waiting states are hard-blocking only for planning flow.
    if (run.status === 'blocked' || run.status === 'needs_input') {
      if (!isPlanningRun && args.userMessage && args.userMessage !== '__continue__') {
        await ctx.runMutation(internal.sdk.telemetry.updateRunState, {
          runId: args.runId,
          status: 'running',
          lastError: undefined,
        });
      } else {
      return {
        status: run.status,
        lastError: run.lastError,
        pendingChangeSetId: run.pendingChangeSetId,
      };
      }
    }

    if (args.userMessage && args.userMessage !== '__continue__') {
      await ctx.runMutation(internal.sdk.telemetry.appendMessage, {
        conversationId: args.conversationId,
        role: 'user',
        text: args.userMessage,
        runId: args.runId,
      });
    }

    if (run.status === 'awaiting_approval') {
      return { status: 'awaiting_approval', pendingChangeSetId: run.pendingChangeSetId };
    }

    if (shouldUseVNextPipeline) {
      let effectiveRun = run;
      if (args.userMessage === '__continue__') {
        const currentStage = normalizeVNextStage(run.stageKey);
        const stageArtifact = await ctx.runQuery(
          internal['sdk/vnext/artifacts'].getStageArtifactByRunStage,
          {
            runId: args.runId,
            stageKey: currentStage,
          }
        );
        const canAdvance = stageArtifact?.status === 'ready_for_checkpoint';
        const nextStage = canAdvance ? getNextVNextStage(currentStage) : null;
        if (nextStage) {
          await ctx.runMutation(internal.sdk.telemetry.updateRunState, {
            runId: args.runId,
            stageKey: nextStage,
            status: 'running',
            currentAgentName: 'vnext_pipeline',
            progressKey: `${nextStage}:init`,
            progressCount: 0,
            noProgressCount: 0,
          });
          await ctx.runMutation(internal.sdk.telemetry.logEvent, {
            runId: args.runId,
            type: 'vnext_stage_transition',
            payload: {
              fromStage: currentStage,
              toStage: nextStage,
            },
          });
          effectiveRun = { ...run, stageKey: nextStage, status: 'running' };
        } else {
          await ctx.runMutation(internal.sdk.telemetry.updateRunState, {
            runId: args.runId,
            status: 'running',
            currentAgentName: 'vnext_pipeline',
          });
        }
      }

      const result = await runVNextStage({
        ctx,
        projectId: args.projectId,
        conversationId: args.conversationId,
        run: effectiveRun,
        runId: args.runId,
        userMessage: args.userMessage,
        options: {
          softGates: Boolean(flags?.ff_sdk_vnext_soft_gates ?? true),
          pricingQueue: Boolean(flags?.ff_sdk_vnext_pricing_queue ?? true),
          stageBudgets: Boolean(flags?.ff_sdk_vnext_stage_budgets ?? true),
        },
      });
      const cycleElapsedMs = Date.now() - cycleStartedAt;
      if (cycleElapsedMs > cycleBudgetMs) {
        await ctx.runMutation(internal.sdk.telemetry.logEvent, {
          runId: args.runId,
          type: 'dispatch_cycle_budget_warn',
          payload: {
            cycleElapsedMs,
            cycleBudgetMs,
            stageKey: result.stageKey,
          },
        });
      }

      const vnextQuestions = extractVNextQuestionsFromBlocks(result.blocks);
      let qaBridge: { created: number; updated: number; reusedResolved: number; total: number } | null = null;
      if (vnextQuestions.length > 0) {
        qaBridge = await ctx.runMutation(internal['sdk/questions'].upsertVNextQuestionsBridge, {
          projectId: args.projectId,
          stageKey: String(result.stageKey ?? 'brief'),
          questions: vnextQuestions,
        });
        await ctx.runMutation(internal.sdk.telemetry.logEvent, {
          runId: args.runId,
          type: 'vnext_questions_seeded_qapairs',
          payload: qaBridge,
        });
      }

      await ctx.runMutation(internal.sdk.telemetry.appendMessage, {
        conversationId: args.conversationId,
        role: 'assistant',
        text: `vNext stage ${result.stageKey}: ${result.status}`,
        blocks: result.blocks,
        runId: args.runId,
      });
      await ctx.runMutation(internal.sdk.telemetry.logEvent, {
        runId: args.runId,
        type: 'vnext_stage_result',
        payload: { ...result, qaBridge },
      });
      await ctx.runMutation(internal.sdk.telemetry.logEvent, {
        runId: args.runId,
        type: 'vnext_stage_exit',
        payload: {
          stageKey: result.stageKey,
          status: result.status,
          nextStageKey: result.nextStageKey ?? null,
        },
      });

      return {
        status: 'success',
        output: result,
      };
    }

    const pendingIntents: any[] = [];
    let autoCompiled = false;

    const orchestrator = REGISTRY.orchestrator;
    if (!orchestrator) throw new Error('Agent orchestrator not found in registry');

    await ctx.runMutation(internal.sdk.telemetry.updateRunState, {
      runId: args.runId,
      status: 'running',
      currentAgentName: 'orchestrator',
    });

    const historyLimit = 50;
    const history = await ctx.runQuery(sdkApi.listMessages, {
      conversationId: args.conversationId,
      limit: historyLimit,
    });

    const isPlanningRequest = (text: string): boolean => {
      const patterns = [
        'plan',
        'planning',
        'start plan',
        'create plan',
        'build budget',
        'budget',
        'quote',
        'elements',
        'tasks',
        'תכנון',
        'תכנן',
        'תקציב',
      ];
      const lower = (text || '').toLowerCase();
      return patterns.some((p) => lower.includes(p.toLowerCase()));
    };

    const lastUserMsg = args.userMessage ||
      history.filter((m: any) => m.role === 'user').slice(-1)[0]?.text || '';
    const isChatEditRun = runMode === 'CHAT_EDIT';
    const chatIntent = isChatEditRun ? detectChatIntent(lastUserMsg) : null;
    const shouldForceTools = !isChatEditRun && isPlanningRequest(lastUserMsg);
    const strictFullPlanMode = !isChatEditRun && shouldForceTools;

    if (isChatEditRun) {
      await ctx.runMutation(internal.sdk.telemetry.logEvent, {
        runId: args.runId,
        type: 'chat_intent_detected',
        payload: { intent: chatIntent, userMessage: lastUserMsg.slice(0, 250) },
      });
    }

    const bootstrapPacks = isChatEditRun
      ? []
      : ['project', 'elements', 'tasks', 'accounting', 'quote', 'knowledge', 'qa'];
    const shouldBootstrapContext = bootstrapPacks.length > 0 && (!isChatEditRun || chatIntent !== 'chat_smalltalk');
    const bootstrapContext = shouldBootstrapContext
      ? await ctx.runQuery(sdkApi.contextGet, {
        projectId: args.projectId,
        packs: bootstrapPacks,
      })
      : null;

    if (isChatEditRun) {
      await ctx.runMutation(internal.sdk.telemetry.logEvent, {
        runId: args.runId,
        type: 'chat_context_fetch',
        payload: {
          intent: chatIntent,
          packs: bootstrapPacks,
          fetched: Boolean(bootstrapContext),
        },
      });
    }

    const promptBootstrapContext = bootstrapContext;

    const messages: any[] = [
      { role: 'system', content: orchestrator.systemPrompt },
      {
        role: 'system',
        content: isChatEditRun
          ? 'Chat mode policy: concise Hebrew responses. For any non-smalltalk request, call context.get first with full packs ["project","elements","tasks","accounting","quote","knowledge","qa"] and only then answer from that context.'
          : 'Planning mode policy: progress the planning pipeline with structured outputs.',
      },
      ...(promptBootstrapContext ? [{
        role: 'system',
        content: `PROJECT CONTEXT (bootstrap, may be partial):\n${JSON.stringify(promptBootstrapContext, null, 2)}`,
      }] : []),
      ...history.map((m: any) => toPromptMessage(m, isChatEditRun)),
    ];

    const toolHandlers: Record<string, ToolHandler> = {
      'context.get': async (input: any) =>
        ctx.runQuery(sdkApi.contextGet, {
          projectId: args.projectId,
          packs: input?.packs ?? (
            isChatEditRun
              ? ['project', 'elements', 'tasks', 'accounting', 'quote', 'knowledge', 'qa']
              : ['project', 'knowledge']
          ),
          filters: input?.filters,
        }),
      'knowledge.summarize_or_update': async (input: any) =>
        ctx.runAction(sdkKnowledge.summarizeOrUpdate, {
          projectId: args.projectId,
          currentDoc: input?.currentDoc,
          newFacts: input?.newFacts ?? [],
          userText: input?.userText,
          runId: args.runId,
          conversationId: args.conversationId,
        }),
      'changeset.compile': async (input: any) => {
        const intents = Array.isArray(input?.intents) ? input.intents : [];
        if (intents.length === 0) {
          await ctx.runMutation(internal.sdk.telemetry.logEvent, {
            runId: args.runId,
            type: 'changeset_compile_error',
            payload: { reason: 'empty_intents' },
          });
          return {
            error: 'changeset.compile requires intents. Generate plan intents first (plan.elements/plan.tasks/cost.build_budget).',
            code: 'EMPTY_INTENTS',
          };
        }

        const result = await ctx.runAction(sdkChangeset.compile, {
          projectId: args.projectId,
          intents,
          context: input?.context,
          runId: args.runId,
          conversationId: args.conversationId,
        });

        if (result?.changeSetId && !run.shadowMode) {
          const blocks: any[] = [];
          const coverage = summarizeChangeSetCoverage(result?.changeSet);
          const coverageIssues: string[] = [];
          if (strictFullPlanMode && !coverage.hasElements) {
            coverageIssues.push('חסרות פעולות אלמנטים ב-ChangeSet');
          }
          if (strictFullPlanMode && !coverage.hasTasks) {
            coverageIssues.push('חסרות פעולות משימות ב-ChangeSet');
          }
          if (strictFullPlanMode && !coverage.hasAccounting) {
            coverageIssues.push('חסרות פעולות תמחור/הנהלת חשבונות (material/work lines) ב-ChangeSet');
          }
          if (coverageIssues.length > 0) {
            await ctx.runMutation(internal.sdk.telemetry.logEvent, {
              runId: args.runId,
              type: 'changeset_coverage_failed',
              payload: {
                changeSetId: result.changeSetId,
                coverage,
                issues: coverageIssues,
              },
            });
            blocks.push(
              buildReviewBlock({
                titleHe: 'בדיקת שלמות ChangeSet',
                summaryHe: 'ה-ChangeSet לא מכסה את כל הרכיבים הנדרשים לבקשה.',
                risks: coverageIssues,
              })
            );
            await ctx.runMutation(internal.sdk.telemetry.updateRunState, {
              runId: args.runId,
              status: 'blocked',
              pendingChangeSetId: result.changeSetId,
              approvalToken: undefined,
              lastError: 'CHANGESET_INCOMPLETE',
            });
            await ctx.runMutation(internal.sdk.telemetry.appendMessage, {
              conversationId: args.conversationId,
              role: 'assistant',
              text: 'ה-ChangeSet לא שלם. נדרש תיקון לפני אישור.',
              blocks,
              runId: args.runId,
            });
            return {
              ...result,
              error: 'CHANGESET_INCOMPLETE',
              coverage,
            };
          }

          const review = await ctx.runAction(sdkChangeset.review, {
            projectId: args.projectId,
            changeSetId: result.changeSetId,
            runId: args.runId,
            conversationId: args.conversationId,
          });

          const reviewIssues = normalizeReviewIssues(review);
          await ctx.runMutation(internal.sdk.telemetry.logEvent, {
            runId: args.runId,
            type: 'changeset_review',
            payload: {
              changeSetId: result.changeSetId,
              issues: reviewIssues,
              summaryHe: review?.summaryHe,
            },
          });
          blocks.push(
            buildReviewBlock({
              titleHe: 'בדיקת ChangeSet',
              summaryHe: review?.summaryHe,
              risks: reviewIssues,
            })
          );

          if (reviewIssues.length > 0) {
            await ctx.runMutation(internal.sdk.telemetry.updateRunState, {
              runId: args.runId,
              status: 'blocked',
              pendingChangeSetId: result.changeSetId,
              approvalToken: undefined,
            });
            await ctx.runMutation(internal.sdk.telemetry.appendMessage, {
              conversationId: args.conversationId,
              role: 'assistant',
              text: 'נדרש תיקון לפני אישור.',
              blocks,
              runId: args.runId,
            });
            return result;
          }

          const approvalToken = randomUUID();
          await ctx.runMutation(internal.sdk.telemetry.updateRunState, {
            runId: args.runId,
            status: 'awaiting_approval',
            pendingChangeSetId: result.changeSetId,
            approvalToken,
          });

          blocks.push({
            type: 'ChangeSetBlock',
            titleHe: 'שינויים מוצעים',
            summaryHe: 'נדרש אישור לפני ביצוע.',
            changeSetId: result.changeSetId,
          });

          await ctx.runMutation(internal.sdk.telemetry.appendMessage, {
            conversationId: args.conversationId,
            role: 'assistant',
            text: 'יש שינויים מוצעים לאישור.',
            blocks,
            runId: args.runId,
          });
        }

        return result;
      },
      'changeset.review': async (input: any) =>
        ctx.runAction(sdkChangeset.review, {
          projectId: args.projectId,
          changeSetId: input?.changeSetId,
          changeSet: input?.changeSet,
          runId: args.runId,
          conversationId: args.conversationId,
        }),
      'changeset.apply': async (input: any) => {
        const reviewEvent = await ctx.runQuery(internal.sdk.queries.getLatestReviewForRun, {
          runId: args.runId,
          changeSetId: run.pendingChangeSetId,
        });
        if (!reviewEvent) {
          throw new Error('ChangeSet review required before apply');
        }
        const issues = Array.isArray(reviewEvent.payload?.issues)
          ? reviewEvent.payload.issues
          : [];
        if (issues.length > 0) {
          throw new Error('ChangeSet review has unresolved issues');
        }

        return await ctx.runAction(sdkChangeset.apply, {
          runId: args.runId,
          approvalToken: input?.approvalToken ?? '',
        });
      },
      'finalize.build_structured_package': async (input: any) =>
        ctx.runAction(sdkFinalize.buildStructuredPackage, {
          projectId: args.projectId,
          runId: args.runId,
          includeAssumptions: input?.includeAssumptions,
        }),
      web_search: async (input: any) => {
        const q = String(input?.query ?? '');
        if (!q) {
          return { error: 'Missing query' };
        }
        const result = await searchWeb(q);
        return result;
      },
    };

    for (const toolId of Object.keys(REGISTRY)) {
      if (!toolHandlers[toolId]) {
        toolHandlers[toolId] = async (input: any) =>
          runToolInternal({
            ctx,
            projectId: args.projectId,
            toolId,
            input: input?.input ?? input ?? {},
            runId: args.runId,
            conversationId: args.conversationId,
          });
      }
    }

    const toolNameMap = new Map<string, string>();
    const allowedTools = isChatEditRun
      ? allowedToolsForChatIntent(chatIntent ?? 'project_read_qna')
      : (orchestrator.allowedTools ?? []);
    const tools = buildToolDefinitions(allowedTools, toolNameMap);

    if (isChatEditRun) {
      await ctx.runMutation(internal.sdk.telemetry.logEvent, {
        runId: args.runId,
        type: 'chat_tool_policy',
        payload: {
          intent: chatIntent,
          allowedTools,
        },
      });
    }

    if (strictFullPlanMode) {
      const deterministicIntents: any[] = [];
      const planningPayload = {
        userText: lastUserMsg,
        context: bootstrapContext,
      };
      const deterministicTools = ['plan.elements', 'plan.tasks', 'cost.build_budget'];
      for (const toolId of deterministicTools) {
        let toolResult: any;
        try {
          toolResult = await runToolInternal({
            ctx,
            projectId: args.projectId,
            toolId,
            input: planningPayload,
            runId: args.runId,
            conversationId: args.conversationId,
          });
        } catch (error: any) {
          toolResult = { error: error?.message ?? String(error) };
        }

        await ctx.runMutation(internal.sdk.telemetry.logEvent, {
          runId: args.runId,
          type: 'deterministic_tool_result',
          payload: {
            toolId,
            ok: !toolResult?.error,
          },
        });

        if (toolResult?.error) {
          await ctx.runMutation(internal.sdk.telemetry.updateRunState, {
            runId: args.runId,
            status: 'blocked',
            approvalToken: undefined,
            lastError: `DETERMINISTIC_TOOL_FAILED:${toolId}`,
          });
          const blocks = [
            buildReviewBlock({
              titleHe: 'כשלון בתכנון דטרמיניסטי',
              summaryHe: `הכלי ${toolId} נכשל`,
              risks: [String(toolResult.error)],
            }),
          ];
          await ctx.runMutation(internal.sdk.telemetry.appendMessage, {
            conversationId: args.conversationId,
            role: 'assistant',
            text: 'התהליך נעצר בגלל שגיאת כלי. נדרש תיקון.',
            blocks,
            runId: args.runId,
          });
          return {
            status: 'success',
            output: { summaryHe: 'Pipeline blocked', blocks },
          };
        }

        const intents = collectIntentsFromResult(toolResult);
        if (intents.length > 0) deterministicIntents.push(...intents);
      }

      if (deterministicIntents.length === 0) {
        await ctx.runMutation(internal.sdk.telemetry.updateRunState, {
          runId: args.runId,
          status: 'blocked',
          approvalToken: undefined,
          lastError: 'NO_INTENTS_FROM_PIPELINE',
        });
        const blocks = [
          buildReviewBlock({
            titleHe: 'כשלון יצירת אינטנטים',
            summaryHe: 'לא נוצרו אינטנטים תקינים לתכנון',
            risks: ['NO_INTENTS_FROM_PIPELINE'],
          }),
        ];
        await ctx.runMutation(internal.sdk.telemetry.appendMessage, {
          conversationId: args.conversationId,
          role: 'assistant',
          text: 'לא נוצרו אינטנטים. התהליך נעצר כדי למנוע לולאות מיותרות.',
          blocks,
          runId: args.runId,
        });
        return {
          status: 'success',
          output: { summaryHe: 'Pipeline blocked', blocks },
        };
      }

      const compileResult = await toolHandlers['changeset.compile']({
        intents: deterministicIntents,
        context: bootstrapContext,
      });

      if (compileResult?.error && !compileResult?.changeSetId) {
        await ctx.runMutation(internal.sdk.telemetry.updateRunState, {
          runId: args.runId,
          status: 'blocked',
          approvalToken: undefined,
          lastError: 'CHANGESET_COMPILE_FAILED',
        });
        const blocks = [
          buildReviewBlock({
            titleHe: 'כשלון קומפילציית ChangeSet',
            summaryHe: 'לא ניתן להפיק ChangeSet תקין',
            risks: [String(compileResult.error)],
          }),
        ];
        await ctx.runMutation(internal.sdk.telemetry.appendMessage, {
          conversationId: args.conversationId,
          role: 'assistant',
          text: 'לא ניתן להשלים שינויי מערכת. התהליך נעצר לתיקון.',
          blocks,
          runId: args.runId,
        });
      }

      return {
        status: 'success',
        output: compileResult,
      };
    }

    let finalContent: string | null = null;
    let lastToolSignature: string | null = null;
    let repeatedToolSignatureCount = 0;
    const maxToolLoops = isChatEditRun ? 2 : MAX_TOOL_LOOPS;
    const runtimeModel = isChatEditRun ? 'gpt-5-mini' : orchestrator.model;
    const runtimeReasoningEffort = isChatEditRun ? 'minimal' : orchestrator.reasoningEffort;
    const runtimeMaxCompletionTokens = isChatEditRun
      ? undefined
      : orchestrator.maxCompletionTokens;
    const runtimeMaxTokens = isChatEditRun
      ? undefined
      : orchestrator.maxTokens;
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('Missing OPENAI_API_KEY');
    }
    for (let i = 0; i < maxToolLoops; i++) {
      // Force tool usage on first iteration for planning or non-smalltalk chat
      const shouldForceContextFetch = isChatEditRun && chatIntent !== 'chat_smalltalk';
      const toolChoice = (i === 0 && (shouldForceTools || shouldForceContextFetch) && tools.length > 0) ? 'required' : 'auto';

      const response = await completionWithTracing(
        ctx,
        {
          model: runtimeModel,
          reasoning_effort: runtimeReasoningEffort,
          temperature: orchestrator.temperature,
          ...(typeof runtimeMaxTokens === 'number' ? { max_tokens: runtimeMaxTokens } : {}),
          ...(typeof runtimeMaxCompletionTokens === 'number' ? { max_completion_tokens: runtimeMaxCompletionTokens } : {}),
          messages,
          tools,
          tool_choice: toolChoice,
          traceMeta: {
            source: 'sdk',
            runId: args.runId,
            forcedTools: toolChoice === 'required',
          },
        },
        {
          projectId: args.projectId,
          conversationId: args.conversationId,
          runId: args.runId,
        }
      ) as any;
      const message = response.choices?.[0]?.message;
      if (!message) throw new Error('Empty LLM response');

      if (message.tool_calls && message.tool_calls.length > 0) {
        let toolCalledCompile = false;
        const currentToolSignature = message.tool_calls
          .map((call: any) => String(call?.function?.name ?? ''))
          .sort()
          .join('|');
        if (currentToolSignature && currentToolSignature === lastToolSignature) {
          repeatedToolSignatureCount += 1;
        } else {
          repeatedToolSignatureCount = 0;
          lastToolSignature = currentToolSignature;
        }
        if (repeatedToolSignatureCount >= 2) {
          finalContent = JSON.stringify({
            summaryHe: 'התהליך נעצר כדי למנוע לולאה חוזרת ללא התקדמות.',
            blocks: [
              buildReviewBlock({
                titleHe: 'זוהתה לולאת כלים',
                summaryHe: 'אותו רצף כלים חזר מספר פעמים ללא התקדמות.',
                risks: ['REPEATED_TOOL_SEQUENCE'],
              }),
              buildFallbackSuggestionBlock(false),
            ],
          });
          await ctx.runMutation(internal.sdk.telemetry.logEvent, {
            runId: args.runId,
            type: 'loop_guard_triggered',
            payload: {
              signature: currentToolSignature,
              repeatCount: repeatedToolSignatureCount,
            },
          });
          break;
        }
        messages.push({
          role: 'assistant',
          content: message.content ?? '',
          tool_calls: message.tool_calls,
        });

        for (const call of message.tool_calls) {
          const openAiToolName = call.function.name;
          const toolName = toolNameMap.get(openAiToolName) ?? openAiToolName;
          if (toolName === 'changeset.compile') toolCalledCompile = true;
          let toolArgs: any = {};
          try {
            toolArgs = call.function.arguments ? JSON.parse(call.function.arguments) : {};
          } catch (err) {
            toolArgs = {};
          }

          await ctx.runMutation(internal.sdk.telemetry.logEvent, {
            runId: args.runId,
            type: 'tool_call',
            payload: { toolName, toolArgs },
          });

          if (isChatEditRun && !allowedTools.includes(toolName)) {
            await ctx.runMutation(internal.sdk.telemetry.logEvent, {
              runId: args.runId,
              type: 'chat_heavy_tool_blocked',
              payload: { toolName, reason: 'not_allowed_for_intent', intent: chatIntent },
            });
            messages.push({
              role: 'tool',
              tool_call_id: call.id,
              content: JSON.stringify({ error: `Tool ${toolName} is not allowed for current intent` }),
            });
            continue;
          }

          let result: any;
          try {
            const handler = toolHandlers[toolName];
            if (!handler) throw new Error(`Tool ${toolName} not available`);
            result = await handler(toolArgs);
          } catch (error: any) {
            result = { error: error?.message ?? String(error) };
          }

          const intentsFromResult = collectIntentsFromResult(result);
          if (intentsFromResult.length > 0) {
            pendingIntents.push(...intentsFromResult);
          }

          messages.push({
            role: 'tool',
            tool_call_id: call.id,
            content: JSON.stringify(result),
          });
        }

        if (!isChatEditRun && !toolCalledCompile && pendingIntents.length > 0 && !autoCompiled) {
          autoCompiled = true;
          let compileResult: any;
          try {
            compileResult = await toolHandlers['changeset.compile']({
              intents: pendingIntents,
            });
          } catch (error: any) {
            compileResult = { error: error?.message ?? String(error) };
          }

          messages.push({
            role: 'system',
            content: `AUTO TOOL RESULT (changeset.compile): ${JSON.stringify(compileResult)}`,
          });
        }

        continue;
      }

      finalContent = message.content ?? '';
      break;
    }

    if (!finalContent && isChatEditRun) {
      const rescueResponse = await completionWithTracing(
        ctx,
        {
          model: runtimeModel,
          reasoning_effort: runtimeReasoningEffort,
          ...(typeof runtimeMaxTokens === 'number' ? { max_tokens: runtimeMaxTokens } : {}),
          messages: [
            ...messages,
            {
              role: 'system',
              content: 'Return a short direct Hebrew answer as plain text now. Do not call tools.',
            },
          ],
          traceMeta: {
            source: 'sdk',
            runId: args.runId,
            rescue: true,
          },
        },
        {
          projectId: args.projectId,
          conversationId: args.conversationId,
          runId: args.runId,
        }
      ) as any;

      const rescueMessage = rescueResponse?.choices?.[0]?.message;
      const rescueContent = String(rescueMessage?.content ?? '').trim();
      if (rescueContent) {
        finalContent = rescueContent;
        await ctx.runMutation(internal.sdk.telemetry.logEvent, {
          runId: args.runId,
          type: 'chat_rescue_text_success',
          payload: {
            finishReason: rescueResponse?.choices?.[0]?.finish_reason ?? null,
          },
        });
      } else {
        await ctx.runMutation(internal.sdk.telemetry.logEvent, {
          runId: args.runId,
          type: 'chat_rescue_text_empty',
          payload: {
            finishReason: rescueResponse?.choices?.[0]?.finish_reason ?? null,
          },
        });
      }
    }

    if (!finalContent) {
      finalContent = 'לא התקבלה תשובה. נסה שוב.';
    }

    let parsed: any;
    try {
      parsed = JSON.parse(finalContent);
      assertAsciiKeys(parsed);
    } catch (error) {
      parsed = { blocks: [{ type: 'ChatBlock', contentHe: finalContent }] };
    }

    // Helper: Check if response has actionable structured content
    const hasActionableContent = (p: any): boolean => {
      const blocks = p?.blocks ?? [];
      const hasBlocks = blocks.some((b: any) =>
        b?.type === 'ChatBlock' ||
        b?.type === 'QuestionsBlock' ||
        b?.type === 'SuggestionBlock' ||
        b?.type === 'SuggestionsBlock' ||
        b?.type === 'ChangeSetBlock' ||
        b?.type === 'ReviewBlock'
      );
      const hasIntent = p?.intent != null;
      return hasBlocks || hasIntent;
    };

    // Helper: Check if text contains refusal phrases
    const isRefusal = (text: string): boolean => {
      const refusalPhrases = [
        'אני לא יכול',
        'לא יכולה',
        'אין לי מספיק',
        'צריך יותר מידע',
        'cannot create',
        'cannot generate',
        'I need more information',
        'I can\'t',
      ];
      const lower = (text || '').toLowerCase();
      return refusalPhrases.some(p => lower.includes(p.toLowerCase()));
    };

    // Helper: Check if agent is talking ABOUT doing instead of DOING
    const isTalkingAboutDoing = (text: string): boolean => {
      const patterns = [
        'נצטרך לפרט',        // we'll need to detail
        'בשלב הבא',         // in the next step
        'אני אתחיל',         // I'll start
        'אני אעבור',         // I'll go through
        'אמשיך ב',           // I'll continue with
        'נתחיל ב',           // we'll start with
        'אני מתכנן',         // I'm planning
        'התכנון יכלול',      // the plan will include
        'אני אעשה',          // I will do
        'אני אמשיך',         // I will continue
        'הנה מה שאני מתכנן',  // here's what I'm planning
        'אני בונה לך',       // I'm building for you (describing)
        'כרגע אני מתקדם',    // currently I'm proceeding
        'הנחות עבודה',       // working assumptions
        'שאלות כדי לנעול',   // questions to lock in
        'ענה לי על',         // answer me on
        'כדי להתקדם',        // in order to proceed
        'אעדכן את',          // I'll update
        'I will create',
        'I will generate',
        'Let me start by',
        'I\'ll proceed',
        'I am going to',
      ];
      const lower = (text || '').toLowerCase();
      return patterns.some(p => lower.includes(p.toLowerCase()));
    };

    let summaryHe = parsed.summaryHe ?? parsed.contentHe ?? 'תשובה מהסוכן';
    let blocks = parsed.blocks ?? [];

    // Check if agent needs recovery - use finalContent for pattern matching, not summaryHe
    // This is critical because when plain text is wrapped in ChatBlock, summaryHe becomes fallback
    const needsRecovery = !isChatEditRun && (
      !hasActionableContent(parsed) ||
      isRefusal(finalContent) ||
      isTalkingAboutDoing(finalContent)
    );

    // DYNAMIC RECOVERY: If agent gave refusal, lacks actionable content, or is just talking about doing
    if (needsRecovery) {
      const reason = isRefusal(finalContent) ? 'refusal_detected' :
        isTalkingAboutDoing(finalContent) ? 'talking_not_doing' :
          'no_actionable_blocks';
      console.warn(`[SDK] Agent response needs recovery: ${reason}, re-prompting...`);

      await ctx.runMutation(internal.sdk.telemetry.logEvent, {
        runId: args.runId,
        type: 'recovery_triggered',
        payload: {
          reason,
          originalSummary: summaryHe
        },
      });

      // Add recovery system message with explicit tool hints
      messages.push({
        role: 'assistant',
        content: finalContent,
      });
      messages.push({
        role: 'system',
        content: `RECOVERY REQUIRED: You described what you will do but did not actually DO it.

Your response: "${summaryHe.slice(0, 150)}..."

This is NOT acceptable. You must CALL TOOLS, not describe calling them.

CALL ONE OF THESE TOOLS NOW:
• plan.elements - to generate elements for the project
• plan.tasks - to generate tasks  
• cost.build_budget - to generate budget lines
• changeset.compile - to create a ChangeSet from intents
• clarify.next_questions - ONLY if you truly cannot proceed (use 80% rule first)

DO NOT respond with text describing what you will do.
DO NOT ask generic questions.
CALL A TOOL and produce real output.

The user asked to plan - so call plan.elements to generate elements NOW.
After elements, call plan.tasks to generate tasks.
Then call changeset.compile to create the ChangeSet.`
      });

      // Re-run LLM with tool_choice required to force tool usage
      const recoveryResponse = await completionWithTracing(
        ctx,
        {
          model: orchestrator.model,
          reasoning_effort: orchestrator.reasoningEffort,
          temperature: orchestrator.temperature ? Math.min(orchestrator.temperature + 0.1, 0.5) : undefined,
          max_tokens: orchestrator.maxTokens,
          max_completion_tokens: orchestrator.maxCompletionTokens,
          messages,
          tools,
          tool_choice: 'required',  // Force tool usage in recovery
          traceMeta: { source: 'sdk', runId: args.runId, recovery: true },
        },
        { projectId: args.projectId, conversationId: args.conversationId, runId: args.runId }
      ) as any;

      const recoveryMessage = recoveryResponse.choices?.[0]?.message;

      // Handle tool calls from recovery
      if (recoveryMessage?.tool_calls?.length) {
        let recoveryCalledCompile = false;
        for (const toolCall of recoveryMessage.tool_calls) {
          const originalName = toolNameMap.get(toolCall.function.name) ?? toolCall.function.name;
          if (originalName === 'changeset.compile') recoveryCalledCompile = true;
          let toolArgs: any = {};
          try {
            toolArgs = JSON.parse(toolCall.function.arguments || '{}');
          } catch { }

          if (isChatEditRun && !allowedTools.includes(originalName)) {
            await ctx.runMutation(internal.sdk.telemetry.logEvent, {
              runId: args.runId,
              type: 'chat_heavy_tool_blocked',
              payload: { toolName: originalName, reason: 'not_allowed_in_recovery', intent: chatIntent },
            });
            continue;
          }

          const handler = toolHandlers[originalName];
          if (handler) {
            const result = await handler(toolArgs.input ?? toolArgs);
            const intentsFromResult = collectIntentsFromResult(result);
            if (intentsFromResult.length > 0) {
              pendingIntents.push(...intentsFromResult);
            }
            messages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: typeof result === 'string' ? result : JSON.stringify(result),
            });

            // If tool returned structured output, use it
            if (result?.blocks || result?.intent || result?.intents) {
              parsed = result;
              summaryHe = result.summaryHe ?? result.contentHe ?? 'תוצאה מהסוכן';
              blocks = result.blocks ?? [];
            }
          }
        }
        if (!recoveryCalledCompile && pendingIntents.length > 0 && !autoCompiled) {
          autoCompiled = true;
          let compileResult: any;
          try {
            compileResult = await toolHandlers['changeset.compile']({
              intents: pendingIntents,
            });
          } catch (error: any) {
            compileResult = { error: error?.message ?? String(error) };
          }

          if (compileResult?.blocks || compileResult?.intent || compileResult?.intents) {
            parsed = compileResult;
            summaryHe = compileResult.summaryHe ?? compileResult.contentHe ?? 'תוצאה מהסוכן';
            blocks = compileResult.blocks ?? blocks;
          }
        }
      } else if (recoveryMessage?.content) {
        try {
          const recoveryParsed = JSON.parse(recoveryMessage.content);
          assertAsciiKeys(recoveryParsed);
          parsed = recoveryParsed;
          summaryHe = parsed.summaryHe ?? parsed.contentHe ?? 'תשובה מהסוכן';
          blocks = parsed.blocks ?? [];
        } catch {
          // If recovery also fails to parse, keep original with ChatBlock wrapper
          blocks = [{ type: 'ChatBlock', contentHe: recoveryMessage.content }];
          summaryHe = recoveryMessage.content.slice(0, 100);
        }
      }
    }

    if (isChatEditRun && typeof summaryHe === 'string' && summaryHe.length > 360) {
      summaryHe = `${summaryHe.slice(0, 357)}...`;
    }

    const includeSuggestions = shouldAttachSuggestions({
      intent: isChatEditRun ? (chatIntent ?? 'project_read_qna') : 'planning_flow',
      userText: lastUserMsg,
      summaryHe,
    });

    blocks = ensureMinimumBlocks({
      blocks,
      summaryHe,
      rawText: finalContent ?? summaryHe,
      isPlanningRequest: shouldForceTools,
      includeSuggestions,
    });

    await ctx.runMutation(internal.sdk.telemetry.appendMessage, {
      conversationId: args.conversationId,
      role: 'assistant',
      text: summaryHe,
      blocks,
      runId: args.runId,
    });

    await ctx.runMutation(internal.sdk.telemetry.logEvent, {
      runId: args.runId,
      type: 'block_emit',
      payload: { blocks },
    });

    const rawStage = parsed?.meta?.nextStageKey ?? parsed?.meta?.stageKey ?? parsed?.meta?.stageKeyHint;
    const requestedStage = normalizeStageKey(rawStage);
    if (requestedStage) {
      const currentStage = normalizeStageKey(run.stageKey) ?? 'intake';
      const { next, reason } = enforceStageTransition(currentStage, requestedStage);
      if (reason === 'skip') {
        await ctx.runMutation(internal.sdk.telemetry.logEvent, {
          runId: args.runId,
          type: 'stage_guard',
          payload: {
            currentStage,
            requestedStage,
            appliedStage: next,
            reason,
          },
        });
      }
      await ctx.runMutation(internal.sdk.telemetry.updateRunState, {
        runId: args.runId,
        stageKey: next,
      });
    }

    return {
      status: 'success',
      output: parsed,
    };
  },
});
