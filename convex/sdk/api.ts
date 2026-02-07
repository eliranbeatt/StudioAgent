// convex/sdk/api.ts
// This file contains mutations and queries only (no "use node")
// For Node.js actions, see nodeActions.ts

import { action, mutation, query } from '../_generated/server';
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
      },
    })

    const answerText = JSON.stringify({
      stageKey,
      answersById: args.answersById,
      freeText: args.freeText,
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
