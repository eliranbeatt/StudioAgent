import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// Helper to sync snapshot data to live tables
async function syncSnapshotToLiveTables(ctx: any, elementId: any, snapshot: any) {
  const projectId = (await ctx.db.get(elementId)).projectId;
  const now = Date.now();

  // --- Fetch Live Data First ---
  const existingTasks = await ctx.db
    .query("tasks")
    .withIndex("by_element", (q: any) => q.eq("elementId", elementId))
    .collect();

  const existingLines = await ctx.db
    .query("accountingLines")
    .withIndex("by_element", (q: any) => q.eq("elementId", elementId))
    .collect();

  const existingParts = await ctx.db
    .query("printParts")
    .withIndex("by_element", (q: any) => q.eq("elementId", elementId))
    .collect();

  // --- Check if Snapshot is Empty ---
  const snapTasks = snapshot.tasks?.byId ?? {};
  const snapLines = snapshot.accounting?.lines ?? snapshot.accounting?.byId ?? [];
  const snapParts = snapshot.printing?.parts ?? snapshot.printing?.byId ?? [];

  const snapHasTasks = Object.keys(snapTasks).length > 0;
  const snapHasLines = Array.isArray(snapLines) ? snapLines.length > 0 : Object.keys(snapLines).length > 0;
  const snapHasParts = Array.isArray(snapParts) ? snapParts.length > 0 : Object.keys(snapParts).length > 0;

  const snapshotIsEmpty = !snapHasTasks && !snapHasLines && !snapHasParts;
  const liveHasData = existingTasks.length > 0 || existingLines.length > 0 || existingParts.length > 0;

  if (snapshotIsEmpty && liveHasData) {
    console.log(`[Approve] Snapshot is empty but live data exists for element ${elementId}. Hydrating snapshot from live data.`);

    // Construct snapshot from live data
    const newSnapshot = { ...snapshot };

    // Tasks
    newSnapshot.tasks = { byId: {} };
    for (const t of existingTasks) {
      newSnapshot.tasks.byId[t._id] = {
        id: t._id,
        title: t.title,
        description: t.description,
        status: t.status,
        priority: t.priority,
        category: t.category,
        startDate: t.startDate,
        endDate: t.endDate,
        estimatedMinutes: t.estimatedMinutes,
        assignee: t.assignee,
        dependencies: t.dependencies,
      };
    }

    // Accounting
    newSnapshot.accounting = { byId: {} };
    for (const l of existingLines) {
      newSnapshot.accounting.byId[l._id] = {
        id: l._id,
        taskId: l.taskId,
        type: l.type,
        title: l.title,
        qty: l.qty,
        unitCost: l.unitCost,
        total: l.total,
        billable: l.billable,
      };
    }

    // Printing
    newSnapshot.printing = { byId: {} };
    for (const p of existingParts) {
      newSnapshot.printing.byId[p._id] = {
        id: p._id,
        label: p.label,
        substrate: p.substrate,
        qty: p.qty,
        size: p.size,
        requiresProof: p.requiresProof,
      };
    }

    return newSnapshot;
  }

  // --- Normal Flow: Snapshot -> Live ---

  // --- 1. Tasks Sync ---
  const existingTaskMap = new Map(existingTasks.map((t: any) => [t._id, t]));
  const activeTaskIds = new Set<string>();

  const snapshotTasksMap = snapshot.tasks?.byId ?? {};

  // Iterate snapshot tasks
  for (const [key, taskData] of Object.entries<any>(snapshotTasksMap)) {
    let taskId = taskData.id;

    // Check if it's a valid ID and exists
    let existing = null;
    if (taskId) {
      try {
        if (existingTaskMap.has(taskId)) {
          existing = existingTaskMap.get(taskId);
        }
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
      startDate: taskData.startDate,
      endDate: taskData.endDate,
      estimatedMinutes: taskData.estimatedMinutes,
      assignee: taskData.assignee,
      dependencies: taskData.dependencies,
      updatedAt: now,
    };

    if (existing) {
      await ctx.db.patch(existing._id, payload);
      activeTaskIds.add(existing._id);
    } else {
      const newId = await ctx.db.insert("tasks", {
        ...payload,
        createdAt: now,
      });
      activeTaskIds.add(newId);
      // Update snapshot with real ID
      snapshotTasksMap[key].id = newId;
    }
  }

  // Delete obsolete tasks
  for (const task of existingTasks) {
    if (!activeTaskIds.has(task._id)) {
      await ctx.db.delete(task._id);
    }
  }


  // --- 2. Accounting Lines Sync ---
  const existingLineMap = new Map(existingLines.map((l: any) => [l._id, l]));
  const activeLineIds = new Set<string>();

  const snapshotAccounting = snapshot.accounting?.lines ?? snapshot.accounting?.byId ?? [];
  const linesIterable = Array.isArray(snapshotAccounting)
    ? snapshotAccounting
    : Object.values(snapshotAccounting);

  for (const lineData of linesIterable) {
    let lineId = lineData.id;
    let existing = null;
    if (lineId && existingLineMap.has(lineId)) {
      existing = existingLineMap.get(lineId);
    }

    const payload = {
      projectId,
      elementId,
      taskId: lineData.taskId,
      type: lineData.type,
      title: lineData.title,
      qty: lineData.qty,
      unitCost: lineData.unitCost,
      total: lineData.total,
      billable: lineData.billable,
    };

    if (existing) {
      await ctx.db.patch(existing._id, payload);
      activeLineIds.add(existing._id);
    } else {
      const newId = await ctx.db.insert("accountingLines", {
        ...payload,
        createdAt: now,
      });
      activeLineIds.add(newId);
      lineData.id = newId;
    }
  }

  for (const line of existingLines) {
    if (!activeLineIds.has(line._id)) {
      await ctx.db.delete(line._id);
    }
  }


  // --- 3. Print Parts Sync ---
  const existingPartMap = new Map(existingParts.map((p: any) => [p._id, p]));
  const activePartIds = new Set<string>();

  const snapshotPrinting = snapshot.printing?.parts ?? snapshot.printing?.byId ?? [];
  const partsIterable = Array.isArray(snapshotPrinting)
    ? snapshotPrinting
    : Object.values(snapshotPrinting);

  for (const partData of partsIterable) {
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

async function captureSnapshotFromLive(ctx: any, elementId: any) {
  // --- Fetch Live Data ---
  const existingTasks = await ctx.db
    .query("tasks")
    .withIndex("by_element", (q: any) => q.eq("elementId", elementId))
    .collect();

  const existingLines = await ctx.db
    .query("accountingLines")
    .withIndex("by_element", (q: any) => q.eq("elementId", elementId))
    .collect();

  const existingParts = await ctx.db
    .query("printParts")
    .withIndex("by_element", (q: any) => q.eq("elementId", elementId))
    .collect();

  // --- Construct Snapshot ---
  const snapshot: any = {
    tasks: { byId: {} },
    accounting: { byId: {} },
    printing: { byId: {} },
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
      estimatedMinutes: t.estimatedMinutes,
      assignee: t.assignee,
      dependencies: t.dependencies,
    };
  }

  // Accounting
  for (const l of existingLines) {
    snapshot.accounting.byId[l._id] = {
      id: l._id,
      taskId: l.taskId,
      type: l.type,
      title: l.title,
      qty: l.qty,
      unitCost: l.unitCost,
      total: l.total,
      billable: l.billable,
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

    // Idempotency: removed to allow re-approving/fixing inconsistent states.
    // If draft.status === "approved", we allow creating a new version to ensure live tables are synced.

    if (draft.status !== "open" && draft.status !== "needsReview" && draft.status !== "approved") {
      throw new Error(`Draft is not in a strictly open state (current status: ${draft.status}).`);
    }

    // --- CAPTURE LIVE STATE AS TRUTH ---
    // Instead of trusting the draft snapshot (which might be stale due to direct live edits),
    // we rebuild the snapshot from the current live tables. This ensures no data loss.
    const liveSnapshot = await captureSnapshotFromLive(ctx, args.elementId);

    // --- SAFETY CHECK ---
    // If Live state is completely empty but Draft has data, it implies the user might be working 
    // in "Draft Only" mode (System 1) where live tables are not used until approval. 
    // In that case, we should prefer the Draft.
    // Otherwise, we prefer Live (System 2) to capture recent manual/agent edits.

    const liveTasks = Object.keys(liveSnapshot.tasks?.byId ?? {}).length;
    const liveLines = Object.keys(liveSnapshot.accounting?.byId ?? {}).length;
    const liveParts = Object.keys(liveSnapshot.printing?.byId ?? {}).length;
    const liveIsEmpty = liveTasks === 0 && liveLines === 0 && liveParts === 0;

    const draftSnapshot = draft.workingSnapshot ?? {};
    const draftTasks = Object.keys(draftSnapshot.tasks?.byId ?? {}).length;
    const draftLines = Array.isArray(draftSnapshot.accounting?.lines)
      ? draftSnapshot.accounting.lines.length
      : Object.keys(draftSnapshot.accounting?.byId ?? {}).length; // Handle both formats
    const draftParts = Array.isArray(draftSnapshot.printing?.parts)
      ? draftSnapshot.printing.parts.length
      : Object.keys(draftSnapshot.printing?.byId ?? {}).length;

    const draftHasData = draftTasks > 0 || draftLines > 0 || draftParts > 0;

    let snapshotToUse = liveSnapshot;
    if (liveIsEmpty && draftHasData) {
      console.log(`[Approve] Live is empty but Draft has data (${draftTasks} tasks). Preferring Draft.`);
      snapshotToUse = draftSnapshot;
    }

    // Ensure the captured snapshot is what we use for the version AND the sync (no-op sync essentially)
    const updatedSnapshot = await syncSnapshotToLiveTables(ctx, args.elementId, snapshotToUse);

    const latestVersion = await ctx.db
      .query("elementVersions")
      .withIndex("by_element", (q) => q.eq("elementId", args.elementId))
      .order("desc")
      .first();

    const now = Date.now();
    const versionNumber = latestVersion ? latestVersion.versionNumber + 1 : 1;

    // Create the version with the UPDATED snapshot (containing real IDs)
    const versionId = await ctx.db.insert("elementVersions", {
      elementId: args.elementId,
      projectId: element.projectId,
      versionNumber,
      status: "approved",
      tags: element.tags ?? [],
      summary: `Approved from draft ${draft._id}`,
      snapshot: updatedSnapshot,
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
      workingSnapshot: updatedSnapshot, // Update draft with real IDs too
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
