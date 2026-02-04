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

export const getLatestReviewForRun = internalQuery({
    args: {
        runId: v.id('sdkRuns'),
        changeSetId: v.optional(v.id('changeSets')),
    },
    handler: async (ctx, args) => {
        const events = await ctx.db
            .query('sdkRunEvents')
            .withIndex('by_run_type', (q) => q.eq('runId', args.runId).eq('type', 'changeset_review'))
            .order('desc')
            .take(20);

        if (!args.changeSetId) return events[0] ?? null;
        return events.find((e: any) => e.payload?.changeSetId === args.changeSetId) ?? null;
    },
});

export const getLatestAuditForRun = internalQuery({
    args: {
        runId: v.id('sdkRuns'),
    },
    handler: async (ctx, args) => {
        const events = await ctx.db
            .query('sdkRunEvents')
            .withIndex('by_run_type', (q) => q.eq('runId', args.runId).eq('type', 'audit_snapshot'))
            .order('desc')
            .take(20);

        return events[0] ?? null;
    },
});
