import { action } from '../_generated/server';
import { v } from 'convex/values';
import { api, internal } from '../_generated/api';
import { FULL_PROMPTS } from './prompts';
import { runJsonCompletion } from './llm';
import { assertAsciiKeys, validateSdkOutput } from './schemas';

export const compile = action({
  args: {
    projectId: v.id('projects'),
    intents: v.array(v.any()),
    context: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const context =
      args.context ??
      (await ctx.runQuery(api.sdk.context.get, {
        projectId: args.projectId,
        packs: ['project', 'elements', 'tasks', 'accounting', 'quote', 'runbook', 'knowledge', 'pricing', 'qa', 'vendors', 'receipts'],
      }));

    const payload = {
      projectId: args.projectId,
      context,
      intents: args.intents,
    };

    const { parsed } = await runJsonCompletion({
      systemPrompt: FULL_PROMPTS.CHANGESET_COMPILE_SYSTEM,
      userContent: JSON.stringify(payload),
      model: 'gpt-4o-mini',
      temperature: 0.1,
      maxTokens: 2000,
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

    const changeSetId = await ctx.runMutation(api.changeSets.createChangeSet, {
      projectId: args.projectId,
      stage: 'BREAKDOWN',
      ops: mappedOps,
      createdBy: { source: 'sdk', tool: 'changeset.compile' },
    });

    return {
      changeSetId,
      changeSet,
      meta: (validated.data as any).meta,
    };
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
  },
  handler: async (ctx, args) => {
    const changeSet =
      args.changeSet ??
      (args.changeSetId ? await ctx.runQuery(api.changeSets.get, { id: args.changeSetId }) : null);
    if (!changeSet) throw new Error('ChangeSet not found for review');

    const { parsed } = await runJsonCompletion({
      systemPrompt: FULL_PROMPTS.CHANGESET_REVIEW_SYSTEM,
      userContent: JSON.stringify({ projectId: args.projectId, changeSet }),
      model: 'gpt-4o-mini',
      temperature: 0.1,
      maxTokens: 1600,
    });

    assertAsciiKeys(parsed);
    const validated = validateSdkOutput('changeset.review', parsed);
    if (!validated.ok) {
      throw new Error('changeset.review failed schema validation');
    }
    return validated.data;
  },
});

export const apply = action({
  args: {
    runId: v.id('sdkRuns'),
    approvalToken: v.string(),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
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
