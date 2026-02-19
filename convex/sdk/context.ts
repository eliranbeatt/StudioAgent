// convex/sdk/context.ts
import { query, mutation } from '../_generated/server';
import { v } from 'convex/values';

export const get = query({
  args: {
    projectId: v.id('projects'),
    packs: v.array(v.string()), // e.g. ["project", "elements", "tasks"]
    filters: v.optional(v.any()),
    compatMode: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const res: any = {};
    const packs = new Set(args.packs);
    const envCompatRaw = (globalThis as any)?.process?.env?.SDK_CONTEXT_COMPAT_MODE;
    const envCompatMode = envCompatRaw == null
      ? true
      : !['0', 'false', 'off', 'no'].includes(String(envCompatRaw).trim().toLowerCase());
    const compatMode = args.compatMode ?? envCompatMode;

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
          location: p.details?.location,
          notes: p.notes,
          description: p.description,
          summary: p.summary,
          brainDumpRaw: p.brainDumpRaw,
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
        _entityType: 'task' as const,
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
        _entityType: 'materialLine' as const,
        id: line._id,
        taskId: line.taskId,
        elementId: line.elementId,
        title: line.itemName,
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
        ...(compatMode
          ? {
              plannedQuantityDays: line.plannedQuantity,
              plannedDayRate: line.plannedUnitCost,
            }
          : {}),
        _entityType: 'workLine' as const,
        id: line._id,
        taskId: line.taskId,
        elementId: line.elementId,
        sectionKey: line.sectionKey,
        workType: line.workType,
        title: line.roleHe,
        hours: line.plannedQuantity,
        rateTypeCode: line.rateTypeCode,
        rateTypeLabelHe: line.rateTypeLabelHe,
        plannedQuantity: line.plannedQuantity,
        plannedUnitCost: line.plannedUnitCost,
        plannedTotalCost: line.plannedTotalCost,
        pricingSourceCode: line.sourceCode,
        confidence: line.confidence,
        assignee: line.assignee,
        assigneeId: line.assigneeId,
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
        // Return the markdown string directly as the knowledge doc
        res.knowledgeDoc = k.contentMd_he;
      }
    }

    if (packs.has('files')) {
      const files = await ctx.db
        .query('projectFiles')
        .withIndex('by_project', (q) => q.eq('projectId', args.projectId))
        .order('desc')
        .collect();
      res.files = files.map((file: any) => ({
        id: file._id,
        fileName: file.fileName,
        contentType: file.contentType,
        size: file.size,
        createdAt: file.createdAt,
        summary: file.summary ?? file.extractedInfo?.summary ?? null,
        topics: Array.isArray(file.extractedInfo?.topics) ? file.extractedInfo.topics : [],
        facts: Array.isArray(file.extractedInfo?.facts) ? file.extractedInfo.facts : [],
        entities: Array.isArray(file.extractedInfo?.entities) ? file.extractedInfo.entities : [],
      }));
    }

    if (packs.has('pricing')) {
      const pricingCatalog = await ctx.db
        .query('catalogPriceRecords')
        .order('desc')
        .take(50);
      const webPriceRuns = await ctx.db
        .query('webPriceRuns')
        .withIndex('by_updatedAt', (q) => q)
        .order('desc')
        .take(30);
      res.pricingCatalog = pricingCatalog;
      res.webPriceRuns = webPriceRuns;
      if (compatMode) {
        // TODO(2026-03-31): remove legacy alias after compatibility window.
        res.pricingLogs = pricingCatalog;
      }
    }

    if (packs.has('qa')) {
      const qaPairs = await ctx.db
        .query('qaPairs')
        .withIndex('by_project', (q) => q.eq('projectId', args.projectId))
        .order('desc')
        .collect();
      res.recentQA = qaPairs.map((qa) => ({
        ...(compatMode
          ? {
              // TODO(2026-03-31): remove legacy aliases after compatibility window.
              questionText: qa.question_he,
              answerText: qa.answerText ?? qa.answer_he,
            }
          : {}),
        elementId: qa.elementId,
        questionHe: qa.question_he,
        questionKey: qa.questionKey,
        answerHe: qa.answerText ?? qa.answer_he,
        status: qa.status,
      }));
    }

    if (packs.has('vendors')) {
      const vendors = await ctx.db
        .query('vendors')
        .order('desc')
        .take(30);
      res.vendors = vendors.map((vendor: any) => ({
        id: vendor._id,
        nameHe: vendor.nameHe,
        name: vendor.name,
        category: vendor.category,
        contactName: vendor.contactName,
        phone: vendor.phone,
        email: vendor.email,
      }));
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

export const getCounts = query({
  args: {
    projectId: v.id('projects'),
  },
  handler: async (ctx, args) => {
    const [tasks, materialLines, workLines, qaPairs] = await Promise.all([
      ctx.db
        .query('tasks')
        .withIndex('by_project', (q) => q.eq('projectId', args.projectId))
        .collect(),
      ctx.db
        .query('materialLines')
        .withIndex('by_project', (q) => q.eq('projectId', args.projectId))
        .collect(),
      ctx.db
        .query('workLines')
        .withIndex('by_project', (q) => q.eq('projectId', args.projectId))
        .collect(),
      ctx.db
        .query('qaPairs')
        .withIndex('by_project', (q) => q.eq('projectId', args.projectId))
        .collect(),
    ]);

    return {
      tasks: tasks.length,
      materialLines: materialLines.length,
      workLines: workLines.length,
      qaPairs: qaPairs.length,
    };
  },
});

// DEPRECATED: brainDumpRaw is no longer written to.
// Single source of truth is memoryDocs(kind='PROJECT_CONTEXT') via CONTEXT_GENERATION skill.
// This mutation is kept as a no-op to avoid breaking callers.
export const addKnowledge = mutation({
  args: {
    projectId: v.id('projects'),
    text: v.string(),
    source: v.string(),
    priority: v.optional(v.number()),
  },
  handler: async (_ctx, _args) => {
    // No-op: brainDumpRaw writes disabled.
    // All knowledge flows through CONTEXT_GENERATION -> PROJECT_CONTEXT memoryDoc.
    return
  },
});
