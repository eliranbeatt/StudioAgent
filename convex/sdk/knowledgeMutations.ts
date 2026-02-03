// Internal mutations for SDK knowledge module
// Split from knowledge.ts because mutations cannot use "use node"

import { internalMutation } from '../_generated/server';
import { v } from 'convex/values';

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
