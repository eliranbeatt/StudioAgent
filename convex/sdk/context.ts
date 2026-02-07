// convex/sdk/context.ts
import { query } from '../_generated/server';
import { v } from 'convex/values';

export const get = query({
  args: {
    projectId: v.id('projects'),
    packs: v.array(v.string()), // e.g. ["project", "elements", "tasks"]
    filters: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const res: any = {};
    const packs = new Set(args.packs);

    if (packs.has('project')) {
      const p = await ctx.db.get(args.projectId);
      if (p) {
        res.project = {
          id: p._id,
          name: p.name,
          stage: p.stage,
          eventDate: p.eventDate,
          details: p.details,
          status: p.status,
          location: p.location,
        };
      }
    }

    if (packs.has('elements')) {
      const elements = await ctx.db
        .query('elements')
        .withIndex('by_project', (q) => q.eq('projectId', args.projectId))
        .collect();
      res.elements = elements.map(e => ({
        id: e._id,
        title: e.title,
        description: e.description,
        status: e.status,
        type: e.type,
        tags: e.tags,
        order: e.order,
        updatedAt: e.updatedAt,
      }));
    }

    if (packs.has('tasks')) {
      const tasks = await ctx.db
        .query('tasks')
        .withIndex('by_project', (q) => q.eq('projectId', args.projectId))
        .collect();
      res.tasks = tasks.map(t => ({
        id: t._id,
        title: t.title,
        description: t.description,
        elementId: t.elementId,
        status: t.status,
        stage: t.stage,
        workType: t.workType,
        workTypeLabelHe: t.workTypeLabelHe,
        estimatedHours: t.estimatedHours,
        checklist: t.checklist,
        accountingLinks: t.accountingLinks,
        dedupKey: t.dedupKey,
      }));
    }

    if (packs.has('accounting') || packs.has('materialLines')) {
      const materialLines = await ctx.db
        .query('materialLines')
        .withIndex('by_project', (q) => q.eq('projectId', args.projectId))
        .collect();
      res.materialLines = materialLines.map((line) => ({
        id: line._id,
        taskId: line.taskId,
        elementId: line.elementId,
        elementScope: line.elementScope,
        sectionKey: line.sectionKey,
        title: line.title,
        quantity: line.quantity,
        uomCode: line.uomCode,
        plannedUnitCost: line.plannedUnitCost,
        plannedTotalCost: line.plannedTotalCost,
        pricingSourceCode: line.pricingSourceCode,
        priceCheckedAt: line.priceCheckedAt,
        confidence: line.confidence,
        dedupKey: line.dedupKey,
        notes: line.notes,
      }));
    }

    if (packs.has('accounting') || packs.has('workLines')) {
      const workLines = await ctx.db
        .query('workLines')
        .withIndex('by_project', (q) => q.eq('projectId', args.projectId))
        .collect();
      res.workLines = workLines.map((line) => ({
        id: line._id,
        taskId: line.taskId,
        elementId: line.elementId,
        elementScope: line.elementScope,
        sectionKey: line.sectionKey,
        workType: line.workType,
        title: line.title,
        hours: line.hours,
        plannedUnitCost: line.plannedUnitCost,
        plannedTotalCost: line.plannedTotalCost,
        pricingSourceCode: line.pricingSourceCode,
        confidence: line.confidence,
        dedupKey: line.dedupKey,
        notes: line.notes,
      }));
    }

    if (packs.has('quote')) {
      const quote = await ctx.db
        .query('quoteVersions')
        .withIndex('by_project', (q) => q.eq('projectId', args.projectId))
        .order('desc')
        .first();
      res.quote = quote
        ? {
            id: quote._id,
            titleHe: quote.title_he,
            quoteTextHe: quote.quoteText_he,
            quoteBlocks: quote.quoteBlocks,
            createdAt: quote.createdAt,
          }
        : null;
    }

    if (packs.has('runbook')) {
      const runbooks = await ctx.db
        .query('runbooks')
        .withIndex('by_project', (q) => q.eq('projectId', args.projectId))
        .collect();
      res.runbooks = runbooks;
      const runbookIds = runbooks.map((r) => r._id);
      const runbookItems = await Promise.all(
        runbookIds.map((runbookId) =>
          ctx.db
            .query('runbookItems')
            .withIndex('by_runbook', (q) => q.eq('runbookId', runbookId))
            .collect()
        )
      );
      res.runbookItems = runbookItems.flat();
      const runbookListItems = await Promise.all(
        runbookIds.map((runbookId) =>
          ctx.db
            .query('runbookListItems')
            .withIndex('by_runbook', (q) => q.eq('runbookId', runbookId))
            .collect()
        )
      );
      res.runbookListItems = runbookListItems.flat();
    }

    if (packs.has('knowledge')) {
       const k = await ctx.db
        .query('memoryDocs')
        .withIndex('by_project_kind', (q) => 
          q.eq('projectId', args.projectId).eq('kind', 'PROJECT_CONTEXT')
        )
        .first();
       if (k && k.contentMd_he) {
         try {
           res.knowledgeDoc = JSON.parse(k.contentMd_he);
         } catch {
           res.knowledgeDoc = { raw: k.contentMd_he };
         }
       }
    }

    if (packs.has('pricing')) {
      const pricingCatalog = await ctx.db
        .query('catalogPriceRecords')
        .order('desc')
        .take(200);
      res.pricingCatalog = pricingCatalog;
      res.pricingLogs = pricingCatalog;
    }

    if (packs.has('qa')) {
      const qaPairs = await ctx.db
        .query('qaPairs')
        .withIndex('by_project', (q) => q.eq('projectId', args.projectId))
        .order('desc')
        .take(50);
      res.recentQA = qaPairs.map((qa) => ({
        id: qa._id,
        projectId: qa.projectId,
        elementId: qa.elementId,
        questionHe: qa.question_he,
        questionText: qa.question_he,
        questionKey: qa.questionKey,
        answerHe: qa.answerText ?? qa.answer_he,
        answerText: qa.answerText ?? qa.answer_he,
        status: qa.status,
        questionType: qa.questionType,
        options: qa.options,
        answer: qa.answer,
        scopeType: qa.scopeType,
        scopeKey: qa.scopeKey,
        sectionPath: qa.sectionPath,
        blockingLevel: qa.blockingLevel,
        orderKey: qa.orderKey,
        createdFrom: qa.createdFrom,
        followUp: qa.followUp,
        triggeredBy: qa.triggeredBy,
        dedupeKey: qa.dedupeKey,
        version: qa.version,
        source: qa.source,
        createdAt: qa.createdAt,
      }));
    }

    if (packs.has('vendors')) {
      const vendors = await ctx.db
        .query('vendors')
        .order('desc')
        .take(200);
      res.vendors = vendors;
    }

    if (packs.has('receipts')) {
      const receipts = await ctx.db
        .query('receipts')
        .withIndex('by_project', (q) => q.eq('projectId', args.projectId))
        .order('desc')
        .take(50);
      res.receipts = receipts;
      const receiptIds = receipts.map((r) => r._id);
      const items = await Promise.all(
        receiptIds.map((receiptId) =>
          ctx.db
            .query('receiptItems')
            .withIndex('by_receipt', (q) => q.eq('receiptId', receiptId))
            .collect()
        )
      );
      res.receiptItems = items.flat();
    }

    return res;
  },
});
