"use node";

import { action } from '../_generated/server';
import { v } from 'convex/values';
import { api, internal } from '../_generated/api';
import type { Id } from '../_generated/dataModel';
import { FULL_PROMPTS } from './prompts';
import { runJsonCompletion } from './llm';
import { assertAsciiKeys, validateSdkOutput } from './schemas';
import { compileDeterministicChangeSet } from './vnext/compiler';
import { buildTargetPlanSpec } from './vnext/specBuilder';
import type { StageArtifactMap } from './vnext/contracts';

function extractOpsFromTruncatedCompileJson(raw: string): any[] {
  if (!raw || typeof raw !== 'string') return [];
  const opsKeyIndex = raw.indexOf('"ops"');
  if (opsKeyIndex < 0) return [];
  const arrayStart = raw.indexOf('[', opsKeyIndex);
  if (arrayStart < 0) return [];

  const ops: any[] = [];
  let i = arrayStart + 1;
  const len = raw.length;
  while (i < len) {
    const ch = raw[i];
    if (ch === ']') break;
    if (ch === '{') {
      const objStart = i;
      let depth = 1;
      let inString = false;
      let escaped = false;
      i += 1;
      while (i < len && depth > 0) {
        const c = raw[i];
        if (inString) {
          if (escaped) {
            escaped = false;
          } else if (c === '\\') {
            escaped = true;
          } else if (c === '"') {
            inString = false;
          }
        } else {
          if (c === '"') inString = true;
          else if (c === '{') depth += 1;
          else if (c === '}') depth -= 1;
        }
        i += 1;
      }
      if (depth === 0) {
        const objText = raw.slice(objStart, i);
        try {
          const parsed = JSON.parse(objText);
          if (parsed && typeof parsed === 'object') ops.push(parsed);
        } catch {
          // ignore malformed object fragments
        }
      } else {
        break;
      }
      continue;
    }
    i += 1;
  }
  return ops;
}

async function compileDeterministicFromRun(ctx: any, args: {
  projectId: Id<'projects'>
  runId: Id<'sdkRuns'>
}) {
  const run = await ctx.runQuery(internal.sdk.queries.getRun, { runId: args.runId });
  if (!run) throw new Error('Run not found');

  const [projectContext, artifactsRows, stageDecisions, messages] = await Promise.all([
    ctx.runQuery(api['sdk/api'].contextGet, {
      projectId: args.projectId,
      packs: ['project', 'elements', 'tasks', 'knowledge'],
    }),
    ctx.runQuery(internal['sdk/vnext/artifacts'].listStageArtifactsByRun, { runId: args.runId }),
    ctx.runQuery(internal['sdk/vnext/artifacts'].listStageDecisionsByRun, { runId: args.runId }),
    ctx.runQuery(api['sdk/api'].listMessages, {
      conversationId: run.conversationId,
      runId: args.runId,
      limit: 60,
    }),
  ]);

  const artifacts: StageArtifactMap = {} as StageArtifactMap;
  for (const row of artifactsRows) {
    (artifacts as any)[row.stageKey] = row.artifact;
  }
  const recentUserTexts = (messages ?? [])
    .filter((item: any) => item.role === 'user' && typeof item.text === 'string')
    .map((item: any) => item.text)
    .slice(-10);
  const scopeSeed = Array.isArray((artifacts.scope as any)?.proposedElements)
    ? (artifacts.scope as any).proposedElements
    : [];
  const spec = buildTargetPlanSpec({
    projectId: args.projectId,
    project: projectContext?.project ?? {},
    recentUserTexts,
    stageDecisions,
    existingScopeElements: scopeSeed,
  });
  const deterministic = compileDeterministicChangeSet({
    spec,
    artifacts,
  });
  if (!Array.isArray(deterministic.ops) || deterministic.ops.length === 0) {
    throw new Error('deterministic compile produced zero ops');
  }
  const changeSetId = await ctx.runMutation(api.changeSets.createChangeSet, {
    projectId: args.projectId,
    stage: 'BREAKDOWN',
    ops: deterministic.ops,
    createdBy: { type: 'agent', agentName: 'changeset.compile.deterministic' },
  });
  return {
    changeSetId,
    changeSet: { ops: deterministic.ops },
    meta: {
      mode: 'deterministic',
      summaryHe: deterministic.summaryHe,
      coverage: deterministic.coverage,
    },
  };
}

