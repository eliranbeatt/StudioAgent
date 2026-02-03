// convex/sdk/api.ts
// This file contains mutations and queries only (no "use node")
// For Node.js actions, see nodeActions.ts

import { mutation, query } from '../_generated/server';
import { v } from 'convex/values';
import { internal } from '../_generated/api';

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
