import { mutation, query } from "./_generated/server";
import { v } from "convex/values";


export const approveElementDraft = mutation({
  args: {
    elementId: v.id("elements"),
    approvedBy: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const element = await ctx.db.get(args.elementId);
    if (!element) throw new Error("Element not found.");
    if (!element.currentDraftId) throw new Error("No open draft found.");

    const draft = await ctx.db.get(element.currentDraftId);
    if (!draft) throw new Error("Draft not found.");

    // Idempotency: If already approved, return the existing version info.
    if (draft.status === "approved" && draft.baseVersionId) {
      return { ok: true, versionId: draft.baseVersionId };
    }

    if (draft.status !== "open" && draft.status !== "needsReview") {
      throw new Error(`Draft is not in a strictly open state (current status: ${draft.status}).`);
    }

    const latestVersion = await ctx.db
      .query("elementVersions")
      .withIndex("by_element", (q) => q.eq("elementId", args.elementId))
      .order("desc")
      .first();

    const now = Date.now();
    const versionNumber = latestVersion ? latestVersion.versionNumber + 1 : 1;
    const snapshot = draft.workingSnapshot ?? {};

    const versionId = await ctx.db.insert("elementVersions", {
      elementId: args.elementId,
      projectId: element.projectId,
      versionNumber,
      status: "approved",
      tags: element.tags ?? [],
      summary: `Approved from draft ${draft._id}`,
      snapshot,
      schemaVersion: draft.schemaVersion ?? 1,
      approvedBy: args.approvedBy,
      approvedAt: now,
      createdAt: now,
    });

    await ctx.db.patch(args.elementId, {
      currentApprovedVersionId: versionId,
      status: "approvedForQuote",
      updatedAt: now,
    });

    await ctx.db.patch(draft._id, {
      status: "approved",
      baseVersionId: versionId,
      updatedAt: now,
    });

    return { ok: true, versionId };
  },
});

export const listByProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const elements = await ctx.db
      .query("elements")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .order("desc")
      .collect();

    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();

    const lines = await ctx.db
      .query("accountingLines")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();

    const printParts = await ctx.db
      .query("printParts")
      .filter((q) => q.eq(q.field("projectId"), args.projectId))
      .collect();

    const tasksByElement = new Map<string, number>();
    for (const task of tasks) {
      if (!task.elementId) continue;
      tasksByElement.set(task.elementId, (tasksByElement.get(task.elementId) ?? 0) + 1);
    }

    const totalsByElement = new Map<string, { materials: number; labor: number; total: number }>();
    for (const line of lines) {
      if (!line.elementId) continue;
      const entry = totalsByElement.get(line.elementId) ?? { materials: 0, labor: 0, total: 0 };
      if (line.type === "material") entry.materials += line.total;
      if (line.type === "labor") entry.labor += line.total;
      entry.total += line.total;
      totalsByElement.set(line.elementId, entry);
    }

    const printCounts = new Map<string, number>();
    for (const part of printParts) {
      printCounts.set(part.elementId, (printCounts.get(part.elementId) ?? 0) + 1);
    }

    const draftMeta = new Map<string, { id: string; status: string; revisionNumber: number; updatedAt: number }>();
    const approvedMeta = new Map<string, { id: string; versionNumber: number; approvedAt?: number }>();

    for (const element of elements) {
      if (element.currentDraftId) {
        const draft = await ctx.db.get(element.currentDraftId);
        if (draft) {
          draftMeta.set(element._id, {
            id: draft._id,
            status: draft.status,
            revisionNumber: draft.revisionNumber,
            updatedAt: draft.updatedAt,
          });
        }
      }
      if (element.currentApprovedVersionId) {
        const version = await ctx.db.get(element.currentApprovedVersionId);
        if (version) {
          approvedMeta.set(element._id, {
            id: version._id,
            versionNumber: version.versionNumber,
            approvedAt: version.approvedAt,
          });
        }
      }
    }

    return {
      elements: elements.map((element) => ({
        id: element._id,
        title: element.title,
        type: element.type,
        status: element.status,
        rev: element.rev ?? 0,
        tags: element.tags ?? [],
        updatedAt: element.updatedAt,
        taskCount: tasksByElement.get(element._id) ?? 0,
        budget: totalsByElement.get(element._id) ?? { materials: 0, labor: 0, total: 0 },
        printPartsCount: printCounts.get(element._id) ?? 0,
        draft: draftMeta.get(element._id) ?? null,
        approved: approvedMeta.get(element._id) ?? null,
      })),
    };
  },
});

