"use node";

import { action, internalMutation } from '../_generated/server';
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
  },
  handler: async (ctx, args) => {
    const payload = {
      currentDoc: args.currentDoc ?? null,
      newFacts: args.newFacts,
      userText: args.userText ?? null,
    };

    const { parsed } = await runJsonCompletion({
      systemPrompt: FULL_PROMPTS.KNOWLEDGE_UPDATE_SYSTEM,
      userContent: JSON.stringify(payload),
      model: 'gpt-4o-mini',
      temperature: 0.2,
      maxTokens: 1600,
    });

    assertAsciiKeys(parsed);
    const validated = validateSdkOutput('knowledge.summarize_or_update', parsed);
    if (!validated.ok) {
      throw new Error('knowledge.summarize_or_update failed schema validation');
    }

    const doc = (validated.data as any).doc ?? parsed.doc ?? parsed;

    await ctx.runMutation(internal.sdk.knowledge.saveKnowledgeDoc, {
      projectId: args.projectId,
      doc,
    });

    return {
      doc,
      meta: (validated.data as any).meta ?? { didUpdate: true },
    };
  },
});

export const saveKnowledgeDoc = internalMutation({
  args: {
    projectId: v.id('projects'),
    doc: v.any(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('memoryDocs')
      .withIndex('by_project_kind', (q) =>
        q.eq('projectId', args.projectId).eq('kind', 'PROJECT_CONTEXT')
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        contentMd_he: JSON.stringify(args.doc),
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.insert('memoryDocs', {
        projectId: args.projectId,
        kind: 'PROJECT_CONTEXT',
        title_he: args.doc.titleHe ?? 'מסמך ידע פרויקט',
        contentMd_he: JSON.stringify(args.doc),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }
  },
});
