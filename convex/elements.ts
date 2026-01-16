import { mutation, query, internalMutation } from './_generated/server'
import { v } from 'convex/values'
import { api, internal } from './_generated/api'
import { withDefaultStartDate } from './lib/dates'
import { Id } from './_generated/dataModel'

// Helper to sync snapshot data to live tables
export async function syncSnapshotToLiveTables(ctx: any, elementId: any, snapshot: any) {
  const projectId = (await ctx.db.get(elementId)).projectId;
  const now = Date.now();

  // --- Fetch Live Data First ---
  const existingTasks = await ctx.db
    .query("tasks")
    .withIndex("by_element", (q: any) => q.eq("elementId", elementId))
    .collect();

  const existingMaterialLines = await ctx.db
    .query("materialLines")
    .withIndex("by_element", (q: any) => q.eq("elementId", elementId))
    .collect();

  const existingWorkLines = await ctx.db
    .query("workLines")
    .withIndex("by_element", (q: any) => q.eq("elementId", elementId))
    .collect();

  const existingParts = await ctx.db
    .query("printParts")
    .withIndex("by_element", (q: any) => q.eq("elementId", elementId))
    .collect();

  // --- 1. Tasks Sync ---
  const existingTaskMap = new Map(existingTasks.map((t: any) => [t._id, t]));
  const activeTaskIds = new Set<string>();

  const snapshotTasksMap = snapshot.tasks?.byId ?? {};

  for (const [key, taskData] of Object.entries<any>(snapshotTasksMap)) {
    if (taskData.deletedAt) continue; // Skip deleted items

    let taskId = taskData.id;
    let existing = null;
    if (taskId) {
      try {
        if (existingTaskMap.has(taskId)) existing = existingTaskMap.get(taskId);
      } catch (e) { /* ignore */ }
    }

    const s = (taskData.status || "").toLowerCase();
    if (s === "draft" || s === "pending" || !taskData.status) {
      taskData.status = "TODO";
    }

    const payload = {
      projectId,
      elementId,
      title: taskData.title,
      description: taskData.description,
      status: taskData.status,
      priority: taskData.priority,
      category: taskData.category,
      startDate: withDefaultStartDate(taskData.startDate),
      endDate: taskData.endDate,
      estimatedHours: taskData.estimatedHours,
      assignee: taskData.assignee,
      dependencies: taskData.dependencies,
      updatedAt: now,
    };

    if (existing) {
      await ctx.db.patch(existing._id, payload);
      activeTaskIds.add(existing._id);
    } else {
      const newId = await ctx.db.insert("tasks", { ...payload, createdAt: now });
      activeTaskIds.add(newId);
      snapshotTasksMap[key].id = newId;
    }
  }

  for (const task of existingTasks) {
    if (!activeTaskIds.has(task._id)) await ctx.db.delete(task._id);
  }

  // --- 2. Material Lines Sync ---
  const existingMatMap = new Map(existingMaterialLines.map((l: any) => [l._id, l]));
  const activeMatIds = new Set<string>();

  const snapshotMaterials = snapshot.materials?.byId ?? {};
  const matsIterable = Object.values<any>(snapshotMaterials);

  for (const matData of matsIterable) {
    if (matData.deletedAt) continue; // Skip deleted items

    let lineId = matData.id;
    let existing = null;
    if (lineId && existingMatMap.has(lineId)) {
      existing = existingMatMap.get(lineId);
    }

    const payload = {
      projectId,
      elementId,
      itemName: matData.name,
      quantity: Number(matData.qty ?? 0),
      plannedUnitCost: Number(matData.unitCost ?? 0),
      plannedTotalCost: Number(matData.total ?? 0),
      actualUnitCost: matData.actualUnitCost,
      actualTotalCost: matData.actualTotalCost,
      // Note: mapping actualQty if schema supports it, otherwise ignored
    };

    if (existing) {
      await ctx.db.patch(existing._id, payload);
      activeMatIds.add(existing._id);
    } else {
      const newId = await ctx.db.insert("materialLines", { ...payload, createdAt: now });
      activeMatIds.add(newId);
      matData.id = newId;
    }
  }

  for (const line of existingMaterialLines) {
    if (!activeMatIds.has(line._id)) await ctx.db.delete(line._id);
  }

  // --- 3. Work Lines Sync ---
  const existingWorkMap = new Map(existingWorkLines.map((l: any) => [l._id, l]));
  const activeWorkIds = new Set<string>();

  const snapshotLabor = snapshot.labor?.byId ?? {};
  const laborIterable = Object.values<any>(snapshotLabor);

  for (const laborData of laborIterable) {
    if (laborData.deletedAt) continue; // Skip deleted items

    let lineId = laborData.id;
    let existing = null;
    if (lineId && existingWorkMap.has(lineId)) {
      existing = existingWorkMap.get(lineId);
    }

    const payload = {
      projectId,
      elementId,
      roleHe: laborData.role,
      plannedQuantity: Number(laborData.qty ?? 0),
      plannedUnitCost: Number(laborData.rate ?? laborData.unitCost ?? 0),
      plannedTotalCost: Number(laborData.total ?? 0),
      // actuals mappings if needed
    };

    if (existing) {
      await ctx.db.patch(existing._id, payload);
      activeWorkIds.add(existing._id);
    } else {
      const newId = await ctx.db.insert("workLines", { ...payload, createdAt: now });
      activeWorkIds.add(newId);
      laborData.id = newId;
    }
  }

  for (const line of existingWorkLines) {
    if (!activeWorkIds.has(line._id)) await ctx.db.delete(line._id);
  }

  // --- 4. Print Parts Sync ---
  const existingPartMap = new Map(existingParts.map((p: any) => [p._id, p]));
  const activePartIds = new Set<string>();

  const snapshotPrinting = snapshot.printing?.parts ?? snapshot.printing?.byId ?? [];
  const partsIterable = Array.isArray(snapshotPrinting)
    ? snapshotPrinting
    : Object.values(snapshotPrinting);

  for (const partData of partsIterable) {
    if (partData.deletedAt) continue; // Skip deleted items

    let partId = partData.id;
    let existing = null;
    if (partId && existingPartMap.has(partId)) {
      existing = existingPartMap.get(partId);
    }

    const payload = {
      projectId,
      elementId,
      label: partData.label,
      substrate: partData.substrate,
      qty: partData.qty,
      size: partData.size,
      requiresProof: partData.requiresProof,
    };

    if (existing) {
      await ctx.db.patch(existing._id, payload);
      activePartIds.add(existing._id);
    } else {
      const newId = await ctx.db.insert("printParts", {
        ...payload,
        createdAt: now,
      });
      activePartIds.add(newId);
      partData.id = newId;
    }
  }

  for (const part of existingParts) {
    if (!activePartIds.has(part._id)) {
      await ctx.db.delete(part._id);
    }
  }

  return snapshot;
}

