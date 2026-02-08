// convex/sdk/api.ts
// This file contains mutations and queries only (no "use node")
// For Node.js actions, see nodeActions.ts

import { action, internalAction, internalMutation, mutation, query } from '../_generated/server';
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
    answerSources: v.optional(v.record(v.string(), v.string())),
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
        answerSources: args.answerSources,
      },
    })

    const answerText = JSON.stringify({
      stageKey,
      answersById: args.answersById,
      freeText: args.freeText,
    })

    // Telemetry: source-mode breakdown for vNext answers
    const sourceCounts: Record<string, number> = { typed: 0, option: 0, suggestion: 0, dont_know: 0 }
    if (args.answerSources) {
      for (const src of Object.values(args.answerSources)) {
        sourceCounts[src] = (sourceCounts[src] ?? 0) + 1
      }
    } else {
      // No source metadata — count all as typed
      sourceCounts.typed = Object.keys(args.answersById).length
    }
    await ctx.db.insert('sdkRunEvents', {
      runId: args.runId,
      type: 'sdk_vnext_answer_submit',
      payload: {
        stageKey,
        answerCount: Object.keys(args.answersById).length,
        hasFreeText: Boolean(args.freeText),
        sourceCounts,
      },
      createdAt: Date.now(),
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

function normalizeKeyPart(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s_/\\|:]+/g, '-')
    .replace(/[^a-z0-9\u0590-\u05ff-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

function buildFinalizeDirectOps(
  outputs: Record<string, any>,
  projectId: string,
  liveContext?: Record<string, any>
): Array<{ kind: string; payload: any }> {
  const ops: Array<{ kind: string; payload: any }> = []
  const elements = Array.isArray(outputs['plan.elements']?.elements) ? outputs['plan.elements'].elements : []
  const tasks = Array.isArray(outputs['plan.tasks']?.tasks) ? outputs['plan.tasks'].tasks : []
  const budget = outputs['cost.build_budget'] ?? {}
  const materialLines = Array.isArray(budget?.materialLines) ? budget.materialLines : []
  const workLines = Array.isArray(budget?.workLines) ? budget.workLines : []
  const liveElements = Array.isArray(liveContext?.elements) ? liveContext.elements : []
  const liveTasks = Array.isArray(liveContext?.tasks) ? liveContext.tasks : []

  const elementByTitleType = new Map<string, any>()
  const elementByTitle = new Map<string, any>()
  for (const element of liveElements) {
    const titleKey = normalizeKeyPart(element?.title)
    if (!titleKey) continue
    const type = normalizeElementTypeForChangeSet(element?.type)
    if (!elementByTitleType.has(`${titleKey}::${type}`)) elementByTitleType.set(`${titleKey}::${type}`, element)
    if (!elementByTitle.has(titleKey)) elementByTitle.set(titleKey, element)
  }

  const taskByDedup = new Map<string, any>()
  const taskByElementAndTitle = new Map<string, any>()
  for (const task of liveTasks) {
    const dedup = String(task?.dedupKey ?? '').trim()
    if (dedup && !taskByDedup.has(dedup)) taskByDedup.set(dedup, task)
    const titleKey = normalizeKeyPart(task?.title)
    const elementId = String(task?.elementId ?? '')
    if (!titleKey) continue
    const key = `${elementId}::${titleKey}`
    if (!taskByElementAndTitle.has(key)) taskByElementAndTitle.set(key, task)
  }

  const elementRefMap = new Map<string, string>()
  const elementKeyByRef = new Map<string, string>()
  const taskRefMap = new Map<string, string>()
  const taskKeyByRef = new Map<string, string>()
  const createdTaskDedup = new Set<string>()

  const rememberElementRef = (ref: unknown, resolved: string, elementKey: string) => {
    const value = String(ref ?? '').trim()
    if (!value) return
    elementRefMap.set(value, resolved)
    elementKeyByRef.set(value, elementKey)
  }

  const rememberTaskRef = (ref: unknown, resolved: string, taskKey: string) => {
    const value = String(ref ?? '').trim()
    if (!value) return
    taskRefMap.set(value, resolved)
    taskKeyByRef.set(value, taskKey)
  }

  for (let i = 0; i < elements.length; i += 1) {
    const item = elements[i] ?? {}
    const title = firstNonEmpty([item.title, item.titleHe, item.name, item.nameHe, `Element ${i + 1}`])
    const type = normalizeElementTypeForChangeSet(firstNonEmpty([item.type, item.buildStrategy]))
    const rawElementKey = firstNonEmpty([item.stableKey, item.elementKey, item.tempId, title, `element-${i + 1}`])
    const elementKey = normalizeKeyPart(rawElementKey) || `element-${i + 1}`
    const titleKey = normalizeKeyPart(title)
    const existing =
      elementByTitleType.get(`${titleKey}::${type}`) ??
      elementByTitle.get(titleKey) ??
      null
    const resolvedElementRef = existing ? String(existing.id) : `final_elem_${elementKey}`

    if (existing) {
      ops.push({
        kind: 'element.patch',
        payload: {
          elementId: existing.id,
          patch: {
            title,
            type,
            description: firstNonEmpty([item.description, item.descriptionHe]) || undefined,
          },
        },
      })
    } else {
      ops.push({
        kind: 'element.create',
        payload: {
          tempId: resolvedElementRef,
          element: {
            projectId,
            title,
            type,
            description: firstNonEmpty([item.description, item.descriptionHe]) || undefined,
          },
        },
      })
    }

    rememberElementRef(item.tempId, resolvedElementRef, elementKey)
    rememberElementRef(item.id, resolvedElementRef, elementKey)
    rememberElementRef(item.elementId, resolvedElementRef, elementKey)
    rememberElementRef(String(i), resolvedElementRef, elementKey)
  }

  for (let i = 0; i < tasks.length; i += 1) {
    const item = tasks[i] ?? {}
    const title = firstNonEmpty([item.title, item.titleHe, item.name, item.descriptionHe, `Task ${i + 1}`])
    const description = firstNonEmpty([item.description, item.descriptionHe])
    const estimatedHours = toFiniteNumber(item.estimatedHours ?? item.estimateHours)
    const stage = firstNonEmpty([item.stage, item.stageKey])
    const workType = firstNonEmpty([item.workType?.key, item.workType])
    const workTypeLabelHe = firstNonEmpty([item.workTypeLabelHe, item.workType?.labelHe])
    const inputElementRef = firstNonEmpty([item.elementTempOrId, item.elementId])
    const resolvedElementRef = elementRefMap.get(inputElementRef) ?? inputElementRef
    const resolvedElementKey = elementKeyByRef.get(inputElementRef) ?? normalizeKeyPart(inputElementRef) ?? 'project'
    const taskIdentitySeed = firstNonEmpty([
      item.dedupKey,
      `${stage || 'stage'}:${workType || 'work'}:${title}`,
      title,
      item.tempId,
      `task-${i + 1}`,
    ])
    const normalizedTaskIdentity = normalizeKeyPart(taskIdentitySeed) || `task-${i + 1}`
    const dedupKey = firstNonEmpty([item.dedupKey, `finalize:task:${resolvedElementKey}:${normalizedTaskIdentity}`])
    const tempId = firstNonEmpty([item.tempId, `final_task_${normalizedTaskIdentity}`])
    const dependencyRaw = item?.dependencies?.afterTaskTempIds
    const dependencies = Array.isArray(dependencyRaw)
      ? dependencyRaw.map((value: any) => String(value)).filter(Boolean)
      : typeof dependencyRaw === 'string'
        ? dependencyRaw.split(',').map((value: string) => value.trim()).filter(Boolean)
        : []
    const normalizedDependencies = dependencies.map((dep) => taskRefMap.get(dep) ?? dep)

    const existingByDedup = dedupKey ? taskByDedup.get(dedupKey) : null
    const existingByTitle = taskByElementAndTitle.get(`${String(resolvedElementRef ?? '')}::${normalizeKeyPart(title)}`)
    const existingTask = existingByDedup ?? existingByTitle ?? null

    if (existingTask) {
      ops.push({
        kind: 'task.patch',
        payload: {
          taskId: existingTask.id,
          fields: {
            title,
            description: description || undefined,
            estimatedHours,
            stage: stage || undefined,
            workType: workType || undefined,
            workTypeLabelHe: workTypeLabelHe || undefined,
            dependencies: normalizedDependencies.length > 0 ? normalizedDependencies : undefined,
            dedupKey: dedupKey || undefined,
          },
        },
      })
      rememberTaskRef(item.tempId, String(existingTask.id), dedupKey)
      rememberTaskRef(item.taskId, String(existingTask.id), dedupKey)
      rememberTaskRef(item.id, String(existingTask.id), dedupKey)
      continue
    }

    if (createdTaskDedup.has(dedupKey)) continue

    ops.push({
      kind: 'task.create',
      payload: {
        tempId,
        elementTempOrId: resolvedElementRef || undefined,
        fields: {
          title,
          description: description || undefined,
          estimatedHours,
          stage: stage || undefined,
          workType: workType || undefined,
          workTypeLabelHe: workTypeLabelHe || undefined,
          dependencies: normalizedDependencies.length > 0 ? normalizedDependencies : undefined,
          dedupKey: dedupKey || undefined,
        },
      },
    })
    createdTaskDedup.add(dedupKey)
    rememberTaskRef(item.tempId, tempId, dedupKey)
    rememberTaskRef(item.taskId, tempId, dedupKey)
    rememberTaskRef(item.id, tempId, dedupKey)
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
    const inputElementRef = firstNonEmpty([item.elementTempOrId, item.elementId])
    const inputTaskRef = firstNonEmpty([item.taskTempOrId, item.taskId])
    const elementTempOrId = elementRefMap.get(inputElementRef) ?? inputElementRef
    const taskTempOrId = taskRefMap.get(inputTaskRef) ?? inputTaskRef
    const elementKey =
      elementKeyByRef.get(inputElementRef) ??
      normalizeKeyPart(inputElementRef) ??
      (String(item?.elementScope ?? '').trim() === 'project' ? 'project' : 'unknown')
    const taskKey = taskKeyByRef.get(inputTaskRef) ?? normalizeKeyPart(inputTaskRef) ?? 'project'
    const materialSignature = normalizeKeyPart(firstNonEmpty([itemName, item.sectionKey, `material-${i + 1}`]))
    const stableMaterialDedup = firstNonEmpty([
      item.dedupKey,
      `finalize:material:${elementKey}:${taskKey}:${normalizeKeyPart(item.sectionKey)}:${materialSignature}`,
    ])

    ops.push({
      kind: 'materialLine.create',
      payload: {
        tempId: firstNonEmpty([item.tempId, `final_mat_${materialSignature}`]) || undefined,
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
          dedupKey: stableMaterialDedup || undefined,
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
    const roleHe = firstNonEmpty([item.roleHe, item.workTypeLabelHe, item.workTypeKey, item.titleHe, `Work ${i + 1}`])
    const inputElementRef = firstNonEmpty([item.elementTempOrId, item.elementId])
    const inputTaskRef = firstNonEmpty([item.taskTempOrId, item.taskId])
    const elementTempOrId = elementRefMap.get(inputElementRef) ?? inputElementRef
    const taskTempOrId = taskRefMap.get(inputTaskRef) ?? inputTaskRef
    const workType = firstNonEmpty([item.workType, item.workTypeKey])
    const elementKey =
      elementKeyByRef.get(inputElementRef) ??
      normalizeKeyPart(inputElementRef) ??
      (String(item?.elementScope ?? '').trim() === 'project' ? 'project' : 'unknown')
    const taskKey = taskKeyByRef.get(inputTaskRef) ?? normalizeKeyPart(inputTaskRef) ?? 'project'
    const workSignature = normalizeKeyPart(firstNonEmpty([roleHe, workType, item.sectionKey, `work-${i + 1}`]))
    const stableWorkDedup = firstNonEmpty([
      item.dedupKey,
      `finalize:work:${elementKey}:${taskKey}:${normalizeKeyPart(item.sectionKey)}:${workSignature}`,
    ])

    ops.push({
      kind: 'workLine.create',
      payload: {
        tempId: firstNonEmpty([item.tempId, `final_work_${workSignature}`]) || undefined,
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
          dedupKey: stableWorkDedup || undefined,
        },
      },
    })
  }

  return ops
}

function enrichFinalizeContext(baseContext: any, toolResult: any): any {
  const next = { ...(baseContext ?? {}) }
  if (Array.isArray(toolResult?.elements) && toolResult.elements.length > 0) {
    next.elements = toolResult.elements
  }
  if (Array.isArray(toolResult?.tasks) && toolResult.tasks.length > 0) {
    next.tasks = toolResult.tasks
  }
  const materialLines = Array.isArray(toolResult?.materialLines) ? toolResult.materialLines : undefined
  const workLines = Array.isArray(toolResult?.workLines) ? toolResult.workLines : undefined
  if (materialLines || workLines) {
    const accounting = { ...((next as any)?.accounting ?? {}) }
    if (materialLines) accounting.materialLines = materialLines
    if (workLines) accounting.workLines = workLines
    next.accounting = accounting
  }
  return next
}

function stableHash(input: string) {
  let h = 2166136261
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return `h${(h >>> 0).toString(16)}`
}

function toFinalizeElementKey(value: unknown) {
  return normalizeKeyPart(value) || 'element'
}

function stageArtifactFromFinalizeTool(
  toolId: string,
  result: any,
  elementRefToKey: Map<string, string>
) {
  if (toolId === 'plan.elements') {
    const elements = Array.isArray(result?.elements) ? result.elements : []
    const proposedElements = elements.map((item: any, index: number) => {
      const nameHe = firstNonEmpty([item?.titleHe, item?.nameHe, item?.title, item?.name, `אלמנט ${index + 1}`])
      const elementKey = toFinalizeElementKey(firstNonEmpty([item?.tempId, item?.stableKey, item?.id, nameHe]))
      const refs = [item?.tempId, item?.stableKey, item?.id, item?.elementId]
      for (const ref of refs) {
        const value = String(ref ?? '').trim()
        if (value) elementRefToKey.set(value, elementKey)
      }
      return {
        nameHe,
        elementKey,
        rationaleHe: firstNonEmpty([item?.descriptionHe, item?.description]) || undefined,
      }
    })
    return {
      stageKey: 'scope',
      artifact: {
        proposedElements,
        __persisted: {
          source: 'finalize_now',
          toolId,
          savedAt: Date.now(),
          toolOutput: result,
        },
      },
    }
  }

  if (toolId === 'plan.tasks') {
    const tasks = Array.isArray(result?.tasks) ? result.tasks : []
    const normalizedTasks = tasks.map((item: any) => {
      const rawElementRef = firstNonEmpty([item?.elementTempOrId, item?.elementId])
      const mappedElementKey =
        elementRefToKey.get(String(rawElementRef ?? '')) ??
        toFinalizeElementKey(rawElementRef)
      return {
        elementKey: mappedElementKey,
        titleHe: firstNonEmpty([item?.titleHe, item?.title, item?.descriptionHe, 'משימה']),
        durationHours: toFiniteNumber(item?.estimateHours ?? item?.estimatedHours) ?? 1,
        category: firstNonEmpty([item?.workType?.key, item?.workType, item?.stageKey, item?.stage]),
      }
    })
    return {
      stageKey: 'tasks',
      artifact: {
        tasks: normalizedTasks,
        __persisted: {
          source: 'finalize_now',
          toolId,
          savedAt: Date.now(),
          toolOutput: result,
        },
      },
    }
  }

  if (toolId === 'cost.build_budget' || toolId === 'pricing.resolve_lines') {
    const materialLinesRaw = Array.isArray(result?.materialLines) ? result.materialLines : []
    const workLinesRaw = Array.isArray(result?.workLines) ? result.workLines : []
    const materialLines = materialLinesRaw.map((line: any, index: number) => {
      const rawElementRef = firstNonEmpty([line?.elementTempOrId, line?.elementId])
      const mappedElementKey =
        elementRefToKey.get(String(rawElementRef ?? '')) ??
        (String(line?.elementScope ?? '').trim() === 'project' ? '' : toFinalizeElementKey(rawElementRef))
      return {
        elementKey: mappedElementKey,
        titleHe: firstNonEmpty([line?.itemHe, line?.itemName, `חומר ${index + 1}`]),
        itemName: firstNonEmpty([line?.itemName, line?.itemHe, `חומר ${index + 1}`]),
        quantity: toFiniteNumber(line?.qty ?? line?.quantity) ?? 1,
        unitPrice: toFiniteNumber(line?.unitPrice ?? line?.plannedUnitCost) ?? 1,
        taskTitleHe: firstNonEmpty([line?.taskTitleHe, line?.taskTempOrId, line?.taskId]),
      }
    })
    const workLines = workLinesRaw.map((line: any, index: number) => {
      const rawElementRef = firstNonEmpty([line?.elementTempOrId, line?.elementId])
      const mappedElementKey =
        elementRefToKey.get(String(rawElementRef ?? '')) ??
        (String(line?.elementScope ?? '').trim() === 'project' ? '' : toFinalizeElementKey(rawElementRef))
      return {
        elementKey: mappedElementKey,
        titleHe: firstNonEmpty([line?.titleHe, line?.roleHe, `עבודה ${index + 1}`]),
        roleHe: firstNonEmpty([line?.roleHe, line?.titleHe, `עבודה ${index + 1}`]),
        hours: toFiniteNumber(line?.hours ?? line?.qty ?? line?.plannedQuantity) ?? 1,
        hourlyRate: toFiniteNumber(line?.rate ?? line?.plannedUnitCost) ?? 1,
        workTypeLabelHe: firstNonEmpty([line?.workTypeLabelHe, line?.workTypeKey, line?.workType]),
      }
    })
    return {
      stageKey: toolId === 'cost.build_budget' ? 'budget' : 'pricing',
      artifact: {
        materialLines,
        workLines,
        __persisted: {
          source: 'finalize_now',
          toolId,
          savedAt: Date.now(),
          toolOutput: result,
        },
      },
    }
  }

  return null
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
  handler: async () => {
    // Autofill is intentionally disabled to prevent mock baseline entities.
    return {
      createdElements: 0,
      createdTasks: 0,
      assumedAnswers: 0,
      skipped: true,
      reason: 'disabled',
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

export const requestFinalizeCancel = mutation({
  args: {
    runId: v.id('sdkRuns'),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert('sdkRunEvents', {
      runId: args.runId,
      type: 'sdk_finalize_cancel_requested',
      payload: { requestedAt: Date.now() },
      createdAt: Date.now(),
    })
    return { ok: true }
  },
})

export const persistFinalizeStageCheckpoint = internalAction({
  args: {
    projectId: v.id('projects'),
    conversationId: v.id('agentConversations'),
    runId: v.id('sdkRuns'),
    stageKey: v.string(),
    toolOutputs: v.any(),
    source: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const startedAt = Date.now()
    try {
      const liveContext = await ctx.runQuery(api.sdk.api.contextGet, {
        projectId: args.projectId,
        packs: ['project', 'elements', 'tasks', 'accounting', 'knowledge'],
      })
      const outputs = (args.toolOutputs && typeof args.toolOutputs === 'object')
        ? args.toolOutputs
        : {}
      const directOps = buildFinalizeDirectOps(outputs, String(args.projectId), liveContext as any)
      if (directOps.length === 0) {
        await ctx.runMutation(internal.sdk.telemetry.logEvent, {
          runId: args.runId,
          type: 'sdk_finalize_stage_persist_no_ops',
          payload: {
            stageKey: args.stageKey,
            source: args.source ?? 'tool',
          },
        })
        return { ok: true, opCount: 0 }
      }

      const changeSetId = await ctx.runMutation(api.changeSets.createChangeSet, {
        projectId: args.projectId,
        stage: 'BREAKDOWN',
        ops: directOps as any,
        createdBy: { type: 'agent', agentName: `finalize.stage.${args.stageKey}` },
      })
      await ctx.runMutation(api.changeSets.applyChangeSet, { changeSetId })
      await ctx.runMutation(internal.sdk.telemetry.logEvent, {
        runId: args.runId,
        type: 'sdk_finalize_stage_persist_applied',
        payload: {
          stageKey: args.stageKey,
          source: args.source ?? 'tool',
          changeSetId,
          opCount: directOps.length,
          elapsedMs: Date.now() - startedAt,
        },
      })
      return { ok: true, opCount: directOps.length, changeSetId }
    } catch (error: any) {
      await ctx.runMutation(internal.sdk.telemetry.logEvent, {
        runId: args.runId,
        type: 'sdk_finalize_stage_persist_failed',
        payload: {
          stageKey: args.stageKey,
          source: args.source ?? 'tool',
          message: String(error?.message ?? 'unknown'),
        },
      })
      return { ok: false, message: String(error?.message ?? 'unknown') }
    }
  },
})

export const persistFinalizeIntentsCheckpoint = internalAction({
  args: {
    projectId: v.id('projects'),
    conversationId: v.id('agentConversations'),
    runId: v.id('sdkRuns'),
    stageKey: v.string(),
    intents: v.array(v.any()),
    source: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const intents = Array.isArray(args.intents) ? args.intents : []
    if (intents.length === 0) return { ok: true, opCount: 0 }
    try {
      const compiled = await ctx.runAction(api.sdk.changeset.compile, {
        projectId: args.projectId,
        intents,
        runId: args.runId,
        conversationId: args.conversationId,
      })
      const changeSetId = (compiled as any)?.changeSetId
      if (!changeSetId) {
        await ctx.runMutation(internal.sdk.telemetry.logEvent, {
          runId: args.runId,
          type: 'sdk_finalize_stage_persist_no_changeset',
          payload: {
            stageKey: args.stageKey,
            source: args.source ?? 'audit',
          },
        })
        return { ok: true, opCount: 0 }
      }
      await ctx.runMutation(api.changeSets.applyChangeSet, { changeSetId })
      await ctx.runMutation(internal.sdk.telemetry.logEvent, {
        runId: args.runId,
        type: 'sdk_finalize_stage_persist_applied',
        payload: {
          stageKey: args.stageKey,
          source: args.source ?? 'audit',
          changeSetId,
          intentsCount: intents.length,
        },
      })
      return { ok: true, changeSetId, intentsCount: intents.length }
    } catch (error: any) {
      await ctx.runMutation(internal.sdk.telemetry.logEvent, {
        runId: args.runId,
        type: 'sdk_finalize_stage_persist_failed',
        payload: {
          stageKey: args.stageKey,
          source: args.source ?? 'audit',
          message: String(error?.message ?? 'unknown'),
        },
      })
      return { ok: false, message: String(error?.message ?? 'unknown') }
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
    const finalizeStartedAt = Date.now()
    const run = await ctx.runQuery(internal.sdk.queries.getRun, { runId: args.runId })
    if (!run) throw new Error('Run not found')

    const latestStarted = await ctx.runQuery(api.sdk.api.listRunEvents, {
      runId: args.runId,
      type: 'sdk_finalize_started',
      limit: 1,
    })
    const latestCompleted = await ctx.runQuery(api.sdk.api.listRunEvents, {
      runId: args.runId,
      type: 'sdk_finalize_completed',
      limit: 1,
    })
    const latestCancelled = await ctx.runQuery(api.sdk.api.listRunEvents, {
      runId: args.runId,
      type: 'sdk_finalize_cancelled',
      limit: 1,
    })
    const startedAt = Number(latestStarted?.[0]?.createdAt ?? 0)
    const completedAt = Number(latestCompleted?.[0]?.createdAt ?? 0)
    const cancelledAt = Number(latestCancelled?.[0]?.createdAt ?? 0)
    if (startedAt > Math.max(completedAt, cancelledAt)) {
      await ctx.runMutation(internal.sdk.telemetry.logEvent, {
        runId: args.runId,
        type: 'sdk_finalize_already_running',
        payload: {
          startedAt,
        },
      })
      return {
        ok: false,
        alreadyRunning: true,
      }
    }

    const isFinalizeCancelled = async () => {
      const latestCancel = await ctx.runQuery(api.sdk.api.listRunEvents, {
        runId: args.runId,
        type: 'sdk_finalize_cancel_requested',
        limit: 1,
      })
      const event = latestCancel?.[0]
      return Boolean(event && Number(event.createdAt ?? 0) >= finalizeStartedAt)
    }

    const emitFinalizeStage = async (stage: string, status: 'running' | 'completed' | 'failed' | 'cancelled', detail?: any) => {
      await ctx.runMutation(internal.sdk.telemetry.logEvent, {
        runId: args.runId,
        type: 'sdk_finalize_stage_update',
        payload: {
          stage,
          status,
          detail: detail ?? null,
          ts: Date.now(),
        },
      })
    }

    await ctx.runMutation(internal.sdk.telemetry.logEvent, {
      runId: args.runId,
      type: 'sdk_finalize_started',
      payload: {
        startedAt: finalizeStartedAt,
        stages: ['elements', 'tasks', 'budget', 'pricing', 'audit', 'repair', 'package'],
      },
    })

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
    const toolErrors: Array<{ toolId: string; message: string }> = []
    let cancelled = false
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

      const buildInputBase = {
        userText: String(latestUserText ?? ''),
        finalizePolicy: {
          mode: 'force_full_finalize',
          assumeMissing: true,
          pricingOrder: ['catalog', 'web', 'estimate'],
          requireAll: ['elements', 'tasks', 'accounting'],
        },
      }

      const toolSequence = ['plan.elements', 'plan.tasks', 'cost.build_budget', 'pricing.resolve_lines']
      const stageByToolId: Record<string, string> = {
        'plan.elements': 'elements',
        'plan.tasks': 'tasks',
        'cost.build_budget': 'budget',
        'pricing.resolve_lines': 'pricing',
      }
      const intents: any[] = []
      const toolOutputs: Record<string, any> = {}
      let workingContext: any = liveBefore
      const elementRefToKey = new Map<string, string>()
      for (const toolId of toolSequence) {
        if (await isFinalizeCancelled()) {
          cancelled = true
          break
        }

        const stageKey = stageByToolId[toolId] ?? toolId
        await emitFinalizeStage(stageKey, 'running')
        const toolInput = {
          ...buildInputBase,
          context: workingContext,
        }
        try {
          const result = await runTool(toolId, toolInput)
          toolOutputs[toolId] = result
          intents.push(...collectIntentsFromResult(result))
          workingContext = enrichFinalizeContext(workingContext, result)
          const stageArtifact = stageArtifactFromFinalizeTool(toolId, result, elementRefToKey)
          if (stageArtifact) {
            const artifactJson = JSON.stringify(stageArtifact.artifact ?? {})
            const specJson = JSON.stringify({
              source: 'finalize_now',
              toolId,
              projectId: String(args.projectId),
              runId: String(args.runId),
            })
            await ctx.runMutation(internal['sdk/vnext/artifacts'].upsertStageArtifact, {
              runId: args.runId,
              projectId: args.projectId,
              conversationId: args.conversationId,
              stageKey: stageArtifact.stageKey,
              artifact: stageArtifact.artifact,
              artifactHash: stableHash(artifactJson),
              specHash: stableHash(specJson),
              status: 'ready',
            })
          }
          await ctx.scheduler.runAfter(0, internal.sdk.api.persistFinalizeStageCheckpoint, {
            projectId: args.projectId,
            conversationId: args.conversationId,
            runId: args.runId,
            stageKey,
            toolOutputs: { ...toolOutputs },
            source: toolId,
          })
          await ctx.runMutation(internal.sdk.telemetry.logEvent, {
            runId: args.runId,
            type: 'sdk_finalize_stage_persist_enqueued',
            payload: {
              stageKey,
              source: toolId,
              outputCount: Object.keys(toolOutputs).length,
            },
          })
          await emitFinalizeStage(stageKey, 'completed')

          if (toolId === 'pricing.resolve_lines') {
            if (await isFinalizeCancelled()) {
              cancelled = true
              break
            }
            await emitFinalizeStage('audit', 'running')
            let auditResult: any = null
            try {
              auditResult = await runTool('audit.project', {
                context: workingContext,
                findings: [],
                source: 'finalize_post_pricing',
              })
            } catch (auditError: any) {
              const message = String(auditError?.message ?? 'unknown')
              toolErrors.push({ toolId: 'audit.project', message })
              await emitFinalizeStage('audit', 'failed', { message })
            }

            if (auditResult) {
              const findings = Array.isArray(auditResult?.findings) ? auditResult.findings : []
              const auditIntents = collectIntentsFromResult(auditResult)
              await ctx.runMutation(internal.sdk.telemetry.logEvent, {
                runId: args.runId,
                type: 'sdk_finalize_audit_result',
                payload: {
                  findings,
                  findingCount: findings.length,
                  intentsCount: auditIntents.length,
                },
              })
              if (auditIntents.length > 0) {
                await ctx.scheduler.runAfter(0, internal.sdk.api.persistFinalizeIntentsCheckpoint, {
                  projectId: args.projectId,
                  conversationId: args.conversationId,
                  runId: args.runId,
                  stageKey: 'audit',
                  intents: auditIntents,
                  source: 'audit.project',
                })
              }

              const findingText = JSON.stringify(findings).toLowerCase()
              const needsRepair =
                findingText.includes('duplicate') ||
                findingText.includes('missing') ||
                findingText.includes('price') ||
                findingText.includes('pricing') ||
                findingText.includes('מחיר') ||
                findingText.includes('כפול') ||
                findingText.includes('חסר')

              if (needsRepair) {
                if (await isFinalizeCancelled()) {
                  cancelled = true
                  break
                }
                await emitFinalizeStage('repair', 'running')
                try {
                  const repairResult = await runTool('maint.sync_and_repair', {
                    context: workingContext,
                    findings,
                    source: 'finalize_post_pricing',
                  })
                  const repairIntents = collectIntentsFromResult(repairResult)
                  if (repairIntents.length > 0) {
                    await ctx.scheduler.runAfter(0, internal.sdk.api.persistFinalizeIntentsCheckpoint, {
                      projectId: args.projectId,
                      conversationId: args.conversationId,
                      runId: args.runId,
                      stageKey: 'repair',
                      intents: repairIntents,
                      source: 'maint.sync_and_repair',
                    })
                  }
                  // Pricing refill pass after repair signals.
                  const pricingRetry = await runTool('pricing.resolve_lines', {
                    ...buildInputBase,
                    context: workingContext,
                  })
                  toolOutputs['pricing.resolve_lines.retry'] = pricingRetry
                  workingContext = enrichFinalizeContext(workingContext, pricingRetry)
                  const retryArtifact = stageArtifactFromFinalizeTool('pricing.resolve_lines', pricingRetry, elementRefToKey)
                  if (retryArtifact) {
                    const artifactJson = JSON.stringify(retryArtifact.artifact ?? {})
                    await ctx.runMutation(internal['sdk/vnext/artifacts'].upsertStageArtifact, {
                      runId: args.runId,
                      projectId: args.projectId,
                      conversationId: args.conversationId,
                      stageKey: retryArtifact.stageKey,
                      artifact: retryArtifact.artifact,
                      artifactHash: stableHash(artifactJson),
                      specHash: stableHash(JSON.stringify({ source: 'finalize_retry_pricing', runId: String(args.runId) })),
                      status: 'ready',
                    })
                    await ctx.scheduler.runAfter(0, internal.sdk.api.persistFinalizeStageCheckpoint, {
                      projectId: args.projectId,
                      conversationId: args.conversationId,
                      runId: args.runId,
                      stageKey: 'pricing',
                      toolOutputs: { ...toolOutputs },
                      source: 'pricing.resolve_lines.retry',
                    })
                  }
                  await emitFinalizeStage('repair', 'completed')
                } catch (repairError: any) {
                  const message = String(repairError?.message ?? 'unknown')
                  toolErrors.push({ toolId: 'maint.sync_and_repair', message })
                  await emitFinalizeStage('repair', 'failed', { message })
                }
              }
              await emitFinalizeStage('audit', 'completed')
            }
          }
        } catch (toolError: any) {
          const message = String(toolError?.message ?? 'unknown')
          toolErrors.push({ toolId, message })
          await ctx.runMutation(internal.sdk.telemetry.logEvent, {
            runId: args.runId,
            type: 'sdk_finalize_tool_failed',
            payload: {
              toolId,
              message,
            },
          })
          await emitFinalizeStage(stageByToolId[toolId] ?? toolId, 'failed', { message })
        }
      }

      if (cancelled) {
        await emitFinalizeStage('package', 'cancelled')
      }

      if (!cancelled) {
        const directOps = buildFinalizeDirectOps(toolOutputs, String(args.projectId), liveBefore as any)
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
            context: workingContext,
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
              toolErrorsCount: toolErrors.length,
            },
          })
        }
        } else {
          await ctx.runMutation(internal.sdk.telemetry.logEvent, {
            runId: args.runId,
            type: 'sdk_finalize_no_ops_from_tools',
            payload: {
              toolErrors,
            },
          })
        }
      }
    } catch (error: any) {
      if (String(error?.message ?? '').includes('FINALIZE_CANCELLED')) {
        cancelled = true
      }
      await ctx.runMutation(internal.sdk.telemetry.logEvent, {
        runId: args.runId,
        type: 'sdk_finalize_full_build_failed',
        payload: {
          message: String(error?.message ?? 'unknown'),
          toolErrors,
        },
      })
    }

    if (cancelled || (await isFinalizeCancelled())) {
      await ctx.runMutation(internal.sdk.telemetry.logEvent, {
        runId: args.runId,
        type: 'sdk_finalize_cancelled',
        payload: {
          at: Date.now(),
          toolErrors,
        },
      })
      await ctx.runMutation(internal.sdk.telemetry.appendMessage, {
        conversationId: args.conversationId,
        role: 'assistant',
        text: 'Finalize cancelled by user.',
        blocks: [
          {
            type: 'ReviewBlock',
            titleHe: 'Finalize Cancelled',
            sections: [
              {
                sectionHe: 'Status',
                highlightsHe: ['Finalize calls were stopped by user request.'],
                risksHe: toolErrors.map((item) => `${item.toolId}: ${item.message}`),
              },
            ],
          },
        ],
        runId: args.runId,
      })
      return {
        ok: false,
        cancelled: true,
        toolErrors,
      }
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

    await emitFinalizeStage('package', 'running')
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

    let summaryMd = `Finalize summary:\n- Elements: ${elements.length}\n- Tasks: ${tasks.length}\n- Unresolved: ${unresolved}`
    try {
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
      const tracedSummary = String((response as any)?.choices?.[0]?.message?.content ?? '').trim()
      if (tracedSummary) summaryMd = tracedSummary
    } catch (error: any) {
      await ctx.runMutation(internal.sdk.telemetry.logEvent, {
        runId: args.runId,
        type: 'sdk_finalize_summary_failed',
        payload: {
          message: String(error?.message ?? 'unknown'),
        },
      })
    }

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
                `Tool failures: ${toolErrors.length}`,
              ],
              risksHe: isEmpty ? ['No generated entities found yet'] : toolErrors.map((item) => `${item.toolId}: ${item.message}`),
            },
          ],
          risksHe: isEmpty ? ['No generated entities found yet'] : toolErrors.map((item) => `${item.toolId}: ${item.message}`),
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
        toolErrors,
      },
    })
    await emitFinalizeStage('package', 'completed')
    await ctx.runMutation(internal.sdk.telemetry.logEvent, {
      runId: args.runId,
      type: 'sdk_finalize_completed',
      payload: {
        finishedAt: Date.now(),
        isEmpty,
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
      toolErrors,
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