export const compile = action({
  args: {
    projectId: v.id('projects'),
    intents: v.array(v.any()),
    context: v.optional(v.any()),
    deterministic: v.optional(v.boolean()),
    runId: v.optional(v.id('sdkRuns')),
    conversationId: v.optional(v.id('agentConversations')),
  },
  handler: async (ctx, args) => {
    if (args.deterministic && args.runId) {
      return compileDeterministicFromRun(ctx, {
        projectId: args.projectId,
        runId: args.runId,
      });
    }

    const intents = Array.isArray(args.intents) ? args.intents : [];
    if (intents.length === 0) {
      throw new Error('changeset.compile requires at least one intent');
    }

    // ── Deterministic structured-intent compiler ──────────────────
    // When plan.tasks_intent carries fully-structured tasks array,
    // compile ops directly without LLM to avoid hallucination.
    const structuredOps = compileStructuredIntents(intents);
    if (structuredOps.length > 0) {
      if (args.runId) {
        await ctx.runMutation(internal.sdk.telemetry.logEvent, {
          runId: args.runId,
          type: 'changeset_compile_deterministic_structured',
          payload: {
            intentsCount: intents.length,
            opsCount: structuredOps.length,
          },
        })
      }
      const changeSetId = await ctx.runMutation(api.changeSets.createChangeSet, {
        projectId: args.projectId,
        stage: 'BREAKDOWN',
        ops: structuredOps,
        createdBy: { type: 'agent', agentName: 'changeset.compile.structured' },
      });
      return {
        changeSetId,
        changeSet: { ops: structuredOps },
        meta: { compiledBy: 'deterministic-structured', intentsCount: intents.length },
      };
    }
    // ──────────────────────────────────────────────────────────────

    if (args.runId) {
      const summaries = intents.slice(0, 30).map((intent: any) => {
        const payload = intent?.payload && typeof intent.payload === 'object' ? intent.payload : {}
        return {
          type: String(intent?.type ?? ''),
          payloadKeys: Object.keys(payload).slice(0, 20),
          tasksCount: Array.isArray((payload as any)?.tasks) ? (payload as any).tasks.length : 0,
          elementsCount: Array.isArray((payload as any)?.elements) ? (payload as any).elements.length : 0,
          materialLinesCount: Array.isArray((payload as any)?.materialLines) ? (payload as any).materialLines.length : 0,
          workLinesCount: Array.isArray((payload as any)?.workLines) ? (payload as any).workLines.length : 0,
        }
      })
      await ctx.runMutation(internal.sdk.telemetry.logEvent, {
        runId: args.runId,
        type: 'changeset_compile_input_summary',
        payload: {
          intentsCount: intents.length,
          intents: summaries,
        },
      })
    }
    // Determine which context packs are relevant for these intents.
    // Task/element-only intents don't need the massive pricing catalog.
    const intentTypes = new Set(intents.map((i: any) => String(i?.type ?? '')));
    const needsPricing =
      intentTypes.has('cost.budget_intent') ||
      intentTypes.has('quote.intent') ||
      intentTypes.has('cost.pricing_intent');
    const basePacks = ['project', 'elements', 'tasks', 'accounting', 'quote', 'runbook', 'knowledge', 'qa', 'vendors', 'receipts'];
    const packs = needsPricing ? [...basePacks, 'pricing'] : basePacks;

    const context =
      args.context ??
      (await ctx.runQuery(api['sdk/api'].contextGet, {
        projectId: args.projectId,
        packs,
      }));

    const payload = {
      projectId: args.projectId,
      context,
      intents,
    };

    const compileAttempts = [
      { model: 'gpt-4o-mini', maxTokens: 2600 },
      { model: 'gpt-4o-mini', maxTokens: 4200 },
      { model: 'gpt-4o', maxTokens: 5600 },
    ] as const;

    let lastError: unknown = null;
    let lastRawContent = '';
    for (let i = 0; i < compileAttempts.length; i += 1) {
      const attempt = compileAttempts[i];
      const retryHint =
        i === 0
          ? ''
          : '\n\nRETRY REQUIREMENT:\nPrevious output was invalid/truncated JSON. Return a single compact JSON object only. No markdown. No comments. No trailing text.\n';

      try {
        const { parsed } = await runJsonCompletion({
          ctx,
          systemPrompt: FULL_PROMPTS.CHANGESET_COMPILE_SYSTEM,
          userContent: `${JSON.stringify(payload)}${retryHint}`,
          model: attempt.model,
          temperature: 0.1,
          maxCompletionTokens: attempt.maxTokens,
          projectId: args.projectId,
          conversationId: args.conversationId as any,
          runId: args.runId as any,
          traceMeta: {
            source: 'sdk',
            toolId: 'changeset.compile',
            attempt: i + 1,
          },
        });

        assertAsciiKeys(parsed);
        const validated = validateSdkOutput('changeset.compile', parsed);
        if (!validated.ok) {
          throw new Error('changeset.compile failed schema validation');
        }

        const changeSet = (validated.data as any).changeSet;
        if (!changeSet?.ops || !Array.isArray(changeSet.ops)) {
          throw new Error('changeset.compile returned no ops');
        }

        const mappedOps = changeSet.ops
          .map((op: any) => mapCompileOp(op))
          .filter((op: any) => op !== null);
        if (mappedOps.length === 0) {
          throw new Error('changeset.compile produced zero ops');
        }

        // ── Intent-coverage validation ──────────────────────────────
        // If plan.tasks_intent had N tasks, we expect at least N task
        // create/patch ops. If they're completely missing the compiler
        // hallucinated workLine patches instead → retry with higher model.
        const taskIntents = intents.filter(
          (i: any) =>
            i?.type === 'plan.tasks_intent' &&
            Array.isArray(i?.payload?.tasks) &&
            i.payload.tasks.length > 0,
        );
        if (taskIntents.length > 0) {
          const expectedTasks = taskIntents.reduce(
            (acc: number, i: any) => acc + i.payload.tasks.length,
            0,
          );
          const taskOps = mappedOps.filter(
            (op: any) =>
              op.kind === 'task.create' ||
              op.kind === 'task.patch',
          );
          if (taskOps.length === 0 && expectedTasks > 0) {
            throw new Error(
              `Intent-coverage failure: plan.tasks_intent had ${expectedTasks} tasks but compiler emitted 0 task ops (got ${mappedOps.length} ops of other kinds). Retrying.`,
            );
          }
        }
        // ────────────────────────────────────────────────────────────

        const changeSetId = await ctx.runMutation(api.changeSets.createChangeSet, {
          projectId: args.projectId,
          stage: 'BREAKDOWN',
          ops: mappedOps,
          createdBy: { type: 'agent', agentName: 'changeset.compile' },
        });

        return {
          changeSetId,
          changeSet,
          meta: (validated.data as any).meta,
        };
      } catch (error) {
        lastError = error;
        if (error && typeof error === 'object' && typeof (error as any).rawContent === 'string') {
          lastRawContent = (error as any).rawContent;
        }
      }
    }

    // Recovery path #1: salvage complete ops from truncated JSON response.
    if (lastRawContent) {
      const recoveredOps = extractOpsFromTruncatedCompileJson(lastRawContent);
      const mappedRecoveredOps = recoveredOps
        .map((op: any) => mapCompileOp(op))
        .filter((op: any) => op !== null);
      if (mappedRecoveredOps.length > 0) {
        const changeSetId = await ctx.runMutation(api.changeSets.createChangeSet, {
          projectId: args.projectId,
          stage: 'BREAKDOWN',
          ops: mappedRecoveredOps,
          createdBy: { type: 'agent', agentName: 'changeset.compile.recovered' },
        });
        return {
          changeSetId,
          changeSet: { ops: recoveredOps },
          meta: {
            mode: 'recovered_from_truncated_json',
            recoveredOps: mappedRecoveredOps.length,
          },
        };
      }
    }

    if (args.runId) {
      try {
        const fallback = await compileDeterministicFromRun(ctx, {
          projectId: args.projectId,
          runId: args.runId,
        });
        return {
          ...fallback,
          meta: {
            ...(fallback as any).meta,
            fallbackReason: 'llm_json_invalid_or_truncated',
          },
        };
      } catch (deterministicError) {
        throw new Error(
          `changeset.compile failed after retries: ${lastError instanceof Error ? lastError.message : String(lastError)}; deterministic fallback failed: ${deterministicError instanceof Error ? deterministicError.message : String(deterministicError)}`
        );
      }
    }

    throw lastError instanceof Error ? lastError : new Error('changeset.compile failed');
  },
});