export async function captureSnapshotFromLive(ctx: any, elementId: any) {
  // --- Fetch Live Data ---
  const existingTasks = await ctx.db
    .query("tasks")
    .withIndex("by_element", (q: any) => q.eq("elementId", elementId))
    .collect();

  const existingMaterialLines = await ctx.db
    .query("materialLines")
    .withIndex("by_element", (q: any) => q.eq("elementId", elementId))
    .collect();

  const existingWorkLines = await ctx.db
    .query("workLines")
    .withIndex("by_element", (q: any) => q.eq("elementId", elementId))
    .collect();

  const existingParts = await ctx.db
    .query("printParts")
    .withIndex("by_element", (q: any) => q.eq("elementId", elementId))
    .collect();

  // --- Construct Snapshot ---
  const snapshot: any = {
    tasks: { byId: {} },
    materials: { byId: {} },
    labor: { byId: {} },
    printing: { byId: {} },
    // accounting: { byId: {} }, // Legacy support removed to force migration to materials/labor
  };

  // Tasks
  for (const t of existingTasks) {
    snapshot.tasks.byId[t._id] = {
      id: t._id,
      title: t.title,
      description: t.description,
      status: t.status,
      priority: t.priority,
      category: t.category,
      startDate: t.startDate,
      endDate: t.endDate,
      estimatedHours:
        t.estimatedHours ?? (t.estimatedMinutes !== undefined ? t.estimatedMinutes / 60 : undefined),
      assignee: t.assignee,
      dependencies: t.dependencies,
    };
  }

  // Materials
  for (const l of existingMaterialLines) {
    snapshot.materials.byId[l._id] = {
      id: l._id,
      name: l.itemName ?? "Untitled Material",
      qty: l.quantity ?? 0,
      unitCost: l.plannedUnitCost ?? 0,
      total: l.plannedTotalCost ?? (l.quantity ?? 0) * (l.plannedUnitCost ?? 0),
      order: l.createdAt ?? Date.now(),
      actualUnitCost: l.actualUnitCost,
      actualTotalCost: l.actualTotalCost,
    };
  }

  // Labor
  for (const l of existingWorkLines) {
    snapshot.labor.byId[l._id] = {
      id: l._id,
      role: l.roleHe ?? "Untitled Role",
      qty: l.plannedQuantity ?? 0,
      rate: l.plannedUnitCost ?? 0,
      total: l.plannedTotalCost ?? (l.plannedQuantity ?? 0) * (l.plannedUnitCost ?? 0),
      order: l.createdAt ?? Date.now(),
    };
  }

  // Printing
  for (const p of existingParts) {
    snapshot.printing.byId[p._id] = {
      id: p._id,
      label: p.label,
      substrate: p.substrate,
      qty: p.qty,
      size: p.size,
      requiresProof: p.requiresProof,
    };
  }

  return snapshot;
}

