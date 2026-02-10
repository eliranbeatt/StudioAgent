"use node";

import { action } from '../_generated/server';
import { v } from 'convex/values';
import { api, internal } from '../_generated/api';
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
    const context =
      args.context ??
      (await ctx.runQuery(api['sdk/api'].contextGet, {
        projectId: args.projectId,
        packs: ['project', 'elements', 'tasks', 'accounting', 'quote', 'runbook', 'knowledge', 'pricing', 'qa', 'vendors', 'receipts'],
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
          maxTokens: attempt.maxTokens,
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

function mapCompileOp(op: any) {
  if (!op || !op.entity || !op.op) return null;
  const entity = String(op.entity);
  const action = String(op.op);
  const tempId = op.tempId ?? undefined;

  if (action === 'create') {
    if (entity === 'element') {
      return { kind: 'element.create', payload: { tempId, element: op.create ?? {} } };
    }
    if (entity === 'task') {
      return {
        kind: 'task.create',
        payload: {
          tempId,
          elementTempOrId: op.create?.elementTempOrId ?? op.create?.elementId,
          elementId: op.create?.elementId,
          fields: op.create ?? {},
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
      return {
        kind: 'workLine.create',
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
    return { kind: `${entity}.create`, payload: op.create ?? {} };
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
      return {
        kind: 'task.patch',
        payload: {
          taskId: op.id ?? undefined,
          taskTempOrId: op.id ?? op.tempId ?? undefined,
          fields: op.patch ?? {},
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
      return {
        kind: 'workLine.patch',
        payload: {
          lineId: op.id ?? undefined,
          workLineId: op.id ?? undefined,
          tempId: op.tempId ?? undefined,
          fields: op.patch ?? {},
        },
      };
    }
    return { kind: `${entity}.patch`, payload: op.patch ?? {} };
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
    return { kind: `${entity}.delete`, payload: { id: deleteId } };
  }

  return null;
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
