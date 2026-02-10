import { v } from 'convex/values';
import { action, internalMutation, mutation, query } from '../_generated/server';
import { api, internal } from '../_generated/api';
import { Id } from '../_generated/dataModel';

/**
 * PROJECT PLANNING FLOW
 * Structured, deterministic planning flow from context to complete project plan
 */

// Get or create planning session (for state persistence)
export const getPlanningSession = query({
  args: {
    projectId: v.id('projects'),
  },
  handler: async (ctx, args) => {
    // Look for most recent planning run for this project
    const existingRun = await ctx.db
      .query('sdkRuns')
      .withIndex('by_project', (q) => q.eq('projectId', args.projectId))
      .filter((q) => q.eq(q.field('runMode'), 'PLANNING_FLOW'))
      .order('desc')
      .first();

    if (!existingRun) {
      return null;
    }

    return {
      runId: existingRun._id,
      conversationId: existingRun.conversationId,
      currentStep: existingRun.planningCurrentStep ?? 'start',
      questionSetIndex: existingRun.planningQuestionSetIndex ?? 0,
      finalizationPhases: existingRun.planningFinalizationPhases ?? [],
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

    // Save brain dump to project context 
    await ctx.runMutation(internal.sdk.context.addKnowledge, {
      projectId: args.projectId,
      text: args.brainDump,
      source: 'brain_dump',
      priority: 10,
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
        includeQuestions: true,
        groupQuestions: true,
        // Pass full context to LLM
        projectContext,
        pastQA,
        files: files?.map((f: any) => ({ name: f.name, contentHe: f.contentText })),
        groupByPhase: ['blockers', 'project_level', 'per_element', 'suggestions'],
        questionsPerSet: { min: 4, max: 8 },
      },
      runId,
      conversationId,
    });

    // Step 2: Extract and save questions to qaPairs with groups
    const questionGroups = (planResult as any)?.questionGroups ?? [];
    for (const group of questionGroups) {
      const groupKey = group.key ?? 'general';
      const groupLabel = group.labelHe ?? 'כללי';
      const questions = Array.isArray(group.questions) ? group.questions : [];

      for (const q of questions) {
        await ctx.runMutation(internal.sdk.questions.createQuestion, {
          projectId: args.projectId,
          runId,
          questionHe: q.textHe ?? q.questionHe ?? '',
          groupKey,
          groupLabelHe: groupLabel,
          blockingLevel: q.blockingLevel ?? 'helpful',
          options: q.options,
          suggestedAnswers: q.suggestedAnswers,
        });
      }
    }

    // Step 3: Save plan to project context
    const planText = (planResult as any)?.planText ?? (planResult as any)?.summary ?? '';
    if (planText) {
      await ctx.runMutation(internal.sdk.context.addKnowledge, {
        projectId: args.projectId,
        text: planText,
        source: 'planning_session',
        priority: 9,
      });
    }

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

    // Get all questions for this project grouped
    const allQuestions = await ctx.db
      .query('qaPairs')
      .withIndex('by_project', (q) => q.eq('projectId', run.projectId))
      .filter((q) => q.eq(q.field('status'), 'open'))
      .collect();

    // Group by groupKey
    const grouped = new Map<string, any[]>();
    for (const q of allQuestions) {
      const key = (q as any).groupKey ?? 'general';
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push({
        id: q._id,
        questionHe: q.question_he ?? '',
        type: q.questionType ?? 'text',
        options: q.options,
        suggestedAnswers: (q as any).suggestedAnswers,
      });
    }

    const groups = Array.from(grouped.entries()).map(([key, questions]) => ({
      groupKey: key,
      groupLabelHe: (questions[0] as any)?.groupLabelHe ?? key,
      questions,
    }));

    const currentSet = groups[args.setIndex] ?? null;
    return {
      currentSet,
      hasMore: args.setIndex < groups.length - 1,
      totalSets: groups.length,
    };
  },
});

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
  },
  handler: async (ctx, args) => {
    for (const { questionId, answer } of args.answers) {
      await ctx.db.patch(questionId, {
        answerText: answer,
        status: 'resolved',
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

    // Dismiss old questions
    await ctx.runMutation(internal.sdk.questions.dismissAllForRun, {
      runId: args.runId,
    });

    // Generate fresh questions using full context + all answers
    const regenResult = await ctx.runAction(api.sdk.runner.runTool, {
      projectId: args.projectId,
      toolId: 'clarify.next_questions',
      input: {
        includeGroups: true,
        // Pass full context so LLM can generate relevant follow-up questions
        context: {
          project: projectContext?.project,
          elements: projectContext?.elements ?? [],
          tasks: projectContext?.tasks ?? [],
          materials: projectContext?.materialLines ?? [],
          existingQA: allQA ?? [],
          files: files?.map((f: any) => ({
            name: f.name,
            content: f.contentText?.substring(0, 2000)
          })) ?? [],
        },
        // Group questions into progressive sets
        groupByPhase: ['blockers', 'project_level', 'per_element', 'suggestions'],
        questionsPerSet: { min: 4, max: 8 },
      },
      runId: args.runId,
      conversationId: null as any,
    });

    // Save new questions
    const questionGroups = (regenResult as any)?.questionGroups ?? [];
    for (const group of questionGroups) {
      const groupKey = group.key ?? 'general';
      const groupLabel = group.labelHe ?? 'כללי';
      const questions = Array.isArray(group.questions) ? group.questions : [];

      for (const q of questions) {
        await ctx.runMutation(internal.sdk.questions.createQuestion, {
          projectId: args.projectId,
          runId: args.runId,
          questionHe: q.textHe ?? q.questionHe ?? '',
          groupKey,
          groupLabelHe: groupLabel,
          blockingLevel: q.blockingLevel ?? 'helpful',
          options: q.options,
          suggestedAnswers: q.suggestedAnswers,
        });
      }
    }

    return { ok: true, groupsCount: questionGroups.length };
  },
});

// Finalize project - full deterministic flow
export const finalizeProject = action({
  args: {
    projectId: v.id('projects'),
    runId: v.id('sdkRuns'),
    conversationId: v.id('agentConversations'),
  },
  handler: async (ctx, args) => {
    // Mark finalization started
    await ctx.runMutation(internal.sdk.telemetry.logEvent, {
      runId: args.runId,
      type: 'project_planning_finalize_started',
      payload: { stage: 'elements', percent: 0 },
    });

    // Run the full finalize flow from api.ts
    const finalizeResult = await ctx.runAction(api.sdk.api.finalizeNow, {
      projectId: args.projectId,
      conversationId: args.conversationId,
      runId: args.runId,
      includeAssumptions: true,
    });

    // Get the final package
    const pkg = finalizeResult as any;
    const counts = pkg?.counts ?? {};

    // Get element breakdown for report
    const elements = await ctx.runQuery(api.flow.ui.getElementsHealth, {
      projectId: args.projectId,
    });

    const report = {
      counts: {
        elements: counts.elements ?? 0,
        tasks: counts.tasks ?? 0,
        materialLines: counts.materialLines ?? 0,
        workLines: counts.workLines ?? 0,
        totalPrice: (elements as any)?.totals?.totalCost ?? 0,
      },
      summary: pkg?.summary ?? 'Project plan generated successfully',
      elements: (elements as any)?.elements ?? [],
      issues: pkg?.issues ?? [],
    };

    // Mark completed
    await ctx.runMutation(internal.sdk.telemetry.logEvent, {
      runId: args.runId,
      type: 'project_planning_finalize_completed',
      payload: { stage: 'completed', percent: 100 },
    });

    return report;
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
  },
  handler: async (ctx, args) => {
    // Mark phase as running
    await ctx.runMutation(api.sdk.projectPlanning.updatePhaseStatus, {
      runId: args.runId,
      phase: args.phase,
      status: 'running',
    });

    try {
      // For now, rerun the full finalize flow
      // TODO: In future, can optimize to run only specific phase
      const result = await ctx.runAction(api.sdk.api.finalizeNow, {
        projectId: args.projectId,
        conversationId: args.conversationId,
        runId: args.runId,
        includeAssumptions: true,
      });

      // Mark as success
      await ctx.runMutation(api.sdk.projectPlanning.updatePhaseStatus, {
        runId: args.runId,
        phase: args.phase,
        status: 'success',
      });

      return { success: true, result };
    } catch (error: any) {
      // Mark as failed
      await ctx.runMutation(api.sdk.projectPlanning.updatePhaseStatus, {
        runId: args.runId,
        phase: args.phase,
        status: 'failed',
        error: error?.message ?? 'Unknown error',
      });

      return { success: false, error: error?.message };
    }
  },
});

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
    });
  },
});