// Deprecated: No-op as drafts are removed
export const approveElementDraft = mutation({
  args: {
    elementId: v.id("elements"),
    approvedBy: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    // No-op
    return { ok: true, versionId: null };
  },
});

export const approveElementLive = mutation({
  args: {
    elementId: v.id("elements"),
    approvedBy: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const element = await ctx.db.get(args.elementId);
    if (!element) throw new Error("Element not found");

    if (!element.currentDraftId) {
      // If no draft, just ensure status is approved and return
      await ctx.db.patch(args.elementId, {
        status: "approvedForQuote",
        hasUnapprovedChanges: false,
        updatedAt: Date.now(),
      });
      return { ok: true, versionId: element.currentApprovedVersionId };
    }

    const draft = await ctx.db.get(element.currentDraftId);
    if (!draft) throw new Error("Draft not found");

    const snapshot = draft.workingSnapshot;
    const now = Date.now();

    // 1. Sync Snapshot to Live Tables
    await syncSnapshotToLiveTables(ctx, args.elementId, snapshot);

    // 2. Create Version Record
    const latestVersion = await ctx.db
      .query("elementVersions")
      .withIndex("by_element", (q) => q.eq("elementId", args.elementId))
      .order("desc")
      .first();

    const versionNumber = (latestVersion?.versionNumber ?? 0) + 1;

    const versionId = await ctx.db.insert("elementVersions", {
      elementId: args.elementId,
      projectId: element.projectId,
      versionNumber,
      status: "approved",
      tags: element.tags ?? [],
      snapshot,
      schemaVersion: 1,
      approvedBy: args.approvedBy,
      approvedAt: now,
      createdAt: now,
    });

    // 3. Update Element
    await ctx.db.patch(args.elementId, {
      status: "approvedForQuote",
      currentApprovedVersionId: versionId,
      currentDraftId: undefined,
      hasUnapprovedChanges: false,
      rev: (element.rev ?? 0) + 1,
      updatedAt: now,
    });

    // 4. Mark Draft as Approved
    await ctx.db.patch(draft._id, {
      status: "approved",
      updatedAt: now,
    });

    await ctx.scheduler.runAfter(0, internal.projectsStage.recomputeStage, { projectId: element.projectId });

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

    const approvedMeta = new Map<string, { id: string; versionNumber: number; approvedAt?: number }>();

    for (const element of elements) {
      // Draft fetching removed
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
        draft: null, // Removed
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

    const approved = element.currentApprovedVersionId
      ? await ctx.db.get(element.currentApprovedVersionId)
      : null;

    // Always prefer live/approved, ignore draft
    const baseSource = "approved";
    const baseSpec = {}; // Not used actively anymore

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
        draftMeta: null,
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
          estimatedHours:
            task.estimatedHours ?? (task.estimatedMinutes !== undefined ? task.estimatedMinutes / 60 : undefined),
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
    status: v.optional(v.string()),
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
    if (args.status !== undefined) updates.status = args.status;

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

    // Draft deletion removed (preserved for now)

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

    await ctx.scheduler.runAfter(0, internal.projectsStage.recomputeStage, { projectId: element.projectId });

    return { ok: true };
  },
});

export async function captureProjectCostSnapshot(ctx: any, projectId: Id<"projects">) {
  // --- Fetch Live Data (Items without elementId) ---
  const existingMaterialLines = await ctx.db
    .query("materialLines")
    .withIndex("by_project", (q: any) => q.eq("projectId", projectId))
    .collect();

  const existingWorkLines = await ctx.db
    .query("workLines")
    .withIndex("by_project", (q: any) => q.eq("projectId", projectId))
    .collect();

  // Filter for items with NO elementId
  const projectMaterials = existingMaterialLines.filter((l: any) => !l.elementId);
  const projectLabor = existingWorkLines.filter((l: any) => !l.elementId);

  // --- Construct Snapshot ---
  const snapshot: any = {
    tasks: { byId: {} },
    materials: { byId: {} },
    labor: { byId: {} },
    printing: { byId: {} },
  };

  // Materials
  for (const l of projectMaterials) {
    snapshot.materials.byId[l._id] = {
      id: l._id,
      name: l.itemName ?? "Untitled Material",
      qty: l.quantity ?? 0,
      unitCost: l.plannedUnitCost ?? 0,
      total: l.plannedTotalCost ?? (l.quantity ?? 0) * (l.plannedUnitCost ?? 0),
      order: l.createdAt ?? Date.now(),
      actualUnitCost: l.actualUnitCost,
      actualTotalCost: l.actualTotalCost,
    };
  }

  // Labor
  for (const l of projectLabor) {
    snapshot.labor.byId[l._id] = {
      id: l._id,
      role: l.roleHe ?? "Untitled Role",
      qty: l.plannedQuantity ?? 0,
      rate: l.plannedUnitCost ?? 0,
      total: l.plannedTotalCost ?? (l.plannedQuantity ?? 0) * (l.plannedUnitCost ?? 0),
      order: l.createdAt ?? Date.now(),
    };
  }

  return snapshot;
}

export async function syncProjectCostSnapshotToLiveTables(ctx: any, projectId: Id<"projects">, snapshot: any) {
  const now = Date.now();

  // --- Fetch Live Data First (Items without elementId) ---
  const existingMaterialLines = await ctx.db
    .query("materialLines")
    .withIndex("by_project", (q: any) => q.eq("projectId", projectId))
    .collect();
  const projectMaterials = existingMaterialLines.filter((l: any) => !l.elementId);

  const existingWorkLines = await ctx.db
    .query("workLines")
    .withIndex("by_project", (q: any) => q.eq("projectId", projectId))
    .collect();
  const projectLabor = existingWorkLines.filter((l: any) => !l.elementId);

  // --- 1. Material Lines Sync ---
  const existingMatMap = new Map(projectMaterials.map((l: any) => [l._id, l]));
  const activeMatIds = new Set<string>();

  const snapshotMaterials = snapshot.materials?.byId ?? {};
  const matsIterable = Object.values<any>(snapshotMaterials);

  for (const matData of matsIterable) {
    if (matData.deletedAt) continue;

    let lineId = matData.id;
    let existing = null;
    if (lineId && existingMatMap.has(lineId)) {
      existing = existingMatMap.get(lineId);
    }

    const payload = {
      projectId,
      elementId: undefined, // Ensure no elementId
      itemName: matData.name,
      quantity: Number(matData.qty ?? 0),
      plannedUnitCost: Number(matData.unitCost ?? 0),
      plannedTotalCost: Number(matData.total ?? 0),
      actualUnitCost: matData.actualUnitCost,
      actualTotalCost: matData.actualTotalCost,
    };

    if (existing) {
      await ctx.db.patch(existing._id, payload);
      activeMatIds.add(existing._id);
    } else {
      const newId = await ctx.db.insert("materialLines", { ...payload, createdAt: now });
      activeMatIds.add(newId);
      matData.id = newId;
    }
  }

  for (const line of projectMaterials) {
    if (!activeMatIds.has(line._id)) await ctx.db.delete(line._id);
  }

  // --- 2. Work Lines Sync ---
  const existingWorkMap = new Map(projectLabor.map((l: any) => [l._id, l]));
  const activeWorkIds = new Set<string>();

  const snapshotLabor = snapshot.labor?.byId ?? {};
  const laborIterable = Object.values<any>(snapshotLabor);

  for (const laborData of laborIterable) {
    if (laborData.deletedAt) continue;

    let lineId = laborData.id;
    let existing = null;
    if (lineId && existingWorkMap.has(lineId)) {
      existing = existingWorkMap.get(lineId);
    }

    const payload = {
      projectId,
      elementId: undefined,
      roleHe: laborData.role,
      plannedQuantity: Number(laborData.qty ?? 0),
      plannedUnitCost: Number(laborData.rate ?? laborData.unitCost ?? 0),
      plannedTotalCost: Number(laborData.total ?? 0),
    };

    if (existing) {
      await ctx.db.patch(existing._id, payload);
      activeWorkIds.add(existing._id);
    } else {
      const newId = await ctx.db.insert("workLines", { ...payload, createdAt: now });
      activeWorkIds.add(newId);
      laborData.id = newId;
    }
  }

  for (const line of projectLabor) {
    if (!activeWorkIds.has(line._id)) await ctx.db.delete(line._id);
  }

  return snapshot;
}

export const approveProjectCostLive = mutation({
  args: {
    projectId: v.id("projects"),
  },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project) throw new Error("Project not found");

    if (!project.projectCostContainerId) {
      return { ok: true, msg: "No project cost container" };
    }

    const container = await ctx.db.get(project.projectCostContainerId);
    if (!container?.currentDraftId) {
      return { ok: true, msg: "No active project cost draft" };
    }

    const draft = await ctx.db.get(container.currentDraftId);
    if (!draft) throw new Error("Draft not found");

    const snapshot = draft.workingSnapshot;
    const now = Date.now();

    // 1. Sync to Live
    await syncProjectCostSnapshotToLiveTables(ctx, args.projectId, snapshot);

    // 2. Create Version
    const versionId = await ctx.db.insert("projectCostVersions", {
      projectId: args.projectId,
      status: "approved",
      snapshot,
      createdAt: now,
    });

    // 3. Update Container
    await ctx.db.patch(container._id, {
      currentDraftId: undefined,
      updatedAt: now,
    });

    // 4. Mark Draft as Approved
    await ctx.db.patch(draft._id, {
      status: "approved",
      updatedAt: now,
    });

    await ctx.scheduler.runAfter(0, internal.projectsStage.recomputeStage, { projectId: args.projectId });

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

    const approvedMeta = new Map<string, { id: string; versionNumber: number; approvedAt?: number }>();

    for (const element of elements) {
      // Draft fetching removed
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
        draft: null, // Removed
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

    const approved = element.currentApprovedVersionId
      ? await ctx.db.get(element.currentApprovedVersionId)
      : null;

    // Always prefer live/approved, ignore draft
    const baseSource = "approved";
    const baseSpec = {}; // Not used actively anymore

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
        draftMeta: null,
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
          estimatedHours:
            task.estimatedHours ?? (task.estimatedMinutes !== undefined ? task.estimatedMinutes / 60 : undefined),
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
    status: v.optional(v.string()),
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
    if (args.status !== undefined) updates.status = args.status;

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

    // Draft deletion removed (preserved for now)

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

    await ctx.scheduler.runAfter(0, api.projectsStage.recomputeStage, { projectId: element.projectId });

    return { ok: true };
  },
});