export const getComposite = query({
  args: {
    projectId: v.id("projects"),
    elementId: v.id("elements"),
    preferDraft: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const element = await ctx.db.get(args.elementId);
    if (!element || element.projectId !== args.projectId) return null;

    const draft = element.currentDraftId ? await ctx.db.get(element.currentDraftId) : null;
    const approved = element.currentApprovedVersionId
      ? await ctx.db.get(element.currentApprovedVersionId)
      : null;

    const preferDraft = args.preferDraft ?? true;
    const baseSource = preferDraft && draft ? "draft" : approved ? "approved" : draft ? "draft" : null;
    const baseSpec =
      baseSource === "draft"
        ? draft?.workingSnapshot ?? {}
        : baseSource === "approved"
          ? approved?.snapshot ?? {}
          : {};

    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_element", (q) => q.eq("elementId", args.elementId))
      .collect();

    const lines = await ctx.db
      .query("accountingLines")
      .withIndex("by_element", (q) => q.eq("elementId", args.elementId))
      .collect();

    const printParts = await ctx.db
      .query("printParts")
      .withIndex("by_element", (q) => q.eq("elementId", args.elementId))
      .collect();

    const history = await ctx.db
      .query("elementVersions")
      .withIndex("by_element", (q) => q.eq("elementId", args.elementId))
      .order("desc")
      .collect();

    const totals = lines.reduce(
      (acc, line) => {
        if (line.type === "material") acc.materials += line.total;
        if (line.type === "labor") acc.labor += line.total;
        acc.total += line.total;
        return acc;
      },
      { materials: 0, labor: 0, total: 0 }
    );

    return {
      element: {
        id: element._id,
        title: element.title,
        type: element.type,
        status: element.status,
        rev: element.rev ?? 0,
        tags: element.tags ?? [],
        updatedAt: element.updatedAt,
      },
      base: {
        source: baseSource,
        spec: baseSpec,
        revisionMeta: approved
          ? {
            revisionId: approved._id,
            revisionNumber: approved.versionNumber,
            createdAt: approved.createdAt,
          }
          : null,
        draftMeta: draft
          ? {
            draftId: draft._id,
            revisionNumber: draft.revisionNumber,
            status: draft.status,
            updatedAt: draft.updatedAt,
          }
          : null,
      },
      canon: {
        tasksCount: tasks.length,
        materialsTotal: totals.materials,
        laborTotal: totals.labor,
      },
      links: {
        tasks: tasks.map((task) => ({
          id: task._id,
          title: task.title,
          description: task.description,
          status: task.status,
          priority: task.priority,
          category: task.category,
          startDate: task.startDate,
          endDate: task.endDate,
          estimatedMinutes: task.estimatedMinutes,
          assignee: task.assignee,
          dependencies: task.dependencies ?? [],
        })),
        accounting: {
          lines: lines.map((line) => ({
            id: line._id,
            type: line.type,
            title: line.title,
            qty: line.qty,
            unitCost: line.unitCost,
            total: line.total,
            taskId: line.taskId,
          })),
        },
        printing: {
          printParts: printParts.map((part) => ({
            id: part._id,
            label: part.label,
            qty: part.qty,
            size: part.size,
            substrate: part.substrate,
            requiresProof: part.requiresProof,
          })),
        },
        history: history.map((version) => ({
          id: version._id,
          versionNumber: version.versionNumber,
          status: version.status,
          summary: version.summary,
          approvedAt: version.approvedAt,
          createdAt: version.createdAt,
        })),
      },
    };
  },
});

export const getElementDetail = query({
  args: {
    elementId: v.id("elements"),
  },
  handler: async (ctx, args) => {
    const element = await ctx.db.get(args.elementId);
    if (!element) return null;

    const draft = element.currentDraftId ? await ctx.db.get(element.currentDraftId) : null;
    const approved = element.currentApprovedVersionId
      ? await ctx.db.get(element.currentApprovedVersionId)
      : null;

    return {
      element: {
        id: element._id,
        title: element.title,
        type: element.type,
        status: element.status,
        rev: element.rev ?? 1,
      },
      draft: draft
        ? {
          id: draft._id,
          revisionNumber: draft.revisionNumber,
          snapshot: draft.workingSnapshot ?? {},
        }
        : null,
      approved: approved
        ? {
          id: approved._id,
          versionNumber: approved.versionNumber,
          snapshot: approved.snapshot ?? {},
        }
        : null,
    };
  },
});

export const updateElementMeta = mutation({
  args: {
    elementId: v.id("elements"),
    title: v.optional(v.string()),
    type: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const element = await ctx.db.get(args.elementId);
    if (!element) throw new Error("Element not found.");

    const allowedTypes = new Set([
      "build",
      "rent",
      "print",
      "transport",
      "install",
      "subcontract",
      "mixed",
    ]);

    if (args.type && !allowedTypes.has(args.type)) {
      throw new Error("Invalid element type.");
    }

    const updates: Record<string, any> = { updatedAt: Date.now() };
    if (args.title !== undefined) updates.title = args.title;
    if (args.type !== undefined) updates.type = args.type;
    if (args.tags !== undefined) updates.tags = args.tags;

    await ctx.db.patch(args.elementId, updates);
    return { ok: true };
  },
});

export const deleteElement = mutation({
  args: {
    elementId: v.id("elements"),
  },
  handler: async (ctx, args) => {
    const element = await ctx.db.get(args.elementId);
    if (!element) throw new Error("Element not found.");

    const drafts = await ctx.db
      .query("elementDrafts")
      .withIndex("by_element", (q) => q.eq("elementId", args.elementId))
      .collect();
    for (const draft of drafts) {
      await ctx.db.delete(draft._id);
    }

    const versions = await ctx.db
      .query("elementVersions")
      .withIndex("by_element", (q) => q.eq("elementId", args.elementId))
      .collect();
    for (const version of versions) {
      await ctx.db.delete(version._id);
    }

    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_element", (q) => q.eq("elementId", args.elementId))
      .collect();
    for (const task of tasks) {
      await ctx.db.delete(task._id);
    }

    const lines = await ctx.db
      .query("accountingLines")
      .withIndex("by_element", (q) => q.eq("elementId", args.elementId))
      .collect();
    for (const line of lines) {
      await ctx.db.delete(line._id);
    }

    const parts = await ctx.db
      .query("printParts")
      .withIndex("by_element", (q) => q.eq("elementId", args.elementId))
      .collect();
    for (const part of parts) {
      await ctx.db.delete(part._id);
    }

    await ctx.db.delete(args.elementId);
    return { ok: true };
  },
});