// ── Deterministic structured-intent compiler ────────────────────────
// Converts fully-structured plan.tasks_intent, plan.elements_intent,
// and cost.budget_intent into changeset ops WITHOUT an LLM call.
// Returns empty array if intents are not structured enough.
function firstNonEmptyString(values: any[]): string | undefined {
  for (const value of values) {
    if (typeof value !== 'string') continue
    const trimmed = value.trim()
    if (trimmed) return trimmed
  }
  return undefined
}

function toFiniteNumber(value: any): number | undefined {
  if (value === null || value === undefined) return undefined
  if (typeof value === 'string' && !value.trim()) return undefined
  const n = Number(value)
  return Number.isFinite(n) ? n : undefined
}

function normalizeTaskDependencies(value: any): string[] | undefined {
  const raw =
    value?.afterTaskTempIds ??
    value?.afterTaskIds ??
    value?.dependsOn ??
    value

  if (Array.isArray(raw)) {
    const list = raw.map((item: any) => String(item ?? '').trim()).filter(Boolean)
    return list.length > 0 ? list : undefined
  }

  if (typeof raw === 'string') {
    const list = raw.split(',').map((item) => item.trim()).filter(Boolean)
    return list.length > 0 ? list : undefined
  }

  return undefined
}

function normalizeTaskWorkType(value: any): string | undefined {
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (!value || typeof value !== 'object') return undefined
  return firstNonEmptyString([value.key, value.code, value.value, value.id])
}

