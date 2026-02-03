// convex/sdk/telemetry.ts
import { internalMutation, internalQuery, query } from '../_generated/server';
import { v } from 'convex/values';

// Handles all DB writes for the SDK Agent system

export const createRun = internalMutation({
  args: {
    projectId: v.id('projects'),
    conversationId: v.id('agentConversations'),
    engine: v.string(), // "sdk"
    currentAgent: v.optional(v.string()),
    shadowMode: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert('sdkRuns', {
      projectId: args.projectId,
      conversationId: args.conversationId,
      status: 'running',
      engine: 'sdk',
      currentAgentName: args.currentAgent || 'orchestrator',
      stageKey: 'intake',
      shadowMode: args.shadowMode ?? false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

export const updateRunState = internalMutation({
  args: {
    runId: v.id('sdkRuns'),
    status: v.optional(v.union(
      v.literal("running"),
      v.literal("paused"),
      v.literal("blocked"),
      v.literal("awaiting_approval"),
      v.literal("completed"),
      v.literal("failed"),
      v.literal("cancelled")
    )),
    currentAgentName: v.optional(v.string()),
    stageKey: v.optional(v.string()),
    pendingChangeSetId: v.optional(v.id('changeSets')),
    approvalToken: v.optional(v.string()),
    lastError: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const patch: any = { updatedAt: Date.now() };
    if (args.status) patch.status = args.status;
    if (args.currentAgentName) patch.currentAgentName = args.currentAgentName;
    if (args.stageKey) patch.stageKey = args.stageKey;
    if (args.pendingChangeSetId !== undefined) patch.pendingChangeSetId = args.pendingChangeSetId;
    if (args.approvalToken !== undefined) patch.approvalToken = args.approvalToken;
    if (args.lastError !== undefined) patch.lastError = args.lastError;
    
    await ctx.db.patch(args.runId, patch);
  },
});

export const clearPendingChangeSet = internalMutation({
  args: { runId: v.id('sdkRuns') },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.runId, {
      pendingChangeSetId: undefined,
      approvalToken: undefined,
      updatedAt: Date.now(),
    });
  },
});

export const appendMessage = internalMutation({
  args: {
    conversationId: v.id('agentConversations'),
    role: v.union(v.literal('user'), v.literal('assistant'), v.literal('system')),
    text: v.optional(v.string()),
    blocks: v.optional(v.array(v.any())),
    runId: v.optional(v.id('sdkRuns')),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert('agentMessages', {
      conversationId: args.conversationId,
      role: args.role,
      text: args.text,
      blocks: args.blocks,
      runId: args.runId,
      createdAt: Date.now(),
    });
  },
});

export const getRunMessages = query({
  args: {
    conversationId: v.id('agentConversations'),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit || 50;
    // Get latest messages
    const messages = await ctx.db
      .query('agentMessages')
      .withIndex('by_conversation', (q) => q.eq('conversationId', args.conversationId))
      .order('desc')
      .take(limit);
    
    // Reverse to chronological order
    return messages.reverse();
  },
});

export const logEvent = internalMutation({
  args: {
    runId: v.id('sdkRuns'),
    type: v.string(),
    payload: v.any(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert('sdkRunEvents', {
      runId: args.runId,
      type: args.type,
      payload: args.payload,
      createdAt: Date.now(),
    });
  },
});
