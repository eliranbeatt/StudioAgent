import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { applyChangeSetInternal } from "./drafts";

export const updateTaskStatus = mutation({
  args: {
    projectId: v.id("projects"),
    taskId: v.id("tasks"),
    status: v.string(),
  },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) throw new Error("Task not found");
    if (!task.elementId) throw new Error("Task is not associated with an element");

    const element = await ctx.db.get(task.elementId);
    if (!element) throw new Error("Element not found");

    let draftId = element.currentDraftId;
    let baseRevisionNumber = 0;

    if (!draftId) {
      // Create new draft logic
      let snapshot = {};
      let schemaVersion = 1;
      if (element.currentApprovedVersionId) {
        const version = await ctx.db.get(element.currentApprovedVersionId);
        if (version) {
          snapshot = version.snapshot;
          schemaVersion = version.schemaVersion;
        }
      }

      draftId = await ctx.db.insert("elementDrafts", {
        elementId: element._id,
        projectId: args.projectId,
        status: "open",
        revisionNumber: 1,
        createdFrom: { tab: "Tasks", stage: "planning" },
        workingSnapshot: snapshot,
        schemaVersion,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      await ctx.db.patch(element._id, {
        currentDraftId: draftId,
        status: "drafting",
        updatedAt: Date.now(),
      });
      baseRevisionNumber = 1;
    } else {
      const draft = await ctx.db.get(draftId);
      if (!draft) throw new Error("Draft not found");
      baseRevisionNumber = draft.revisionNumber;
    }

    // Now apply change set
    return await applyChangeSetInternal(ctx, {
      draftType: "element",
      draftId: draftId!,
      projectId: args.projectId,
      patchOps: [
        {
          op: "replace",
          path: `/tasks/byId/${task._id}/status`,
          value: args.status,
        },
      ],
      baseRevisionNumber,
      reason: "Update task status (Kanban)",
      createdFrom: { tab: "Tasks", stage: "planning" },
    });
  },
});

export const getTask = query({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.taskId);
  },
});

export const updateTask = mutation({
  args: {
    taskId: v.id("tasks"),
    patch: v.any(), // { title?: string, status?: string, ... }
  },
  handler: async (ctx, args) => {
    const { taskId, patch } = args;
    await ctx.db.patch(taskId, {
      ...patch,
      updatedAt: Date.now(),
    });
  },
});

export const listForProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    // 1. Fetch Elements
    const elements = await ctx.db
      .query("elements")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();

    // 2. Fetch Tasks
    const allTasks = await ctx.db
      .query("tasks")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();

    // 3. Fetch MaterialLines + WorkLines (for materials/labor linked to tasks)
    const allMaterialLines = await ctx.db
      .query("materialLines")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
    const allWorkLines = await ctx.db
      .query("workLines")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();

    // 4. Fetch ElementDrafts
    const allDrafts = await ctx.db
      .query("elementDrafts")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
    const draftById = new Map(allDrafts.map((d) => [d._id, d]));

    // 5. Fetch Task Revisions (Drafts)
    const draftRevisions = await ctx.db
      .query("taskRevisions")
      .withIndex("by_project_status", (q) => q.eq("projectId", args.projectId).eq("status", "draft"))
      .collect();
    const revisionByTaskId = new Map(draftRevisions.map((r) => [r.taskId, r]));

    // Build Maps
    const tasksByElement = new Map<string, typeof allTasks>();
    for (const task of allTasks) {
       if (task.elementId) {
           const list = tasksByElement.get(task.elementId) ?? [];
           list.push(task);
           tasksByElement.set(task.elementId, list);
       }
    }

    const materialLinesByTask = new Map<string, typeof allMaterialLines>();
    for (const line of allMaterialLines) {
        if (line.taskId) {
            const list = materialLinesByTask.get(line.taskId) ?? [];
            list.push(line);
            materialLinesByTask.set(line.taskId, list);
        }
    }
    const workLinesByTask = new Map<string, typeof allWorkLines>();
    for (const line of allWorkLines) {
        if (line.taskId) {
            const list = workLinesByTask.get(line.taskId) ?? [];
            list.push(line);
            workLinesByTask.set(line.taskId, list);
        }
    }

    // Transform
    const results = elements.map(element => {
        const elementTasks = tasksByElement.get(element._id) ?? [];
        const draft = element.currentDraftId ? draftById.get(element.currentDraftId) : null;

        const mappedTasks = elementTasks.map(task => {
            const materialLines = materialLinesByTask.get(task._id) ?? [];
            const workLines = workLinesByTask.get(task._id) ?? [];
            const materials = materialLines.map(l => ({
                id: l._id,
                name: l.itemName ?? "",
                qty: l.quantity ?? 0,
                unitCost: l.plannedUnitCost ?? 0,
                sectionKey: l.sectionKey,
                sectionLabelHe: l.sectionLabelHe,
            }));
            const labor = workLines.map(l => ({
                id: l._id,
                role: l.roleHe ?? "",
                qty: l.plannedQuantity ?? 0,
                rate: l.plannedUnitCost ?? 0,
                isManagement: l.isManagement ?? false,
                sectionKey: l.sectionKey,
                sectionLabelHe: l.sectionLabelHe,
            }));

            const revision = revisionByTaskId.get(task._id);

            return {
                id: task._id,
                title: task.title,
                description: task.description,
                status: task.status,
                priority: task.priority,
                category: task.category,
                startDate: task.startDate,
                endDate: task.endDate,
                dueDate: task.dueDate,
                estimatedMinutes: task.estimatedMinutes,
                stage: task.stage,
                workType: task.workType,
                workTypeLabelHe: task.workTypeLabelHe,
                plannedStartDate: task.plannedStartDate,
                plannedEndDate: task.plannedEndDate,
                checklist: task.checklist,
                accountingLinks: task.accountingLinks,
                assignee: task.assignee,
                dependencies: task.dependencies,
                materials,
                labor,
                // New fields
                isDraft: task.isDraft,
                draftOfTaskId: task.draftOfTaskId,
                draftRevisionId: revision?._id ?? task.draftRevisionId, // Prefer active revision
                draftPatch: revision?.patch, // The draft changes
                elementSubtaskId: task.elementSubtaskId,
                aiThreadId: task.aiThreadId,
                
                draftId: draft?._id,
                revisionNumber: draft?.revisionNumber,
            };
        });

        return {
            elementId: element._id,
            elementTitle: element.title,
            elementType: element.type,
            elementStatus: element.status,
            tasks: mappedTasks,
        };
    });

    const flatTasks = results.flatMap(r => r.tasks.map(t => ({
        ...t,
        elementId: r.elementId,
        elementTitle: r.elementTitle,
    })));

    return {
        elements: results,
        tasks: flatTasks,
        totals: {
            elementCount: results.length,
            taskCount: flatTasks.length,
        },
    };
  },
});