function normalizeTaskFieldsForSdk(task: any, fallbackTitle?: string) {
  const fields: any = {}

  const title = firstNonEmptyString([
    task?.title,
    task?.titleHe,
    task?.name,
    task?.nameHe,
    fallbackTitle,
  ])
  if (title) fields.title = title

  const titleHe = firstNonEmptyString([task?.titleHe, task?.title])
  if (titleHe) fields.titleHe = titleHe

  const description = firstNonEmptyString([
    task?.description,
    task?.descriptionHe,
    task?.doneCriteriaHe,
    task?.doneCriteria,
    task?.doneCriteriaTextHe,
  ])
  if (description) fields.description = description

  const descriptionHe = firstNonEmptyString([task?.descriptionHe, task?.description, task?.doneCriteriaHe])
  if (descriptionHe) fields.descriptionHe = descriptionHe

  const stage = firstNonEmptyString([task?.stage, task?.stageKey, task?.phase])
  if (stage) fields.stage = stage

  const status = firstNonEmptyString([task?.status])
  if (status) fields.status = status

  const workType = normalizeTaskWorkType(task?.workType ?? task?.workTypeKey)
  if (workType) fields.workType = workType

  const workTypeLabelHe = firstNonEmptyString([
    task?.workTypeLabelHe,
    task?.workType?.labelHe,
    task?.workType?.label,
  ])
  if (workTypeLabelHe) fields.workTypeLabelHe = workTypeLabelHe

  const estimatedHours = toFiniteNumber(task?.estimatedHours ?? task?.estimateHours)
  if (estimatedHours !== undefined) fields.estimatedHours = estimatedHours

  const checklist = Array.isArray(task?.checklist) ? task.checklist : undefined
  if (checklist) fields.checklist = checklist

  const dependencies = normalizeTaskDependencies(task?.dependencies)
  if (dependencies) fields.dependencies = dependencies

  for (const key of [
    'notes',
    'notesHe',
    'priority',
    'order',
    'tags',
    'dueDate',
    'startDate',
    'assignedTo',
    'skills',
    'materialRequirements',
    'laborRequirements',
    'plannedQuantity',
    'plannedTotalCost',
    'dedupKey',
  ]) {
    if (task?.[key] !== undefined && fields[key] === undefined) {
      fields[key] = task[key]
    }
  }

  return fields
}