export async function syncProjectCostSnapshotToLiveTables(ctx: any, projectId: Id<"projects">, snapshot: any) {
  const now = Date.now();

  // --- Fetch Live Data First (Items without elementId) ---
  const existingMaterialLines = await ctx.db
    .query("materialLines")
    .withIndex("by_project", (q: any) => q.eq("projectId", projectId))
    .collect();
  const projectMaterials = existingMaterialLines.filter((l: any) => !l.elementId);

  const existingWorkLines = await ctx.db
    .query("workLines")
    .withIndex("by_project", (q: any) => q.eq("projectId", projectId))
    .collect();
  const projectLabor = existingWorkLines.filter((l: any) => !l.elementId);

  // --- 1. Material Lines Sync ---
  const existingMatMap = new Map(projectMaterials.map((l: any) => [l._id, l]));
  const activeMatIds = new Set<string>();

  const snapshotMaterials = snapshot.materials?.byId ?? {};
  const matsIterable = Object.values<any>(snapshotMaterials);

  for (const matData of matsIterable) {
    if (matData.deletedAt) continue;

    let lineId = matData.id;
    let existing = null;
    if (lineId && existingMatMap.has(lineId)) {
      existing = existingMatMap.get(lineId);
    }

    const payload = {
      projectId,
      elementId: undefined, // Ensure no elementId
      itemName: matData.name,
      quantity: Number(matData.qty ?? 0),
      plannedUnitCost: Number(matData.unitCost ?? 0),
      plannedTotalCost: Number(matData.total ?? 0),
      actualUnitCost: matData.actualUnitCost,
      actualTotalCost: matData.actualTotalCost,
    };

    if (existing) {
      await ctx.db.patch(existing._id, payload);
      activeMatIds.add(existing._id);
    } else {
      const newId = await ctx.db.insert("materialLines", { ...payload, createdAt: now });
      activeMatIds.add(newId);
      matData.id = newId;
    }
  }

  for (const line of projectMaterials) {
    if (!activeMatIds.has(line._id)) await ctx.db.delete(line._id);
  }

  // --- 2. Work Lines Sync ---
  const existingWorkMap = new Map(projectLabor.map((l: any) => [l._id, l]));
  const activeWorkIds = new Set<string>();

  const snapshotLabor = snapshot.labor?.byId ?? {};
  const laborIterable = Object.values<any>(snapshotLabor);

  for (const laborData of laborIterable) {
    if (laborData.deletedAt) continue;

    let lineId = laborData.id;
    let existing = null;
    if (lineId && existingWorkMap.has(lineId)) {
      existing = existingWorkMap.get(lineId);
    }

    const payload = {
      projectId,
      elementId: undefined,
      roleHe: laborData.role,
      plannedQuantity: Number(laborData.qty ?? 0),
      plannedUnitCost: Number(laborData.rate ?? laborData.unitCost ?? 0),
      plannedTotalCost: Number(laborData.total ?? 0),
    };

    if (existing) {
      await ctx.db.patch(existing._id, payload);
      activeWorkIds.add(existing._id);
    } else {
      const newId = await ctx.db.insert("workLines", { ...payload, createdAt: now });
      activeWorkIds.add(newId);
      laborData.id = newId;
    }
  }

  for (const line of projectLabor) {
    if (!activeWorkIds.has(line._id)) await ctx.db.delete(line._id);
  }

  return snapshot;
}

