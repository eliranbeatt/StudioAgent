"use node";

import { action } from '../_generated/server';
import { v } from 'convex/values';
import { api, internal } from '../_generated/api';
import { FULL_PROMPTS } from './prompts';
import { completionWithTracing } from '../lib/llm';

/**
 * Single source of truth knowledge updater.
 * Produces a Hebrew markdown document stored as memoryDocs(kind='PROJECT_CONTEXT').
 * All other knowledge/memory update paths are disabled — this is the ONLY writer.
 */
export const summarizeOrUpdate = action({
  args: {
    projectId: v.id('projects'),
    currentDoc: v.optional(v.any()),
    newFacts: v.array(v.string()),
    userText: v.optional(v.string()),
    runId: v.optional(v.id('sdkRuns')),
    conversationId: v.optional(v.id('agentConversations')),
  },
  handler: async (ctx, args) => {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('Missing OPENAI_API_KEY')
    }

    // Load whatever the current PROJECT_CONTEXT doc is (markdown string)
    const existingDoc = await ctx.runQuery(api.memory.getProjectContextDoc, {
      projectId: args.projectId,
    })
    const currentMarkdown = existingDoc?.contentMd_he ?? ''

    // Also load a lightweight project snapshot for grounding
    const projectCtx = await ctx.runQuery(api.sdk.api.contextGet, {
      projectId: args.projectId,
      packs: ['project', 'elements', 'tasks', 'qa'],
    })

    const userPayload = [
      '--- CURRENT KNOWLEDGE DOCUMENT ---',
      currentMarkdown || '(ריק — אין מסמך קיים)',
      '',
      '--- NEW FACTS ---',
      ...(args.newFacts.length > 0 ? args.newFacts : ['(אין עובדות חדשות)']),
      '',
      args.userText ? `--- USER TEXT ---\n${args.userText}` : '',
      '',
      '--- PROJECT SNAPSHOT (grounding) ---',
      `Project: ${projectCtx?.project?.name ?? ''}`,
      `Elements: ${Array.isArray(projectCtx?.elements) ? projectCtx.elements.length : 0}`,
      `Tasks: ${Array.isArray(projectCtx?.tasks) ? projectCtx.tasks.length : 0}`,
      Array.isArray(projectCtx?.elements) && projectCtx.elements.length > 0
        ? `Element titles: ${projectCtx.elements.map((e: any) => e.title).join(', ')}`
        : '',
      Array.isArray(projectCtx?.recentQA) && projectCtx.recentQA.length > 0
        ? `Recent QA:\n${projectCtx.recentQA.slice(0, 10).map((qa: any) => `Q: ${qa.questionHe ?? qa.questionText}\nA: ${qa.answerHe ?? qa.answerText}`).join('\n')}`
        : '',
    ].filter(Boolean).join('\n')

    const response = await completionWithTracing(
      ctx,
      {
        model: 'gpt-5-mini',
        messages: [
          { role: 'system', content: FULL_PROMPTS.KNOWLEDGE_UPDATE_SYSTEM },
          { role: 'user', content: userPayload },
        ],
        traceMeta: {
          source: 'sdk',
          toolId: 'knowledge.summarize_or_update',
        },
      },
      {
        projectId: args.projectId as any,
        conversationId: args.conversationId as any,
        runId: args.runId,
      }
    ) as any

    const content = response?.choices?.[0]?.message?.content ?? ''
    if (!content.trim()) {
      throw new Error('Empty response from LLM for knowledge update')
    }

    // Save the markdown directly as PROJECT_CONTEXT
    await ctx.runMutation(internal.sdk.knowledgeMutations.saveKnowledgeDoc, {
      projectId: args.projectId,
      doc: content.trim(),
    })

    return {
      doc: content.trim(),
      meta: { didUpdate: true },
    }
  },
});
