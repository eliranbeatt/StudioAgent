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
    const sdkApi = (api as any)['sdk/api'] ?? (api as any).sdk?.api;
    const sdkKnowledge = (api as any)['sdk/knowledge'] ?? (api as any).sdk?.knowledge;
    const sdkChangeset = (api as any)['sdk/changeset'] ?? (api as any).sdk?.changeset;
    if (!sdkApi || !sdkKnowledge || !sdkChangeset) {
      throw new Error('SDK API modules not available. Run Convex codegen and restart the server.');
    }

    const run = await ctx.runQuery(internal.sdk.queries.getRun, {
      runId: args.runId,
    });
    if (!run) throw new Error('Run not found');

    if (run.status === 'paused' || run.status === 'cancelled' || run.status === 'completed') {
      return { status: run.status };
    }

    if (args.userMessage) {
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

    const pendingIntents: any[] = [];
    let autoCompiled = false;

    const orchestrator = REGISTRY.orchestrator;
    if (!orchestrator) throw new Error('Agent orchestrator not found in registry');

    await ctx.runMutation(internal.sdk.telemetry.updateRunState, {
      runId: args.runId,
      status: 'running',
      currentAgentName: 'orchestrator',
    });

    const history = await ctx.runQuery(sdkApi.listMessages, {
      conversationId: args.conversationId,
      limit: 50,
    });

    const bootstrapContext = await ctx.runQuery(sdkApi.contextGet, {
      projectId: args.projectId,
      packs: ['project', 'elements', 'tasks', 'accounting', 'quote', 'knowledge', 'qa'],
    });

    const messages: any[] = [
      { role: 'system', content: orchestrator.systemPrompt },
      {
        role: 'system',
        content: `PROJECT CONTEXT (bootstrap, may be partial):\n${JSON.stringify(bootstrapContext, null, 2)}`,
      },
      ...history.map((m: any) => ({
        role: m.role,
        content: m.text ?? (m.blocks ? JSON.stringify(m.blocks) : ''),
      })),
    ];

    const toolHandlers: Record<string, ToolHandler> = {
      'context.get': async (input: any) =>
        ctx.runQuery(sdkApi.contextGet, {
          projectId: args.projectId,
          packs: input?.packs ?? ['project', 'knowledge'],
          filters: input?.filters,
        }),
      'knowledge.summarize_or_update': async (input: any) =>
        ctx.runAction(sdkKnowledge.summarizeOrUpdate, {
          projectId: args.projectId,
          currentDoc: input?.currentDoc,
          newFacts: input?.newFacts ?? [],
          userText: input?.userText,
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
        });

        if (result?.changeSetId && !run.shadowMode) {
          const blocks: any[] = [];
          let auditResult: any = null;
          try {
            auditResult = await runToolInternal({
              ctx,
              projectId: args.projectId,
              toolId: 'audit.project',
              input: { changeSetId: result.changeSetId },
              runId: args.runId,
              conversationId: args.conversationId,
            });
          } catch (error: any) {
            auditResult = { error: error?.message ?? String(error) };
          }

          if (auditResult && !auditResult.error) {
            await ctx.runMutation(internal.sdk.telemetry.logEvent, {
              runId: args.runId,
              type: 'audit_snapshot',
              payload: {
                changeSetId: result.changeSetId,
                summaryHe: auditResult.summaryHe,
                findings: auditResult.findings ?? [],
              },
            });
            blocks.push(
              buildReviewBlock({
                titleHe: 'ביקורת פרויקט',
                summaryHe: auditResult.summaryHe,
                risks: auditResult.findings,
              })
            );
          }

          const review = await ctx.runAction(sdkChangeset.review, {
            projectId: args.projectId,
            changeSetId: result.changeSetId,
          });

          await ctx.runMutation(internal.sdk.telemetry.logEvent, {
            runId: args.runId,
            type: 'changeset_review',
            payload: {
              changeSetId: result.changeSetId,
              issues: review?.issues ?? [],
              summaryHe: review?.summaryHe,
            },
          });

          const reviewIssues = Array.isArray(review?.issues) ? review.issues : [];
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

        const auditEvent = await ctx.runQuery(internal.sdk.queries.getLatestAuditForRun, {
          runId: args.runId,
        });
        if (!auditEvent) {
          throw new Error('Audit required before apply');
        }

        return await ctx.runAction(sdkChangeset.apply, {
          runId: args.runId,
          approvalToken: input?.approvalToken ?? '',
        });
      },
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
    const tools = buildToolDefinitions(orchestrator.allowedTools ?? [], toolNameMap);

    // Detect if user is asking to plan/create/build - force tool usage
    const isPlanningRequest = (text: string): boolean => {
      const patterns = [
        'תכנן', 'plan', 'התחל', 'start', 'צור', 'create', 'בנה', 'build',
        'עשה', 'do', 'הכן', 'prepare', 'תעשה', 'יאללה', 'קדימה', 'go',
        'אלמנטים', 'elements', 'משימות', 'tasks', 'תקציב', 'budget',
        'הצעת מחיר', 'quote', 'תמחור', 'pricing'
      ];
      const lower = (text || '').toLowerCase();
      return patterns.some(p => lower.includes(p.toLowerCase()));
    };

    // Check last user message to determine if we should force tool usage
    const lastUserMsg = args.userMessage ||
      history.filter((m: any) => m.role === 'user').slice(-1)[0]?.text || '';
    const shouldForceTools = isPlanningRequest(lastUserMsg);

    let finalContent: string | null = null;
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('Missing OPENAI_API_KEY');
    }
    for (let i = 0; i < MAX_TOOL_LOOPS; i++) {
      // Force tool usage on first iteration if planning request detected
      const toolChoice = (i === 0 && shouldForceTools) ? 'required' : 'auto';

      const response = await completionWithTracing(
        ctx,
        {
          model: orchestrator.model,
          reasoning_effort: orchestrator.reasoningEffort,
          temperature: orchestrator.temperature,
          max_tokens: orchestrator.maxTokens,
          max_completion_tokens: orchestrator.maxCompletionTokens,
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

          let result: any;
          try {
            const handler = toolHandlers[toolName];
            if (!handler) throw new Error(`Tool ${toolName} not available`);
            result = await handler(toolArgs);
          } catch (error: any) {
            result = { error: error?.message ?? String(error) };
          }

          if (result?.intent) {
            pendingIntents.push(result.intent);
          }

          messages.push({
            role: 'tool',
            tool_call_id: call.id,
            content: JSON.stringify(result),
          });
        }

        if (!toolCalledCompile && pendingIntents.length > 0 && !autoCompiled) {
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
        b?.type === 'QuestionsBlock' ||
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
    const needsRecovery = !hasActionableContent(parsed) ||
      isRefusal(finalContent) ||
      isTalkingAboutDoing(finalContent);

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
        for (const toolCall of recoveryMessage.tool_calls) {
          const originalName = toolNameMap.get(toolCall.function.name) ?? toolCall.function.name;
          let toolArgs: any = {};
          try {
            toolArgs = JSON.parse(toolCall.function.arguments || '{}');
          } catch { }

          const handler = toolHandlers[originalName];
          if (handler) {
            const result = await handler(toolArgs.input ?? toolArgs);
            messages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: typeof result === 'string' ? result : JSON.stringify(result),
            });

            // If tool returned structured output, use it
            if (result?.blocks || result?.intents) {
              parsed = result;
              summaryHe = result.summaryHe ?? result.contentHe ?? 'תוצאה מהסוכן';
              blocks = result.blocks ?? [];
            }
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