function compileStructuredIntents(intents: any[]): any[] {
  const ops: any[] = [];
  let hasStructuredData = false;

  for (const intent of intents) {
    const type = String(intent?.type ?? '');
    const payload = intent?.payload;
    if (!payload || typeof payload !== 'object') continue;

    // ── plan.elements_intent ──
    if (type === 'plan.elements_intent' && Array.isArray(payload.elements)) {
      for (const el of payload.elements) {
        if (!el || typeof el !== 'object') continue;
        hasStructuredData = true;
        ops.push({
          kind: 'element.create',
          payload: {
            tempId: el.tempId ?? undefined,
            element: {
              title: el.title,
              titleHe: el.titleHe ?? el.title,
              description: el.description,
              descriptionHe: el.descriptionHe ?? el.description,
              scope: el.scope,
              scopeHe: el.scopeHe ?? el.scope,
              category: el.category,
              ...el,
            },
          },
        });
      }
    }

    // ── plan.tasks_intent ──
    if (type === 'plan.tasks_intent' && Array.isArray(payload.tasks) && payload.tasks.length > 0) {
      hasStructuredData = true;

      // Also emit companion elements if present
      if (Array.isArray(payload.elements)) {
        for (const el of payload.elements) {
          if (!el || typeof el !== 'object') continue;
          ops.push({
            kind: 'element.create',
            payload: {
              tempId: el.tempId ?? undefined,
              element: {
                title: el.title,
                titleHe: el.titleHe ?? el.title,
                description: el.description,
                descriptionHe: el.descriptionHe ?? el.description,
                scope: el.scope,
                scopeHe: el.scopeHe ?? el.scope,
                category: el.category,
                ...el,
              },
            },
          });
        }
      }

      for (let index = 0; index < payload.tasks.length; index += 1) {
        const task = payload.tasks[index]
        if (!task || typeof task !== 'object') continue;
        const fields = normalizeTaskFieldsForSdk(task, `Task ${index + 1}`)
        ops.push({
          kind: 'task.create',
          payload: {
            tempId: task.tempId ?? undefined,
            elementTempOrId: task.elementTempOrId ?? task.elementId ?? undefined,
            elementId: task.elementId ?? undefined,
            fields,
          },
        });
      }
    }

    // ── cost.budget_intent ──
    if (type === 'cost.budget_intent') {
      if (Array.isArray(payload.materialLines) && payload.materialLines.length > 0) {
        hasStructuredData = true;
        for (const ml of payload.materialLines) {
          if (!ml || typeof ml !== 'object') continue;
          ops.push({
            kind: 'materialLine.create',
            payload: {
              tempId: ml.tempId ?? undefined,
              elementTempOrId: ml.elementTempOrId ?? ml.elementId ?? undefined,
              taskTempOrId: ml.taskTempOrId ?? ml.taskId ?? undefined,
              elementId: ml.elementId ?? undefined,
              fields: { ...ml },
              dedupKey: ml.dedupKey ?? undefined,
            },
          });
        }
      }
      if (Array.isArray(payload.workLines) && payload.workLines.length > 0) {
        hasStructuredData = true;
        for (const wl of payload.workLines) {
          if (!wl || typeof wl !== 'object') continue;
          const normalizedFields = normalizeWorkLineFieldsForSdk({ ...wl });
          ops.push({
            kind: 'workLine.create',
            payload: {
              tempId: wl.tempId ?? undefined,
              elementTempOrId: wl.elementTempOrId ?? wl.elementId ?? undefined,
              taskTempOrId: wl.taskTempOrId ?? wl.taskId ?? undefined,
              elementId: wl.elementId ?? undefined,
              fields: normalizedFields,
              dedupKey: wl.dedupKey ?? undefined,
            },
          });
        }
      }
    }
  }

  if (!hasStructuredData) return [];

  // ── Element reference ordering ──────────────────────────────────
  // Ensure element.create ops come before task.create ops that
  // reference them via elementTempOrId, so temp ID resolution works.
  const elementCreates = ops.filter((op: any) => op.kind === 'element.create');
  const rest = ops.filter((op: any) => op.kind !== 'element.create');
  return [...elementCreates, ...rest];
}
// ────────────────────────────────────────────────────────────────────

