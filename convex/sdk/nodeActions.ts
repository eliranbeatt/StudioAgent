"use node";

// Node.js actions that require the Node.js runtime
// These are split out from api.ts because only actions can use "use node"

import { action } from '../_generated/server';
import { v } from 'convex/values';
import { api, internal } from '../_generated/api';

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
        await ctx.runMutation(internal.sdk.telemetry.updateRunState, {
            runId: args.runId,
            status: 'running',
            currentAgentName: run.currentAgentName ?? 'orchestrator',
        });
        await ctx.runMutation(internal.sdk.telemetry.clearPendingChangeSet, {
            runId: args.runId,
        });
        await ctx.runMutation(api.changeSets.applyChangeSet, {
            changeSetId: run.pendingChangeSetId,
        });
        return { ok: true, applied: run.pendingChangeSetId };
    },
});
