// SDK internal queries
import { internalQuery, query } from '../_generated/server';
import { v } from 'convex/values';

export const getRun = internalQuery({
    args: {
        runId: v.id('sdkRuns'),
    },
    handler: async (ctx, args) => {
        return await ctx.db.get(args.runId);
    },
});

export const debugProjectContext = query({
    args: { projectId: v.id('projects') },
    handler: async (ctx, args) => {
        const memoryDoc = await ctx.db
            .query('memoryDocs')
            .withIndex('by_project_kind', (q) =>
                q.eq('projectId', args.projectId).eq('kind', 'PROJECT_CONTEXT')
            )
            .first();
        
        const runs = await ctx.db
            .query('sdkRuns')
            .withIndex('by_project', (q) => q.eq('projectId', args.projectId))
            .order('desc')
            .take(5);
        
        const events = await Promise.all(
            runs.map(run => 
                ctx.db.query('sdkRunEvents')
                    .withIndex('by_run', q => q.eq('runId', run._id))
                    .take(30)
            )
        );
        
        const conversations = await ctx.db
            .query('agentConversations')
            .withIndex('by_project', (q) => q.eq('projectId', args.projectId))
            .order('desc')
            .take(5);
        
        const messages = await Promise.all(
            conversations.map(conv =>
                ctx.db.query('agentMessages')
                    .withIndex('by_conversation', q => q.eq('conversationId', conv._id))
                    .order('desc')
                    .take(10)
            )
        );
        
        const allMessages = messages.flat();
        const hasKeywords = allMessages.some(msg => {
            const text = String(msg?.text ?? '').toLowerCase();
            return /(?:החלט|נחליט|סיכום|budget|תקציב|deadline|דדליין|materials|חומרים|element|אלמנט|task|משימה)/.test(text);
        });
        
        return {
            hasMemoryDoc: !!memoryDoc,
            memoryDoc: memoryDoc ? {
                id: memoryDoc._id,
                kind: memoryDoc.kind,
                schemaVersion: memoryDoc.schemaVersion,
                updatedAt: memoryDoc.updatedAt,
                createdAt: memoryDoc.createdAt,
                contentPreview: memoryDoc.contentMd_he?.slice(0, 300),
                contentLength: memoryDoc.contentMd_he?.length ?? 0
            } : null,
            recentRuns: runs.map(r => ({
                id: r._id,
                runMode: r.runMode,
                status: r.status,
                stageKey: r.stageKey,
                engine: r.engine,
                createdAt: r.createdAt,
                currentAgentName: r.currentAgentName
            })),
            eventSummary: {
                total: events.flat().length,
                byType: events.flat().reduce((acc: any, e) => {
                    acc[e.type] = (acc[e.type] || 0) + 1;
                    return acc;
                }, {}),
                hasPlanningEvents: events.flat().some(e => 
                    e.type.includes('draft') || 
                    e.type.includes('plan') ||
                    e.type === 'sdk_vnext_pipeline'
                ),
                hasKnowledgeEvents: events.flat().some(e =>
                    e.type.includes('knowledge') ||
                    e.type === 'stream_knowledge_update_completed'
                )
            },
            messageSummary: {
                totalMessages: allMessages.length,
                hasKeywords,
                sampleTexts: allMessages.slice(0, 3).map(m => ({
                    role: m.role,
                    text: String(m.text ?? '').slice(0, 100),
                    hasBlocks: Array.isArray(m.blocks) && m.blocks.length > 0
                }))
            },
            diagnosis: !memoryDoc 
                ? (hasKeywords 
                    ? 'Context doc missing despite keywords present - check if upsertPlanAndSeed was called'
                    : 'No context doc and no durable keywords in chat - this is expected behavior')
                : 'Context doc exists'
        };
    }
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
