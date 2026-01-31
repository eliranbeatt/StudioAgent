import { mutation, query, internalMutation } from './_generated/server'
import { v } from 'convex/values'
import { api, internal } from './_generated/api'
import { withDefaultStartDate } from './lib/dates'
import { Id } from './_generated/dataModel'

/**
 * HELPER: Sync snapshot data to live tables
 * This replaces existing records with the state in the snapshot.
 */
export async function syncSnapshotToLiveTables(ctx: any, elementId: Id<"elements">, snapshot: any) {
  const element = await ctx.db.get(elementId);
  if (!element) throw new Error("Element not found");
  const projectId = element.projectId;
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
    if (taskData.deletedAt) continue;

    let taskId = taskData.id;
    let existing = (taskId && existingTaskMap.has(taskId)) ? existingTaskMap.get(taskId) : null;

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
      await ctx.db.patch((existing as any)._id, payload);
      activeTaskIds.add((existing as any)._id);
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

  for (const matData of Object.values<any>(snapshotMaterials)) {
    if (matData.deletedAt) continue;

    let lineId = matData.id;
    let existing = (lineId && existingMatMap.has(lineId)) ? existingMatMap.get(lineId) : null;

    const payload = {
      projectId,
      elementId,
      itemName: matData.name,
      quantity: Number(matData.qty ?? 0),
      plannedUnitCost: Number(matData.unitCost ?? 0),
      plannedTotalCost: Number(matData.total ?? 0),
      actualUnitCost: matData.actualUnitCost,
      actualTotalCost: matData.actualTotalCost,
    };

    if (existing) {
      await ctx.db.patch((existing as any)._id, payload);
      activeMatIds.add((existing as any)._id);
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

  for (const laborData of Object.values<any>(snapshotLabor)) {
    if (laborData.deletedAt) continue;

    let lineId = laborData.id;
    let existing = (lineId && existingWorkMap.has(lineId)) ? existingWorkMap.get(lineId) : null;

    const payload = {
      projectId,
      elementId,
      roleHe: laborData.role,
      plannedQuantity: Number(laborData.qty ?? 0),
      plannedUnitCost: Number(laborData.rate ?? laborData.unitCost ?? 0),
      plannedTotalCost: Number(laborData.total ?? 0),
    };

    if (existing) {
      await ctx.db.patch((existing as any)._id, payload);
      activeWorkIds.add((existing as any)._id);
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
  const partsIterable = Array.isArray(snapshotPrinting) ? snapshotPrinting : Object.values(snapshotPrinting);

  for (const partData of partsIterable) {
    if (partData.deletedAt) continue;

    let partId = (partData as any).id;
    let existing = (partId && existingPartMap.has(partId)) ? existingPartMap.get(partId) : null;

    const payload = {
      projectId,
      elementId,
      label: (partData as any).label,
      substrate: (partData as any).substrate,
      qty: (partData as any).qty,
      size: (partData as any).size,
      requiresProof: (partData as any).requiresProof,
    };

    if (existing) {
      await ctx.db.patch((existing as any)._id, payload);
      activePartIds.add((existing as any)._id);
    } else {
      const newId = await ctx.db.insert("printParts", { ...payload, createdAt: now });
      activePartIds.add(newId);
      (partData as any).id = newId;
    }
  }

  for (const part of existingParts) {
    if (!activePartIds.has(part._id)) await ctx.db.delete(part._id);
  }

  return snapshot;
}

/**
 * HELPER: Sync project cost snapshot to live tables (no elementId)
 */
export async function syncProjectCostSnapshotToLiveTables(ctx: any, projectId: Id<"projects">, snapshot: any) {
  const now = Date.now();

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

  const existingMatMap = new Map(projectMaterials.map((l: any) => [l._id, l]));
  const activeMatIds = new Set<string>();
  const snapshotMaterials = snapshot.materials?.byId ?? {};

  for (const matData of Object.values<any>(snapshotMaterials)) {
    if (matData.deletedAt) continue;

    let lineId = matData.id;
    let existing = (lineId && existingMatMap.has(lineId)) ? existingMatMap.get(lineId) : null;

    const payload = {
      projectId,
      elementId: undefined,
      itemName: matData.name,
      quantity: Number(matData.qty ?? 0),
      plannedUnitCost: Number(matData.unitCost ?? 0),
      plannedTotalCost: Number(matData.total ?? 0),
      actualUnitCost: matData.actualUnitCost,
      actualTotalCost: matData.actualTotalCost,
    };

    if (existing) {
      await ctx.db.patch((existing as any)._id, payload);
      activeMatIds.add((existing as any)._id);
    } else {
      const newId = await ctx.db.insert("materialLines", { ...payload, createdAt: now });
      activeMatIds.add(newId);
      matData.id = newId;
    }
  }

  for (const line of projectMaterials) {
    if (!activeMatIds.has(line._id)) await ctx.db.delete(line._id);
  }

  const existingWorkMap = new Map(projectLabor.map((l: any) => [l._id, l]));
  const activeWorkIds = new Set<string>();
  const snapshotLabor = snapshot.labor?.byId ?? {};

  for (const laborData of Object.values<any>(snapshotLabor)) {
    if (laborData.deletedAt) continue;

    let lineId = laborData.id;
    let existing = (lineId && existingWorkMap.has(lineId)) ? existingWorkMap.get(lineId) : null;

    const payload = {
      projectId,
      elementId: undefined,
      roleHe: laborData.role,
      plannedQuantity: Number(laborData.qty ?? 0),
      plannedUnitCost: Number(laborData.rate ?? laborData.unitCost ?? 0),
      plannedTotalCost: Number(laborData.total ?? 0),
    };

    if (existing) {
      await ctx.db.patch((existing as any)._id, payload);
      activeWorkIds.add((existing as any)._id);
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

/**
 * HELPER: Capture snapshot from live tables
 */
export async function captureSnapshotFromLive(ctx: any, elementId: Id<"elements">) {
  const tasks = await ctx.db.query("tasks").withIndex("by_element", (q: any) => q.eq("elementId", elementId)).collect();
  const mats = await ctx.db.query("materialLines").withIndex("by_element", (q: any) => q.eq("elementId", elementId)).collect();
  const labs = await ctx.db.query("workLines").withIndex("by_element", (q: any) => q.eq("elementId", elementId)).collect();
  const parts = await ctx.db.query("printParts").withIndex("by_element", (q: any) => q.eq("elementId", elementId)).collect();

  const snapshot: any = { tasks: { byId: {} }, materials: { byId: {} }, labor: { byId: {} }, printing: { byId: {} } };

  for (const t of tasks) {
    snapshot.tasks.byId[t._id] = {
      id: t._id, title: t.title, description: t.description, status: t.status, priority: t.priority,
      category: t.category, startDate: t.startDate, endDate: t.endDate,
      estimatedHours: t.estimatedHours ?? (t.estimatedMinutes ? t.estimatedMinutes / 60 : undefined),
      assignee: t.assignee, dependencies: t.dependencies
    };
  }
  for (const l of mats) {
    snapshot.materials.byId[l._id] = {
      id: l._id, name: l.itemName ?? "Untitled", qty: l.quantity ?? 0, unitCost: l.plannedUnitCost ?? 0,
      total: l.plannedTotalCost ?? 0, order: l.createdAt ?? Date.now(),
      actualUnitCost: l.actualUnitCost, actualTotalCost: l.actualTotalCost
    };
  }
  for (const l of labs) {
    snapshot.labor.byId[l._id] = {
      id: l._id, role: l.roleHe ?? "Untitled", qty: l.plannedQuantity ?? 0, rate: l.plannedUnitCost ?? 0,
      total: l.plannedTotalCost ?? 0, order: l.createdAt ?? Date.now()
    };
  }
  for (const p of parts) {
    snapshot.printing.byId[p._id] = {
      id: p._id, label: p.label, substrate: p.substrate, qty: p.qty, size: p.size, requiresProof: p.requiresProof
    };
  }
  return snapshot;
}

/**
 * HELPER: Capture project cost snapshot from live tables
 */
export async function captureProjectCostSnapshot(ctx: any, projectId: Id<"projects">) {
  const mats = await ctx.db.query("materialLines").withIndex("by_project", (q: any) => q.eq("projectId", projectId)).collect();
  const labs = await ctx.db.query("workLines").withIndex("by_project", (q: any) => q.eq("projectId", projectId)).collect();

  const projectMaterials = mats.filter((l: any) => !l.elementId);
  const projectLabor = labs.filter((l: any) => !l.elementId);

  const snapshot: any = { tasks: { byId: {} }, materials: { byId: {} }, labor: { byId: {} }, printing: { byId: {} } };

  for (const l of projectMaterials) {
    snapshot.materials.byId[l._id] = {
      id: l._id, name: l.itemName ?? "Untitled", qty: l.quantity ?? 0, unitCost: l.plannedUnitCost ?? 0,
      total: l.plannedTotalCost ?? 0, order: l.createdAt ?? Date.now(),
      actualUnitCost: l.actualUnitCost, actualTotalCost: l.actualTotalCost
    };
  }
  for (const l of projectLabor) {
    snapshot.labor.byId[l._id] = {
      id: l._id, role: l.roleHe ?? "Untitled", qty: l.plannedQuantity ?? 0, rate: l.plannedUnitCost ?? 0,
      total: l.plannedTotalCost ?? 0, order: l.createdAt ?? Date.now()
    };
  }
  return snapshot;
}

export const listByProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const elements = await ctx.db.query("elements").withIndex("by_project", (q) => q.eq("projectId", args.projectId)).order("desc").collect();
    const tasks = await ctx.db.query("tasks").withIndex("by_project", (q) => q.eq("projectId", args.projectId)).collect();
    const lines = await ctx.db.query("accountingLines").withIndex("by_project", (q) => q.eq("projectId", args.projectId)).collect();
    const printParts = await ctx.db.query("printParts").filter((q) => q.eq(q.field("projectId"), args.projectId)).collect();

    const tasksByElement = new Map<string, number>();
    for (const task of tasks) { if (task.elementId) tasksByElement.set(task.elementId, (tasksByElement.get(task.elementId) ?? 0) + 1); }

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
    for (const part of printParts) { printCounts.set(part.elementId, (printCounts.get(part.elementId) ?? 0) + 1); }

    return {
      elements: elements.map((element) => {
        const status = element.status === "drafting" ? "approvedForQuote" : element.status;
        return ({
          id: element._id, title: element.title, type: element.type, status,
          rev: element.rev ?? 0, tags: element.tags ?? [], updatedAt: element.updatedAt,
          taskCount: tasksByElement.get(element._id) ?? 0,
          budget: totalsByElement.get(element._id) ?? { materials: 0, labor: 0, total: 0 },
          printPartsCount: printCounts.get(element._id) ?? 0,
          draft: null, approved: null,
        });
      }),
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

    const tasks = await ctx.db.query("tasks").withIndex("by_element", (q) => q.eq("elementId", args.elementId)).collect();
    const lines = await ctx.db.query("accountingLines").withIndex("by_element", (q) => q.eq("elementId", args.elementId)).collect();
    const printParts = await ctx.db.query("printParts").withIndex("by_element", (q) => q.eq("elementId", args.elementId)).collect();

    const totals = lines.reduce((acc, line) => {
      if (line.type === "material") acc.materials += line.total;
      if (line.type === "labor") acc.labor += line.total;
      acc.total += line.total;
      return acc;
    }, { materials: 0, labor: 0, total: 0 });

    const snapshot = await captureSnapshotFromLive(ctx, args.elementId);

    const status = element.status === "drafting" ? "approvedForQuote" : element.status;
    return {
      element: { id: element._id, title: element.title, description: element.description, type: element.type, status, rev: element.rev ?? 0, tags: element.tags ?? [], updatedAt: element.updatedAt },
      base: {
        source: "live",
        spec: snapshot,
        revisionMeta: {
          revisionId: element._id,
          revisionNumber: element.rev ?? 0,
          createdAt: element.updatedAt,
        },
        draftMeta: {
          draftId: element._id,
          revisionNumber: element.rev ?? 0,
          status: "live",
        },
      },
      canon: { tasksCount: tasks.length, materialsTotal: totals.materials, laborTotal: totals.labor },
      links: {
        tasks: tasks.map((task) => ({
          id: task._id, title: task.title, description: task.description, status: task.status, priority: task.priority,
          category: task.category, startDate: task.startDate, endDate: task.endDate,
          estimatedHours: task.estimatedHours ?? (task.estimatedMinutes ? task.estimatedMinutes / 60 : undefined),
          assignee: task.assignee, dependencies: task.dependencies ?? [],
        })),
        accounting: { lines: lines.map((line) => ({ id: line._id, type: line.type, title: line.title, qty: line.qty, unitCost: line.unitCost, total: line.total, taskId: line.taskId })) },
        printing: { printParts: printParts.map((part) => ({ id: part._id, label: part.label, qty: part.qty, size: part.size, substrate: part.substrate, requiresProof: part.requiresProof })) },
      },
    };
  },
});

export const getElementDetail = query({
  args: { elementId: v.id("elements") },
  handler: async (ctx, args) => {
    const element = await ctx.db.get(args.elementId);
    if (!element) return null;
    const status = element.status === "drafting" ? "approvedForQuote" : element.status;
    return { element: { id: element._id, title: element.title, type: element.type, status, rev: element.rev ?? 1 }, draft: null, approved: null };
  },
});

export const updateElementMeta = mutation({
  args: { elementId: v.id("elements"), title: v.optional(v.string()), type: v.optional(v.string()), tags: v.optional(v.array(v.string())), status: v.optional(v.string()), description: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const element = await ctx.db.get(args.elementId);
    if (!element) throw new Error("Element not found.");
    const allowedTypes = new Set(["build", "rent", "buy", "print", "transport", "install", "subcontract", "mixed"]);
    if (args.type && !allowedTypes.has(args.type)) throw new Error("Invalid element type.");
    const updates: any = { updatedAt: Date.now() };
    if (args.title !== undefined) updates.title = args.title;
    if (args.type !== undefined) updates.type = args.type;
    if (args.tags !== undefined) updates.tags = args.tags;
    if (args.status !== undefined) updates.status = args.status;
    if (args.description !== undefined) updates.description = args.description;
    await ctx.db.patch(args.elementId, updates);
    return { ok: true };
  },
});

export const deleteElement = mutation({
  args: { elementId: v.id("elements") },
  handler: async (ctx, args) => {
    const element = await ctx.db.get(args.elementId);
    if (!element) throw new Error("Element not found.");
    const versions = await ctx.db.query("elementVersions").withIndex("by_element", (q) => q.eq("elementId", args.elementId)).collect();
    for (const v of versions) await ctx.db.delete(v._id);
    const tasks = await ctx.db.query("tasks").withIndex("by_element", (q) => q.eq("elementId", args.elementId)).collect();
    for (const t of tasks) await ctx.db.delete(t._id);
    const lines = await ctx.db.query("accountingLines").withIndex("by_element", (q) => q.eq("elementId", args.elementId)).collect();
    for (const l of lines) await ctx.db.delete(l._id);
    const parts = await ctx.db.query("printParts").withIndex("by_element", (q) => q.eq("elementId", args.elementId)).collect();
    for (const p of parts) await ctx.db.delete(p._id);
    await ctx.db.delete(args.elementId);
    await ctx.scheduler.runAfter(0, internal.projectsStage.recomputeStage, { projectId: element.projectId });
    return { ok: true };
  },
});
