"use node";

import { action } from '../_generated/server';
import { v } from 'convex/values';
import { internal } from '../_generated/api';
import { FULL_PROMPTS } from './prompts';
import { runJsonCompletion } from './llm';
import { assertAsciiKeys, validateSdkOutput } from './schemas';

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
    const payload = {
      currentDoc: args.currentDoc ?? null,
      newFacts: args.newFacts,
      userText: args.userText ?? null,
    };

    const { parsed } = await runJsonCompletion({
      ctx,
      systemPrompt: FULL_PROMPTS.KNOWLEDGE_UPDATE_SYSTEM,
      userContent: JSON.stringify(payload),
      model: 'gpt-4o-mini',
      temperature: 0.2,
      maxTokens: 1600,
      projectId: args.projectId,
      conversationId: args.conversationId as any,
      runId: args.runId as any,
      traceMeta: {
        source: 'sdk',
        toolId: 'knowledge.summarize_or_update',
      },
    });

    assertAsciiKeys(parsed);
    const validated = validateSdkOutput('knowledge.summarize_or_update', parsed);
    if (!validated.ok) {
      throw new Error('knowledge.summarize_or_update failed schema validation');
    }

    const doc = (validated.data as any).doc ?? parsed.doc ?? parsed;

    // Call the mutation in the separate knowledgeMutations file
    await ctx.runMutation(internal.sdk.knowledgeMutations.saveKnowledgeDoc, {
      projectId: args.projectId,
      doc,
    });

    return {
      doc,
      meta: (validated.data as any).meta ?? { didUpdate: true },
    };
  },
});
