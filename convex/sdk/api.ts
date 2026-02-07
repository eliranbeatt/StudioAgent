// convex/sdk/api.ts
// This file contains mutations and queries only (no "use node")
// For Node.js actions, see nodeActions.ts

import { action, internalMutation, mutation, query } from '../_generated/server';
import { v } from 'convex/values';
import { api, internal } from '../_generated/api';
import { completionWithTracing } from '../lib/llm';

// Re-export context query (doesn't need Node.js)
export { get as contextGet } from './context';

export const createConversation = mutation({
  args: {
    projectId: v.id('projects'),
    title: v.string(),
  },
  handler: async (ctx, args) => {
    // Phase 1: Create a basic conversation
    const conversationId = await ctx.db.insert('agentConversations', {
      projectId: args.projectId,
      title: args.title,
      mode: 'chat',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    return conversationId;
  },
});

export const listConversations = query({
  args: {
    projectId: v.id('projects'),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('agentConversations')
      .withIndex('by_project', (q) => q.eq('projectId', args.projectId))
      .order('desc')
      .collect();
  },
});

export const renameConversation = mutation({
  args: {
    conversationId: v.id('agentConversations'),
    title: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.conversationId, {
      title: args.title,
      updatedAt: Date.now(),
    });
  },
});

export const deleteConversation = mutation({
  args: {
    conversationId: v.id('agentConversations'),
  },
  handler: async (ctx, args) => {
    const sdkRuns = await ctx.db
      .query('sdkRuns')
      .withIndex('by_conversation', (q) => q.eq('conversationId', args.conversationId))
      .collect();

    for (const run of sdkRuns) {
      const runEvents = await ctx.db
        .query('sdkRunEvents')
        .withIndex('by_run', (q) => q.eq('runId', run._id))
        .collect();
      for (const event of runEvents) {
        await ctx.db.delete(event._id);
      }
      await ctx.db.delete(run._id);
    }

    const messages = await ctx.db
      .query('agentMessages')
      .withIndex('by_conversation', (q) => q.eq('conversationId', args.conversationId))
      .collect();
    for (const message of messages) {
      await ctx.db.delete(message._id);
    }

    const skillRuns = await ctx.db
      .query('skillRuns')
      .withIndex('by_conversation', (q) => q.eq('conversationId', args.conversationId))
      .collect();
    for (const run of skillRuns) {
      await ctx.db.delete(run._id);
    }

    await ctx.db.delete(args.conversationId);
  },
});

export const listMessages = query({
  args: {
    conversationId: v.id('agentConversations'),
    runId: v.optional(v.id('sdkRuns')),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 100;
    const messages = await ctx.db
      .query('agentMessages')
      .withIndex('by_conversation', (q) => q.eq('conversationId', args.conversationId))
      .order('desc')
      .take(limit);
    const filtered = args.runId
      ? messages.filter((m) => m.runId === args.runId)
      : messages;
    return filtered.reverse();
  },
});

export const appendUserMessage = mutation({
  args: {
    conversationId: v.id('agentConversations'),
    text: v.string(),
    runId: v.optional(v.id('sdkRuns')),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert('agentMessages', {
      conversationId: args.conversationId,
      role: 'user',
      text: args.text,
      runId: args.runId,
      createdAt: Date.now(),
    });
  },
});

export const listRuns = query({
  args: {
    conversationId: v.id('agentConversations'),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('sdkRuns')
      .withIndex('by_conversation', (q) => q.eq('conversationId', args.conversationId))
      .order('desc')
      .collect();
  },
});

export const cleanupFinalizePlaceholders = mutation({
  args: {
    projectId: v.id('projects'),
  },
  handler: async (ctx, args) => {
    const elements = await ctx.db
      .query('elements')
      .withIndex('by_project', (q) => q.eq('projectId', args.projectId))
      .collect()
    const tasks = await ctx.db
      .query('tasks')
      .withIndex('by_project', (q) => q.eq('projectId', args.projectId))
      .collect()
    const materialLines = await ctx.db
      .query('materialLines')
      .withIndex('by_project', (q) => q.eq('projectId', args.projectId))
      .collect()
    const workLines = await ctx.db
      .query('workLines')
      .withIndex('by_project', (q) => q.eq('projectId', args.projectId))
      .collect()

    const badElements = elements.filter((item: any) => String(item?.title ?? '').trim() === 'Untitled Element')
    const badTasks = tasks.filter((item: any) => String(item?.title ?? '').trim() === 'Untitled Task')
    const badElementIds = new Set(badElements.map((item: any) => String(item._id)))
    const badTaskIds = new Set(badTasks.map((item: any) => String(item._id)))

    let deletedMaterialLines = 0
    for (const line of materialLines) {
      const taskId = String((line as any)?.taskId ?? '')
      const elementId = String((line as any)?.elementId ?? '')
      if (badTaskIds.has(taskId) || badElementIds.has(elementId)) {
        await ctx.db.delete(line._id)
        deletedMaterialLines += 1
      }
    }

    let deletedWorkLines = 0
    for (const line of workLines) {
      const taskId = String((line as any)?.taskId ?? '')
      const elementId = String((line as any)?.elementId ?? '')
      if (badTaskIds.has(taskId) || badElementIds.has(elementId)) {
        await ctx.db.delete(line._id)
        deletedWorkLines += 1
      }
    }

    for (const task of badTasks) {
      await ctx.db.delete(task._id)
    }
    for (const element of badElements) {
      await ctx.db.delete(element._id)
    }

    return {
      deletedElements: badElements.length,
      deletedTasks: badTasks.length,
      deletedMaterialLines,
      deletedWorkLines,
    }
  },
})

export const listRunEvents = query({
  args: {
    runId: v.id('sdkRuns'),
    limit: v.optional(v.number()),
    type: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 40;
    if (args.type) {
      return await ctx.db
        .query('sdkRunEvents')
        .withIndex('by_run_type', (q) => q.eq('runId', args.runId).eq('type', args.type!))
        .order('desc')
        .take(limit);
    }
    return await ctx.db
      .query('sdkRunEvents')
      .withIndex('by_run', (q) => q.eq('runId', args.runId))
      .order('desc')
      .take(limit);
  },
});

export const generateConversationTitle = action({
  args: {
    conversationId: v.id('agentConversations'),
    projectId: v.id('projects'),
  },
  handler: async (ctx, args) => {
    const messages = await ctx.runQuery(api.sdk.api.listMessages, {
      conversationId: args.conversationId,
      limit: 40,
    });

    if (!messages.length) return { ok: false, reason: 'empty' as const };

    const history = messages
      .slice(-12)
      .map((message: any) => {
        const text = extractMessageText(message);
        if (!text) return null;
        return `${message.role}: ${text}`;
      })
      .filter(Boolean)
      .join('\n');

    if (!history.trim()) return { ok: false, reason: 'empty' as const };

    const prompt = [
      'Create a conversation title from this chat.',
      'Output only the title text (no quotes or punctuation wrappers).',
      'Use 3 to 5 words total.',
      'Match the conversation language.',
      '',
      'Conversation:',
      history,
    ].join('\n');

    const response = await completionWithTracing(
      ctx,
      {
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
      },
      {
        projectId: args.projectId,
        conversationId: args.conversationId,
      }
    );

    const rawTitle = (response as any).choices?.[0]?.message?.content ?? '';
    const cleanedTitle = String(rawTitle)
      .trim()
      .replace(/^["']|["']$/g, '')
      .replace(/\s+/g, ' ');

    const limitedTitle = cleanedTitle.split(' ').slice(0, 5).join(' ').trim();
    if (!limitedTitle) return { ok: false, reason: 'empty' as const };

    await ctx.runMutation(api.sdk.api.renameConversation, {
      conversationId: args.conversationId,
      title: limitedTitle,
    });

    return { ok: true, title: limitedTitle };
  },
});

export const startRun = mutation({
  args: {
    projectId: v.id('projects'),
    conversationId: v.id('agentConversations'),
    input: v.optional(v.string()),
    shadowMode: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const runId = await ctx.runMutation(internal.sdk.telemetry.createRun, {
      projectId: args.projectId,
      conversationId: args.conversationId,
      engine: 'sdk',
      currentAgent: 'orchestrator',
      shadowMode: args.shadowMode,
    });

    if (args.input?.trim()) {
      await ctx.runMutation(internal.sdk.telemetry.appendMessage, {
        conversationId: args.conversationId,
        role: 'user',
        text: args.input.trim(),
        runId,
      });
    }

    return { runId, status: 'running' };
  },
});

export const startVnextRun = mutation({
  args: {
    projectId: v.id('projects'),
    conversationId: v.id('agentConversations'),
    input: v.optional(v.string()),
    shadowMode: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const runId = await ctx.runMutation(internal.sdk.telemetry.createRun, {
      projectId: args.projectId,
      conversationId: args.conversationId,
      engine: 'sdk',
      currentAgent: 'vnext_pipeline',
      shadowMode: args.shadowMode,
    })

    await ctx.runMutation(internal.sdk.telemetry.updateRunState, {
      runId,
      stageKey: 'brief',
      status: 'running',
      currentAgentName: 'vnext_pipeline',
    })

    if (args.input?.trim()) {
      await ctx.runMutation(internal.sdk.telemetry.appendMessage, {
        conversationId: args.conversationId,
        role: 'user',
        text: args.input.trim(),
        runId,
      })
    }

    return { runId, status: 'running', stageKey: 'brief' }
  },
})

export const answerVnext = mutation({
  args: {
    runId: v.id('sdkRuns'),
    answersById: v.record(v.string(), v.string()),
    freeText: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId)
    if (!run) throw new Error('Run not found')

    const stageKey = run.stageKey ?? 'brief'

    await ctx.runMutation(internal['sdk/vnext/artifacts'].appendStageDecision, {
      runId: args.runId,
      conversationId: run.conversationId,
      stageKey,
      decisionType: 'answers',
      payload: {
        answersById: args.answersById,
        freeText: args.freeText,
      },
    })

    const answerText = JSON.stringify({
      stageKey,
      answersById: args.answersById,
      freeText: args.freeText,
    })

    await ctx.runMutation(internal.sdk.telemetry.appendMessage, {
      conversationId: run.conversationId,
      role: 'user',
      text: answerText,
      runId: args.runId,
    })

    await ctx.runMutation(internal.sdk.telemetry.updateRunState, {
      runId: args.runId,
      status: 'running',
      currentAgentName: 'vnext_pipeline',
      lastError: undefined,
    })

    return { ok: true }
  },
})

export const continueVnext = action({
  args: {
    projectId: v.id('projects'),
    conversationId: v.id('agentConversations'),
    runId: v.id('sdkRuns'),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const run = await ctx.runQuery(internal.sdk.queries.getRun, { runId: args.runId })
    if (!run) throw new Error('Run not found')
    if (run.status === 'completed' || run.status === 'cancelled' || run.status === 'failed') {
      throw new Error('Run is terminal. Start a new run to continue.')
    }

    await ctx.runMutation(internal['sdk/vnext/artifacts'].appendStageDecision, {
      runId: args.runId,
      conversationId: args.conversationId,
      stageKey: run.stageKey ?? 'brief',
      decisionType: 'continue',
      payload: {
        note: args.note ?? null,
      },
    })

    await ctx.runMutation(internal.sdk.telemetry.updateRunState, {
      runId: args.runId,
      status: 'running',
      currentAgentName: 'vnext_pipeline',
      lastError: undefined,
    })

    return await ctx.runAction(api.sdk.dispatch.runNext, {
      projectId: args.projectId,
      conversationId: args.conversationId,
      runId: args.runId,
      userMessage: '__continue__',
    })
  },
})

export const bootstrapFastPlan = action({
  args: {
    projectId: v.id('projects'),
    conversationId: v.id('agentConversations'),
    runId: v.id('sdkRuns'),
    userMessage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const result = await ctx.runAction(api.sdk.plannerNode.draftPlanAndQuestions, {
      projectId: args.projectId,
      conversationId: args.conversationId,
      runId: args.runId,
      userMessage: args.userMessage,
    })

    const blocks: any[] = [
      {
        type: 'ChatBlock',
        markdownHe: String((result as any)?.planMd ?? ''),
      },
    ]

    await ctx.runMutation(internal.sdk.telemetry.appendMessage, {
      conversationId: args.conversationId,
      role: 'assistant',
      text: String((result as any)?.summaryHe ?? 'Draft plan created'),
      blocks,
      runId: args.runId,
    })

    await ctx.runMutation(internal.sdk.telemetry.updateRunState, {
      runId: args.runId,
      status: 'running',
      currentAgentName: 'draft.plan_and_questions',
      lastError: undefined,
    })

    return result
  },
})

function firstNonEmpty(values: Array<unknown>): string {
  for (const value of values) {
    const text = String(value ?? '').trim()
    if (text) return text
  }
  return ''
}

function toFiniteNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function normalizeElementTypeForChangeSet(value: unknown): string {
  const raw = String(value ?? '').trim().toLowerCase()
  if (!raw) return 'build'
  if (raw === 'purchase' || raw === 'procure' || raw === 'procurement') return 'buy'
  if (['build', 'rent', 'buy', 'print', 'transport', 'install', 'subcontract', 'mixed'].includes(raw)) {
    return raw
  }
  return 'build'
}

function buildFinalizeDirectOps(outputs: Record<string, any>, projectId: string): Array<{ kind: string; payload: any }> {
  const ops: Array<{ kind: string; payload: any }> = []
  const elements = Array.isArray(outputs['plan.elements']?.elements) ? outputs['plan.elements'].elements : []
  const tasks = Array.isArray(outputs['plan.tasks']?.tasks) ? outputs['plan.tasks'].tasks : []
  const budget = outputs['cost.build_budget'] ?? {}
  const materialLines = Array.isArray(budget?.materialLines) ? budget.materialLines : []
  const workLines = Array.isArray(budget?.workLines) ? budget.workLines : []

  for (let i = 0; i < elements.length; i += 1) {
    const item = elements[i] ?? {}
    const tempId = firstNonEmpty([item.tempId, `final_elem_${i + 1}`])
    const title = firstNonEmpty([item.title, item.titleHe, item.name, item.nameHe, `Element ${i + 1}`])
    const type = normalizeElementTypeForChangeSet(firstNonEmpty([item.type, item.buildStrategy]))
    ops.push({
      kind: 'element.create',
      payload: {
        tempId,
        element: {
          projectId,
          title,
          type,
        },
      },
    })
  }

  for (let i = 0; i < tasks.length; i += 1) {
    const item = tasks[i] ?? {}
    const tempId = firstNonEmpty([item.tempId, `final_task_${i + 1}`])
    const title = firstNonEmpty([item.title, item.titleHe, item.name, item.descriptionHe, `Task ${i + 1}`])
    const description = firstNonEmpty([item.description, item.descriptionHe])
    const estimatedHours = toFiniteNumber(item.estimatedHours ?? item.estimateHours)
    const stage = firstNonEmpty([item.stage, item.stageKey])
    const workType = firstNonEmpty([item.workType?.key, item.workType])
    const workTypeLabelHe = firstNonEmpty([item.workTypeLabelHe, item.workType?.labelHe])
    const elementTempOrId = firstNonEmpty([item.elementTempOrId, item.elementId])
    const dependencyRaw = item?.dependencies?.afterTaskTempIds
    const dependencies = Array.isArray(dependencyRaw)
      ? dependencyRaw.map((value: any) => String(value)).filter(Boolean)
      : typeof dependencyRaw === 'string'
        ? dependencyRaw.split(',').map((value: string) => value.trim()).filter(Boolean)
        : []

    ops.push({
      kind: 'task.create',
      payload: {
        tempId,
        elementTempOrId: elementTempOrId || undefined,
        fields: {
          title,
          description: description || undefined,
          estimatedHours,
          stage: stage || undefined,
          workType: workType || undefined,
          workTypeLabelHe: workTypeLabelHe || undefined,
          dependencies: dependencies.length > 0 ? dependencies : undefined,
          dedupKey: firstNonEmpty([item.dedupKey]) || undefined,
        },
      },
    })
  }

  for (let i = 0; i < materialLines.length; i += 1) {
    const item = materialLines[i] ?? {}
    const quantity = toFiniteNumber(item.quantity ?? item.qty) ?? 1
    const plannedUnitCost = toFiniteNumber(item.plannedUnitCost ?? item.unitPrice)
    const plannedTotalCost = toFiniteNumber(item.plannedTotalCost) ?? (
      plannedUnitCost !== undefined ? plannedUnitCost * quantity : undefined
    )
    const itemName = firstNonEmpty([item.itemName, item.itemHe, item.title, item.titleHe, `Material ${i + 1}`])
    const unitCode = firstNonEmpty([item.uomCode, item.unitCode])
    const elementTempOrId = firstNonEmpty([item.elementTempOrId, item.elementId])
    const taskTempOrId = firstNonEmpty([item.taskTempOrId, item.taskId])

    ops.push({
      kind: 'materialLine.create',
      payload: {
        tempId: firstNonEmpty([item.tempId]) || undefined,
        elementTempOrId: elementTempOrId || undefined,
        taskTempOrId: taskTempOrId || undefined,
        elementScope: firstNonEmpty([item.elementScope]) || undefined,
        fields: {
          itemName,
          quantity,
          uomCode: unitCode || undefined,
          plannedUnitCost,
          plannedTotalCost,
          sectionKey: firstNonEmpty([item.sectionKey]) || undefined,
          notes: firstNonEmpty([item.notes, item.notesHe]) || undefined,
          dedupKey: firstNonEmpty([item.dedupKey]) || undefined,
        },
      },
    })
  }

  for (let i = 0; i < workLines.length; i += 1) {
    const item = workLines[i] ?? {}
    const plannedQuantity = toFiniteNumber(item.plannedQuantity ?? item.hours ?? item.qty) ?? 1
    const plannedUnitCost = toFiniteNumber(item.plannedUnitCost ?? item.rate)
    const plannedTotalCost = toFiniteNumber(item.plannedTotalCost) ?? (
      plannedUnitCost !== undefined ? plannedUnitCost * plannedQuantity : undefined
    )
    const roleHe = firstNonEmpty([item.roleHe, item.workTypeLabelHe, item.workTypeKey, item.titleHe, `עבודה ${i + 1}`])
    const elementTempOrId = firstNonEmpty([item.elementTempOrId, item.elementId])
    const taskTempOrId = firstNonEmpty([item.taskTempOrId, item.taskId])
    const workType = firstNonEmpty([item.workType, item.workTypeKey])

    ops.push({
      kind: 'workLine.create',
      payload: {
        tempId: firstNonEmpty([item.tempId]) || undefined,
        elementTempOrId: elementTempOrId || undefined,
        taskTempOrId: taskTempOrId || undefined,
        elementScope: firstNonEmpty([item.elementScope]) || undefined,
        fields: {
          roleHe,
          plannedQuantity,
          plannedUnitCost,
          plannedTotalCost,
          isManagement: typeof item.isManagement === 'boolean' ? item.isManagement : undefined,
          workType: workType || undefined,
          sectionKey: firstNonEmpty([item.sectionKey]) || undefined,
          notes: firstNonEmpty([item.notes, item.notesHe]) || undefined,
          dedupKey: firstNonEmpty([item.dedupKey]) || undefined,
        },
      },
    })
  }

  return ops
}

function toFinalizeAssumptionText(qa: any, now: number): string {
  const questionType = String(qa?.questionType ?? 'text')
  if (questionType === 'single') {
    const firstOption = Array.isArray(qa?.options) ? qa.options[0] : null
    const choice = firstNonEmpty([firstOption?.labelHe, firstOption?.value])
    if (choice) return choice
  }
  if (questionType === 'toggle') return 'כן'
  if (questionType === 'number') return '1'
  if (questionType === 'date') return new Date(now).toISOString().slice(0, 10)
  return 'הנחת עבודה: הושלם אוטומטית לצורך Finalize'
}

export const ensureFinalizeAutofill = internalMutation({
  args: {
    projectId: v.id('projects'),
    runId: v.id('sdkRuns'),
  },
  handler: async (ctx, args) => {
    const now = Date.now()
    const run = await ctx.db.get(args.runId)
    if (!run) throw new Error('Run not found')

    const project = await ctx.db.get(args.projectId)
    const projectName = firstNonEmpty([
      project?.name,
      (project as any)?.details?.name,
      (project as any)?.details?.title,
    ]) || 'Project'

    const elements = await ctx.db
      .query('elements')
      .withIndex('by_project', (q) => q.eq('projectId', args.projectId))
      .collect()

    let createdElements = 0
    let createdTasks = 0
    let assumedAnswers = 0

    let primaryElementId = elements[0]?._id
    if (!primaryElementId) {
      primaryElementId = await ctx.db.insert('elements', {
        projectId: args.projectId,
        title: `${projectName} - בסיס`,
        description: 'Auto-generated baseline element for immediate finalize',
        type: 'build',
        status: 'drafting',
        tags: ['auto-finalize'],
        createdAt: now,
        updatedAt: now,
      })
      createdElements += 1
    }

    const existingTasks = await ctx.db
      .query('tasks')
      .withIndex('by_project', (q) => q.eq('projectId', args.projectId))
      .collect()
    if (existingTasks.length === 0) {
      const templates = [
        { title: `אפיון מהיר: ${projectName}`, stage: 'clarification', workType: 'management', workTypeLabelHe: 'ניהול', estimatedMinutes: 90 },
        { title: `רכש ראשוני: ${projectName}`, stage: 'procurement', workType: 'purchasing', workTypeLabelHe: 'רכש/קניות', estimatedMinutes: 120 },
        { title: `ביצוע והתקנה: ${projectName}`, stage: 'install', workType: 'rigging_install', workTypeLabelHe: 'התקנה', estimatedMinutes: 240 },
      ] as const

      for (const item of templates) {
        await ctx.db.insert('tasks', {
          projectId: args.projectId,
          elementId: primaryElementId,
          title: item.title,
          description: 'Auto-generated baseline task for immediate finalize',
          status: 'TODO',
          stage: item.stage,
          workType: item.workType,
          workTypeLabelHe: item.workTypeLabelHe,
          estimatedMinutes: item.estimatedMinutes,
          estimatedHours: Math.round((item.estimatedMinutes / 60) * 10) / 10,
          createdBy: 'agent',
          createdByRunId: String(args.runId),
          dedupKey: `auto-finalize:${item.stage}`,
          createdAt: now,
          updatedAt: now,
        })
        createdTasks += 1
      }
    }

    const openQaPairs = await ctx.db
      .query('qaPairs')
      .withIndex('by_project_status', (q) => q.eq('projectId', args.projectId).eq('status', 'open'))
      .collect()

    for (const qa of openQaPairs) {
      const assumption = toFinalizeAssumptionText(qa, now)
      await ctx.db.patch(qa._id, {
        status: 'assumed',
        answerText: assumption,
        answer_he: assumption,
        answer: assumption,
        version: typeof qa.version === 'number' ? qa.version + 1 : 1,
      })
      assumedAnswers += 1
    }

    if (run.status === 'needs_input' || run.status === 'blocked') {
      await ctx.db.patch(run._id, {
        status: 'running',
        currentAgentName: run.currentAgentName ?? 'finalize.auto',
        lastError: undefined,
        updatedAt: now,
      })
    }

    await ctx.db.insert('sdkRunEvents', {
      runId: args.runId,
      type: 'sdk_finalize_autofill',
      payload: {
        createdElements,
        createdTasks,
        assumedAnswers,
      },
      createdAt: now,
    })

    return {
      createdElements,
      createdTasks,
      assumedAnswers,
    }
  },
})

export const clearFinalizeAutofill = internalMutation({
  args: {
    projectId: v.id('projects'),
  },
  handler: async (ctx, args) => {
    const tasks = await ctx.db
      .query('tasks')
      .withIndex('by_project', (q) => q.eq('projectId', args.projectId))
      .collect()
    const autoTasks = tasks.filter((task: any) => String(task?.dedupKey ?? '').startsWith('auto-finalize:'))
    const autoTaskIds = new Set(autoTasks.map((task: any) => String(task._id)))

    const elements = await ctx.db
      .query('elements')
      .withIndex('by_project', (q) => q.eq('projectId', args.projectId))
      .collect()
    const autoElements = elements.filter((element: any) => Array.isArray(element?.tags) && element.tags.includes('auto-finalize'))
    const autoElementIds = new Set(autoElements.map((element: any) => String(element._id)))

    const materialLines = await ctx.db
      .query('materialLines')
      .withIndex('by_project', (q) => q.eq('projectId', args.projectId))
      .collect()
    const workLines = await ctx.db
      .query('workLines')
      .withIndex('by_project', (q) => q.eq('projectId', args.projectId))
      .collect()

    let deletedMaterialLines = 0
    for (const line of materialLines) {
      const taskId = String((line as any)?.taskId ?? '')
      const elementId = String((line as any)?.elementId ?? '')
      if (autoTaskIds.has(taskId) || autoElementIds.has(elementId)) {
        await ctx.db.delete(line._id)
        deletedMaterialLines += 1
      }
    }

    let deletedWorkLines = 0
    for (const line of workLines) {
      const taskId = String((line as any)?.taskId ?? '')
      const elementId = String((line as any)?.elementId ?? '')
      if (autoTaskIds.has(taskId) || autoElementIds.has(elementId)) {
        await ctx.db.delete(line._id)
        deletedWorkLines += 1
      }
    }

    for (const task of autoTasks) {
      await ctx.db.delete(task._id)
    }
    for (const element of autoElements) {
      await ctx.db.delete(element._id)
    }

    return {
      deletedElements: autoElements.length,
      deletedTasks: autoTasks.length,
      deletedMaterialLines,
      deletedWorkLines,
    }
  },
})

export const finalizeNow = action({
  args: {
    projectId: v.id('projects'),
    conversationId: v.id('agentConversations'),
    runId: v.id('sdkRuns'),
    includeAssumptions: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const run = await ctx.runQuery(internal.sdk.queries.getRun, { runId: args.runId })
    if (!run) throw new Error('Run not found')

    const collectIntentsFromResult = (result: any): any[] => {
      const out: any[] = []
      if (result?.intent) out.push(result.intent)
      if (Array.isArray(result?.intents)) out.push(...result.intents)
      if (Array.isArray(result?.fixIntents)) out.push(...result.fixIntents)
      if (Array.isArray(result?.repairIntents)) out.push(...result.repairIntents)
      return out.filter(Boolean)
    }

    const runTool = async (toolId: string, input: any) =>
      ctx.runAction(api.sdk.runner.runTool, {
        projectId: args.projectId,
        toolId,
        input,
        runId: args.runId,
        conversationId: args.conversationId,
      })

    let liveBefore = await ctx.runQuery(api.sdk.api.contextGet, {
      projectId: args.projectId,
      packs: ['project', 'elements', 'tasks', 'accounting', 'qa', 'knowledge'],
    })
    const liveElements = Array.isArray((liveBefore as any)?.elements) ? (liveBefore as any).elements : []
    const liveTasks = Array.isArray((liveBefore as any)?.tasks) ? (liveBefore as any).tasks : []
    const onlyAutofillElements =
      liveElements.length > 0 &&
      liveElements.every((item: any) => Array.isArray(item?.tags) && item.tags.includes('auto-finalize'))
    const onlyAutofillTasks =
      liveTasks.length > 0 &&
      liveTasks.every((item: any) => String(item?.dedupKey ?? '').startsWith('auto-finalize:'))
    if (onlyAutofillElements && onlyAutofillTasks) {
      const removed = await ctx.runMutation(internal.sdk.api.clearFinalizeAutofill, {
        projectId: args.projectId,
      })
      await ctx.runMutation(internal.sdk.telemetry.logEvent, {
        runId: args.runId,
        type: 'sdk_finalize_autofill_cleared',
        payload: removed,
      })
      liveBefore = await ctx.runQuery(api.sdk.api.contextGet, {
        projectId: args.projectId,
        packs: ['project', 'elements', 'tasks', 'accounting', 'qa', 'knowledge'],
      })
    }

    let fullBuildApplied = false
    let reviewIssuesCount = 0
    try {
      const messages = await ctx.runQuery(api.sdk.api.listMessages, {
        conversationId: args.conversationId,
        runId: args.runId,
        limit: 80,
      })
      const latestUserText =
        [...(messages ?? [])]
          .reverse()
          .find((m: any) => m?.role === 'user' && String(m?.text ?? '').trim())?.text ?? ''

      const buildInput = {
        userText: String(latestUserText ?? ''),
        context: liveBefore,
        finalizePolicy: {
          mode: 'force_full_finalize',
          assumeMissing: true,
          pricingOrder: ['catalog', 'web', 'estimate'],
          requireAll: ['elements', 'tasks', 'accounting'],
        },
      }

      const toolSequence = ['plan.elements', 'plan.tasks', 'cost.build_budget', 'pricing.resolve_lines']
      const intents: any[] = []
      const toolOutputs: Record<string, any> = {}
      for (const toolId of toolSequence) {
        const result = await runTool(toolId, buildInput)
        toolOutputs[toolId] = result
        intents.push(...collectIntentsFromResult(result))
      }

      const directOps = buildFinalizeDirectOps(toolOutputs, String(args.projectId))
      if (directOps.length > 0 || intents.length > 0) {
        let changeSetId: any = null
        if (directOps.length > 0) {
          changeSetId = await ctx.runMutation(api.changeSets.createChangeSet, {
            projectId: args.projectId,
            stage: 'BREAKDOWN',
            ops: directOps as any,
            createdBy: { type: 'agent', agentName: 'finalize.direct_ops' },
          })
        } else {
          const compileResult = await ctx.runAction(api.sdk.changeset.compile, {
            projectId: args.projectId,
            intents,
            context: liveBefore,
            runId: args.runId,
            conversationId: args.conversationId,
          })
          changeSetId = (compileResult as any)?.changeSetId
        }
        if (changeSetId) {
          const review = await ctx.runAction(api.sdk.changeset.review, {
            projectId: args.projectId,
            changeSetId,
            runId: args.runId,
            conversationId: args.conversationId,
          })
          const issues = Array.isArray((review as any)?.issues)
            ? (review as any).issues
            : [
                ...((Array.isArray((review as any)?.errors) ? (review as any).errors : [])),
                ...((Array.isArray((review as any)?.warnings) ? (review as any).warnings : [])),
              ]
          reviewIssuesCount = issues.length

          await ctx.runMutation(api.changeSets.applyChangeSet, { changeSetId })
          fullBuildApplied = true
          await ctx.runMutation(internal.sdk.telemetry.logEvent, {
            runId: args.runId,
            type: 'sdk_finalize_full_build_applied',
            payload: {
              changeSetId,
              intentsCount: intents.length,
              directOpsCount: directOps.length,
              reviewIssuesCount,
            },
          })
        }
      }
    } catch (error: any) {
      await ctx.runMutation(internal.sdk.telemetry.logEvent, {
        runId: args.runId,
        type: 'sdk_finalize_full_build_failed',
        payload: {
          message: String(error?.message ?? 'unknown'),
        },
      })
    }

    // Deterministic hydration fallback from vNext artifacts if full build did not apply.
    if (!fullBuildApplied && (liveElements.length === 0 || liveTasks.length === 0 || (onlyAutofillElements && onlyAutofillTasks))) {
      try {
        const compiled = await ctx.runAction(api.sdk.changeset.compile, {
          projectId: args.projectId,
          intents: [],
          deterministic: true,
          runId: args.runId,
          conversationId: args.conversationId,
        })
        const changeSetId = (compiled as any)?.changeSetId
        if (changeSetId) {
          await ctx.runMutation(api.changeSets.applyChangeSet, {
            changeSetId,
          })
          await ctx.runMutation(internal.sdk.telemetry.logEvent, {
            runId: args.runId,
            type: 'sdk_finalize_hydrate_from_artifacts',
            payload: {
              changeSetId,
              mode: 'deterministic',
            },
          })
        }
      } catch (error: any) {
        await ctx.runMutation(internal.sdk.telemetry.logEvent, {
          runId: args.runId,
          type: 'sdk_finalize_hydrate_failed',
          payload: {
            message: String(error?.message ?? 'unknown'),
          },
        })
      }
    }

    // Last-resort fallback: auto-create baseline entities and assume open questions.
    const liveAfterBuild = await ctx.runQuery(api.sdk.api.contextGet, {
      projectId: args.projectId,
      packs: ['elements', 'tasks', 'accounting'],
    })
    const hasEntitiesAfterBuild =
      Number((liveAfterBuild as any)?.elements?.length ?? 0) > 0 ||
      Number((liveAfterBuild as any)?.tasks?.length ?? 0) > 0 ||
      Number((liveAfterBuild as any)?.materialLines?.length ?? 0) > 0 ||
      Number((liveAfterBuild as any)?.workLines?.length ?? 0) > 0
    const autofill = hasEntitiesAfterBuild
      ? { createdElements: 0, createdTasks: 0, assumedAnswers: 0, skipped: true }
      : await ctx.runMutation(internal.sdk.api.ensureFinalizeAutofill, {
          projectId: args.projectId,
          runId: args.runId,
        })

    const pkg = await ctx.runAction(api.sdk.finalize.buildStructuredPackage, {
      projectId: args.projectId,
      runId: args.runId,
      includeAssumptions: args.includeAssumptions,
    })

    const elements = Array.isArray((pkg as any)?.elements) ? (pkg as any).elements : []
    const tasks = Array.isArray((pkg as any)?.tasks) ? (pkg as any).tasks : []
    const materialLines = Array.isArray((pkg as any)?.accounting?.materialLines) ? (pkg as any).accounting.materialLines : []
    const workLines = Array.isArray((pkg as any)?.accounting?.workLines) ? (pkg as any).accounting.workLines : []
    const unresolved = Number((pkg as any)?.unresolvedQuestionCount ?? 0)
    const isEmpty = elements.length === 0 && tasks.length === 0 && materialLines.length === 0 && workLines.length === 0

    const digest = {
      project: (pkg as any)?.project?.name ?? null,
      counts: {
        elements: elements.length,
        tasks: tasks.length,
        materialLines: materialLines.length,
        workLines: workLines.length,
        unresolved,
      },
      sampleElements: elements.slice(0, 5).map((e: any) => e?.title ?? String(e?.id ?? '')),
      sampleTasks: tasks.slice(0, 8).map((t: any) => t?.title ?? String(t?.id ?? '')),
    }

    const prompt = [
      'Create a concise Hebrew finalize summary for the user.',
      'Output plain markdown text only.',
      '',
      JSON.stringify(digest),
    ].join('\n')

    const response = await completionWithTracing(
      ctx,
      {
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
      },
      {
        projectId: args.projectId,
        conversationId: args.conversationId,
        runId: args.runId,
      }
    )

    const summaryMd = String((response as any)?.choices?.[0]?.message?.content ?? '').trim() ||
      `Finalize summary:\n- Elements: ${elements.length}\n- Tasks: ${tasks.length}\n- Unresolved: ${unresolved}`

    await ctx.runMutation(internal.sdk.telemetry.appendMessage, {
      conversationId: args.conversationId,
      role: 'assistant',
      text: isEmpty ? 'Finalize produced an empty package.' : 'Finalize completed.',
      blocks: [
        { type: 'ChatBlock', markdownHe: summaryMd },
        {
          type: 'ReviewBlock',
          titleHe: 'Finalize Snapshot',
          sections: [
            {
              sectionHe: 'Counts',
              highlightsHe: [
                `Elements: ${elements.length}`,
                `Tasks: ${tasks.length}`,
                `Material lines: ${materialLines.length}`,
                `Work lines: ${workLines.length}`,
                `Unresolved questions: ${unresolved}`,
                `Full build applied: ${fullBuildApplied ? 'yes' : 'no'} (review issues: ${reviewIssuesCount})`,
                `Autofill: +${Number((autofill as any)?.createdElements ?? 0)} elements, +${Number((autofill as any)?.createdTasks ?? 0)} tasks, ${Number((autofill as any)?.assumedAnswers ?? 0)} assumptions`,
              ],
              risksHe: isEmpty ? ['No generated entities found yet'] : [],
            },
          ],
          risksHe: isEmpty ? ['No generated entities found yet'] : [],
        },
      ],
      runId: args.runId,
    })

    await ctx.runMutation(internal.sdk.telemetry.logEvent, {
      runId: args.runId,
      type: 'sdk_finalize_now',
      payload: {
        isEmpty,
        elements: elements.length,
        tasks: tasks.length,
        materialLines: materialLines.length,
        workLines: workLines.length,
        unresolved,
        autofill,
      },
    })

    return {
      ok: true,
      isEmpty,
      summaryMd,
      counts: {
        elements: elements.length,
        tasks: tasks.length,
        materialLines: materialLines.length,
        workLines: workLines.length,
        unresolved,
      },
      autofill,
    }
  },
})

export const approveVnext = action({
  args: {
    runId: v.id('sdkRuns'),
    approvalToken: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.runAction(api.sdk.api.approveChangeSet, args)
  },
})

export const pauseRun = mutation({
  args: { runId: v.id('sdkRuns') },
  handler: async (ctx, args) => {
    await ctx.runMutation(internal.sdk.telemetry.updateRunState, {
      runId: args.runId,
      status: 'paused',
    });
  },
});

export const resumeRun = mutation({
  args: { runId: v.id('sdkRuns') },
  handler: async (ctx, args) => {
    await ctx.runMutation(internal.sdk.telemetry.updateRunState, {
      runId: args.runId,
      status: 'running',
      lastError: undefined, // Clear any blocked state
    });
  },
});

export const cancelRun = mutation({
  args: { runId: v.id('sdkRuns') },
  handler: async (ctx, args) => {
    await ctx.runMutation(internal.sdk.telemetry.updateRunState, {
      runId: args.runId,
      status: 'cancelled',
    });
  },
});

export const setRunMode = mutation({
  args: {
    runId: v.id('sdkRuns'),
    runMode: v.union(v.literal('PLANNING_FLOW'), v.literal('CHAT_EDIT')),
  },
  handler: async (ctx, args) => {
    await ctx.runMutation(internal.sdk.telemetry.updateRunState, {
      runId: args.runId,
      runMode: args.runMode,
    })
    return { ok: true }
  },
})

export const approveChangeSet = action({
  args: {
    runId: v.id('sdkRuns'),
    approvalToken: v.string(),
  },
  handler: async (ctx, args) => {
    const run = await ctx.runQuery(internal.sdk.queries.getRun, { runId: args.runId });
    if (!run) throw new Error('Run not found');
    if (run.shadowMode) throw new Error('Shadow runs cannot apply ChangeSets');
    if (!run.pendingChangeSetId) throw new Error('No pending ChangeSet');
    if (!run.approvalToken || run.approvalToken !== args.approvalToken) {
      throw new Error('Invalid approval token');
    }

    const reviewEvent = await ctx.runQuery(internal.sdk.queries.getLatestReviewForRun, {
      runId: args.runId,
      changeSetId: run.pendingChangeSetId,
    });
    if (!reviewEvent) {
      throw new Error('ChangeSet review required before apply');
    }
    const reviewIssues = normalizeReviewIssues(reviewEvent.payload);
    if (reviewIssues.length > 0) {
      throw new Error('ChangeSet review has unresolved issues');
    }

    const auditEvent = await ctx.runQuery(internal.sdk.queries.getLatestAuditForRun, {
      runId: args.runId,
    });
    if (!auditEvent) {
      throw new Error('Audit required before apply');
    }
    const findings = Array.isArray(auditEvent.payload?.findings) ? auditEvent.payload.findings : [];
    const highOrCriticalFindings = findings.filter((item: any) => {
      const severity = detectSeverity(item);
      return severity === 'critical' || severity === 'high';
    });
    if (highOrCriticalFindings.length > 0) {
      throw new Error('Audit has unresolved high-severity findings');
    }

    await ctx.runMutation(api.changeSets.applyChangeSet, {
      changeSetId: run.pendingChangeSetId,
    });
    await ctx.runMutation(internal.sdk.telemetry.clearPendingChangeSet, {
      runId: args.runId,
    });
    await ctx.runMutation(internal.sdk.telemetry.updateRunState, {
      runId: args.runId,
      status: 'completed',
      currentAgentName: run.currentAgentName ?? 'orchestrator',
      lastError: undefined,
    });

    return { ok: true, applied: run.pendingChangeSetId };
  },
});

function normalizeReviewIssues(payload: any): any[] {
  if (!payload || typeof payload !== 'object') return [];
  if (Array.isArray(payload.issues)) return payload.issues;
  const errors = Array.isArray(payload.errors) ? payload.errors : [];
  const warnings = Array.isArray(payload.warnings) ? payload.warnings : [];
  return [...errors, ...warnings];
}

function detectSeverity(item: any): 'critical' | 'high' | 'medium' | 'low' {
  const raw = String(
    item?.severity ??
    item?.level ??
    item?.risk ??
    item?.priority ??
    ''
  ).toLowerCase();
  if (raw.includes('critical')) return 'critical';
  if (raw.includes('high')) return 'high';
  if (raw.includes('low')) return 'low';
  if (raw.includes('medium')) return 'medium';

  const text = String(item?.messageHe ?? item?.message ?? item?.labelHe ?? '').toLowerCase();
  if (
    text.includes('אין כלל') ||
    text.includes('missing') ||
    text.includes('duplicate') ||
    text.includes('סתירה')
  ) {
    return 'high';
  }
  return 'medium';
}

function extractMessageText(message: any) {
  const text = typeof message?.text === 'string' ? message.text : '';
  const blocks = Array.isArray(message?.blocks) ? message.blocks : [];
  const blockText = blocks
    .map((block: any) =>
      String(
        block?.markdownHe ??
        block?.text ??
        block?.titleHe ??
        block?.title ??
        block?.contentHe ??
        ''
      )
    )
    .filter(Boolean)
    .join(' ');

  return `${text} ${blockText}`.trim();
}