function normalizeCompileEntity(raw: any): 'element' | 'task' | 'materialLine' | 'workLine' | 'accountingLine' | null {
  const value = String(raw ?? '').trim().toLowerCase();
  if (!value) return null;
  if (value === 'element' || value === 'elements') return 'element';
  if (value === 'task' || value === 'tasks') return 'task';
  if (value === 'materialline' || value === 'material_line' || value === 'material') return 'materialLine';
  if (value === 'workline' || value === 'work_line' || value === 'laborline' || value === 'labourline' || value === 'labor') return 'workLine';
  if (value === 'accountingline' || value === 'accounting_line' || value === 'line') return 'accountingLine';
  return null;
}

function normalizeCompileAction(raw: any): 'create' | 'patch' | 'delete' | null {
  const value = String(raw ?? '').trim().toLowerCase();
  if (!value) return null;
  if (value === 'create' || value === 'insert' || value === 'add') return 'create';
  if (value === 'patch' || value === 'update' || value === 'edit') return 'patch';
  if (value === 'delete' || value === 'remove' || value === 'softdelete' || value === 'archive') return 'delete';
  return null;
}

function mapCompileOp(op: any) {
  if (!op) return null;
  const entity = normalizeCompileEntity(op.entity);
  const action = normalizeCompileAction(op.op);
  if (!entity || !action) return null;
  const tempId = op.tempId ?? undefined;

  if (action === 'create') {
    if (entity === 'element') {
      return { kind: 'element.create', payload: { tempId, element: op.create ?? {} } };
    }
    if (entity === 'task') {
      const createFields = normalizeTaskFieldsForSdk(
        op.create ?? {},
        op.create?.tempId ? `Task ${String(op.create.tempId).trim()}` : undefined,
      )
      return {
        kind: 'task.create',
        payload: {
          tempId,
          elementTempOrId: op.create?.elementTempOrId ?? op.create?.elementId,
          elementId: op.create?.elementId,
          fields: createFields,
        },
      };
    }
    if (entity === 'materialLine') {
      return {
        kind: 'materialLine.create',
        payload: {
          tempId,
          elementTempOrId: op.create?.elementTempOrId ?? op.create?.elementId,
          taskTempOrId: op.create?.taskTempOrId ?? op.create?.taskId,
          elementId: op.create?.elementId,
          fields: op.create ?? {},
          dedupKey: op.dedupKey,
        },
      };
    }
    if (entity === 'workLine') {
      const normalizedFields = normalizeWorkLineFieldsForSdk(op.create ?? {})
      return {
        kind: 'workLine.create',
        payload: {
          tempId,
          elementTempOrId: op.create?.elementTempOrId ?? op.create?.elementId,
          taskTempOrId: op.create?.taskTempOrId ?? op.create?.taskId,
          elementId: op.create?.elementId,
          fields: normalizedFields,
          dedupKey: op.dedupKey,
        },
      };
    }
    if (entity === 'accountingLine') {
      return {
        kind: 'accountingLine.create',
        payload: {
          tempId,
          elementTempOrId: op.create?.elementTempOrId ?? op.create?.elementId,
          taskTempOrId: op.create?.taskTempOrId ?? op.create?.taskId,
          elementId: op.create?.elementId,
          fields: op.create ?? {},
          dedupKey: op.dedupKey,
        },
      };
    }
    return null;
  }

  if (action === 'patch') {
    if (entity === 'element') {
      return {
        kind: 'element.patch',
        payload: {
          elementId: op.id ?? undefined,
          elementTempOrId: op.id ?? op.tempId ?? undefined,
          patch: op.patch ?? {},
        },
      };
    }
    if (entity === 'task') {
      const patchFields = normalizeTaskFieldsForSdk(op.patch ?? {})
      return {
        kind: 'task.patch',
        payload: {
          taskId: op.id ?? undefined,
          taskTempOrId: op.id ?? op.tempId ?? undefined,
          fields: patchFields,
        },
      };
    }
    if (entity === 'materialLine') {
      return {
        kind: 'materialLine.patch',
        payload: {
          lineId: op.id ?? undefined,
          materialLineId: op.id ?? undefined,
          tempId: op.tempId ?? undefined,
          fields: op.patch ?? {},
        },
      };
    }
    if (entity === 'workLine') {
      const normalizedFields = normalizeWorkLineFieldsForSdk(op.patch ?? {})
      return {
        kind: 'workLine.patch',
        payload: {
          lineId: op.id ?? undefined,
          workLineId: op.id ?? undefined,
          tempId: op.tempId ?? undefined,
          fields: normalizedFields,
        },
      };
    }
    if (entity === 'accountingLine') {
      return {
        kind: 'accountingLine.patch',
        payload: {
          lineId: op.id ?? undefined,
          accountingLineId: op.id ?? undefined,
          tempId: op.tempId ?? undefined,
          fields: op.patch ?? {},
        },
      };
    }
    return null;
  }

  if (action === 'delete') {
    const deleteId = op.delete?.id ?? op.id;
    if (entity === 'task') {
      return { kind: 'task.delete', payload: { taskId: deleteId, taskTempOrId: op.tempId } };
    }
    if (entity === 'element') {
      return { kind: 'element.delete', payload: { elementId: deleteId, elementTempOrId: op.tempId } };
    }
    if (entity === 'materialLine') {
      return { kind: 'materialLine.delete', payload: { lineId: deleteId, materialLineId: deleteId, tempId: op.tempId } };
    }
    if (entity === 'workLine') {
      return { kind: 'workLine.delete', payload: { lineId: deleteId, workLineId: deleteId, tempId: op.tempId } };
    }
    if (entity === 'accountingLine') {
      return {
        kind: 'accountingLine.delete',
        payload: { lineId: deleteId, accountingLineId: deleteId, tempId: op.tempId },
      };
    }
    return null;
  }

  return null;
}

