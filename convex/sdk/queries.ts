// SDK internal queries
import { internalQuery } from '../_generated/server';
import { v } from 'convex/values';

export const getRun = internalQuery({
    args: {
        runId: v.id('sdkRuns'),
    },
    handler: async (ctx, args) => {
        return await ctx.db.get(args.runId);
    },
});
