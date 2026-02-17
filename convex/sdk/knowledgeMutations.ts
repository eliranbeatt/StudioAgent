// Internal mutations for SDK knowledge module
// Single source of truth: PROJECT_CONTEXT memoryDoc stores Hebrew markdown.

import { internalMutation } from '../_generated/server';
import { v } from 'convex/values';

export const saveKnowledgeDoc = internalMutation({
    args: {
        projectId: v.id('projects'),
        doc: v.any(),
    },
    handler: async (ctx, args) => {
        // doc can be a string (markdown) or an object (legacy JSON).
        // Always store as string in contentMd_he.
        const content = typeof args.doc === 'string'
            ? args.doc
            : JSON.stringify(args.doc);

        const existing = await ctx.db
            .query('memoryDocs')
            .withIndex('by_project_kind', (q) =>
                q.eq('projectId', args.projectId).eq('kind', 'PROJECT_CONTEXT')
            )
            .first();

        if (existing) {
            await ctx.db.patch(existing._id, {
                contentMd_he: content,
                updatedAt: Date.now(),
            });
        } else {
            await ctx.db.insert('memoryDocs', {
                projectId: args.projectId,
                kind: 'PROJECT_CONTEXT',
                title_he: 'מסמך ידע פרויקט',
                contentMd_he: content,
                createdAt: Date.now(),
                updatedAt: Date.now(),
            });
        }
    },
});