function normalizeWorkLineFieldsForSdk(fields: any) {
  const normalized = { ...(fields ?? {}) }
  delete normalized.assigneeId

  const dedupKey = firstNonEmptyString([normalized.dedupKey])
  if (dedupKey) normalized.dedupKey = dedupKey

  const dedupParts = dedupKey ? dedupKey.split('::').map((part) => part.trim()) : []
  const inferredWorkTypeFromDedup = dedupParts.length >= 3 ? dedupParts[2] : undefined
  const workType = firstNonEmptyString([
    normalized.workType,
    normalized.workTypeKey,
    inferredWorkTypeFromDedup,
  ])
  if (workType) normalized.workType = workType

  const workTypeLabelByKey: Record<string, string> = {
    carpentry: 'Carpentry',
    metal_fab: 'Metal fabrication',
    paint_finish: 'Paint and finish',
    printing_graphics: 'Printing and graphics',
    props_sculpt: 'Props and sculpt',
    rigging_install: 'Rigging and install',
    transport_logistics: 'Transport and logistics',
    purchasing: 'Purchasing',
    management: 'Management',
  }
  if (!firstNonEmptyString([normalized.workTypeLabelHe]) && workType && workTypeLabelByKey[workType]) {
    normalized.workTypeLabelHe = workTypeLabelByKey[workType]
  }

  const roleHe = firstNonEmptyString([
    normalized.roleHe,
    normalized.titleHe,
    normalized.title,
    normalized.role,
    normalized.workTypeLabelHe,
    workType ? workTypeLabelByKey[workType] : undefined,
  ])
  if (roleHe) normalized.roleHe = roleHe

  const plannedQuantity = toFiniteNumber(
    normalized.plannedQuantity ??
    normalized.plannedQuantityDays ??
    normalized.days ??
    normalized.qty ??
    normalized.quantity
  )
  if (plannedQuantity !== undefined) {
    normalized.plannedQuantity = plannedQuantity
  }

  const plannedUnitCost = toFiniteNumber(
    normalized.plannedUnitCost ??
    normalized.plannedDayRate ??
    normalized.dayRate ??
    normalized.rate ??
    normalized.unitCost
  )
  if (plannedUnitCost !== undefined) {
    normalized.plannedUnitCost = plannedUnitCost
  }

  const plannedTotalCost =
    toFiniteNumber(normalized.plannedTotalCost ?? normalized.total) ??
    (
      plannedQuantity !== undefined && plannedUnitCost !== undefined
        ? plannedQuantity * plannedUnitCost
        : undefined
    )
  if (plannedTotalCost !== undefined) {
    normalized.plannedTotalCost = plannedTotalCost
  }

  const rateTypeCode = String(
    normalized.rateTypeCode ??
    normalized.rateType ??
    ''
  ).trim().toLowerCase()
  const dayLike =
    rateTypeCode === 'day' ||
    normalized.plannedQuantityDays !== undefined ||
    normalized.plannedDayRate !== undefined ||
    normalized.dayRate !== undefined ||
    normalized.days !== undefined

  if (dayLike) {
    normalized.rateTypeCode = 'day'
  } else if (rateTypeCode) {
    normalized.rateTypeCode = rateTypeCode
  }

  return normalized
}

