import { action } from '../_generated/server';
import { v } from 'convex/values';
import { api, internal } from '../_generated/api';

export const evaluate = action({
  args: {
    projectId: v.id('projects'),
    runId: v.id('sdkRuns'),
  },
  handler: async (ctx, args) => {
    const context = await ctx.runQuery(api['sdk/context'].get, {
      projectId: args.projectId,
      packs: ['elements', 'tasks', 'accounting'],
    });

    const summary = {
      elements: context.elements?.length ?? 0,
      tasks: context.tasks?.length ?? 0,
      materialLines: context.materialLines?.length ?? 0,
      workLines: context.workLines?.length ?? 0,
      missingPrices:
        (context.materialLines ?? []).filter((line: any) => !line.plannedUnitCost).length +
        (context.workLines ?? []).filter((line: any) => !line.plannedUnitCost).length,
    };

    await ctx.runMutation(internal.sdk.telemetry.logEvent, {
      runId: args.runId,
      type: 'shadow_eval',
      payload: summary,
    });

    return summary;
  },
});