export const approveProjectCostLive = mutation({
  args: {
    projectId: v.id("projects"),
  },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project) throw new Error("Project not found");

    if (!project.projectCostContainerId) {
      return { ok: true, msg: "No project cost container" };
    }

    const container = await ctx.db.get(project.projectCostContainerId);
    if (!container?.currentDraftId) {
      return { ok: true, msg: "No active project cost draft" };
    }

    const draft = await ctx.db.get(container.currentDraftId);
    if (!draft) throw new Error("Draft not found");

    const snapshot = draft.workingSnapshot;
    const now = Date.now();

    // 1. Sync to Live
    await syncProjectCostSnapshotToLiveTables(ctx, args.projectId, snapshot);

    // 2. Create Version
    const versionId = await ctx.db.insert("projectCostVersions", {
      projectId: args.projectId,
      status: "approved",
      snapshot,
      createdAt: now,
    });

    // 3. Update Container
    await ctx.db.patch(container._id, {
      currentDraftId: undefined,
      updatedAt: now,
    });

    // 4. Mark Draft as Approved
    await ctx.db.patch(draft._id, {
      status: "approved",
      updatedAt: now,
    });

    await ctx.scheduler.runAfter(0, internal.projectsStage.recomputeStage, { projectId: args.projectId });

    return { ok: true, versionId };
  },
});