export const review = action({
  args: {
    projectId: v.id('projects'),
    changeSetId: v.optional(v.id('changeSets')),
    changeSet: v.optional(v.any()),
    runId: v.optional(v.id('sdkRuns')),
    conversationId: v.optional(v.id('agentConversations')),
  },
  handler: async (ctx, args) => {
    const changeSet =
      args.changeSet ??
      (args.changeSetId ? await ctx.runQuery(api.changeSets.get, { id: args.changeSetId }) : null);
    if (!changeSet) throw new Error('ChangeSet not found for review');

    const { parsed } = await runJsonCompletion({
      ctx,
      systemPrompt: FULL_PROMPTS.CHANGESET_REVIEW_SYSTEM,
      userContent: JSON.stringify({ projectId: args.projectId, changeSet }),
      model: 'gpt-4o-mini',
      temperature: 0.1,
      maxTokens: 1600,
      projectId: args.projectId,
      conversationId: args.conversationId as any,
      runId: args.runId as any,
      traceMeta: {
        source: 'sdk',
        toolId: 'changeset.review',
      },
    });

    assertAsciiKeys(parsed);
    const validated = validateSdkOutput('changeset.review', parsed);
    if (!validated.ok) {
      throw new Error('changeset.review failed schema validation');
    }
    const review = validated.data as any;
    const errors = Array.isArray(review.errors) ? review.errors : [];
    const warnings = Array.isArray(review.warnings) ? review.warnings : [];
    const issues = Array.isArray(review.issues)
      ? review.issues
      : [...errors, ...warnings];
    const isValid =
      typeof review.isValid === 'boolean'
        ? review.isValid
        : errors.length === 0;

    return {
      ...review,
      issues,
      isValid,
    };
  },
});

export const apply = action({
  args: {
    runId: v.id('sdkRuns'),
    approvalToken: v.string(),
  },
  handler: async (ctx, args) => {
    const run = await ctx.runQuery(internal.sdk.queries.getRun, {
      runId: args.runId,
    });
    if (!run) throw new Error('Run not found');
    if (run.shadowMode) throw new Error('Shadow runs cannot apply ChangeSets');
    if (!run.pendingChangeSetId) throw new Error('No pending ChangeSet');
    if (!run.approvalToken || run.approvalToken !== args.approvalToken) {
      throw new Error('Invalid approval token');
    }
    await ctx.runMutation(api.changeSets.applyChangeSet, {
      changeSetId: run.pendingChangeSetId,
    });
    await ctx.runMutation(internal.sdk.telemetry.clearPendingChangeSet, {
      runId: args.runId,
    });
    await ctx.runMutation(internal.sdk.telemetry.updateRunState, {
      runId: args.runId,
      status: 'running',
    });
    return { ok: true, applied: run.pendingChangeSetId };
  },
});
