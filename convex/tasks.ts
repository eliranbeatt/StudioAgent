import { mutation, query } from './_generated/server'
import { api, internal } from './_generated/api'
import { v } from 'convex/values'
import { withDefaultStartDate } from './lib/dates'

const normalizeEstimatedFields = (fields: { estimatedHours?: number; estimatedMinutes?: number }) => {
  const nextFields = { ...fields }
  const hasHours = Object.prototype.hasOwnProperty.call(fields, 'estimatedHours')
  const hasMinutes = Object.prototype.hasOwnProperty.call(fields, 'estimatedMinutes')
  if (!hasHours && !hasMinutes) return nextFields
  const hours = Number.isFinite(fields.estimatedHours) ? Number(fields.estimatedHours) : undefined
  const minutes = Number.isFinite(fields.estimatedMinutes) ? Number(fields.estimatedMinutes) : undefined
  if (hours !== undefined && minutes === undefined) nextFields.estimatedMinutes = hours * 60
  if (minutes !== undefined && hours === undefined) nextFields.estimatedHours = minutes / 60
  if (hours === undefined) delete nextFields.estimatedHours
  if (minutes === undefined) delete nextFields.estimatedMinutes
  return nextFields
}

export const updateTaskStatus = mutation({
  args: {
    projectId: v.id("projects"),
    taskId: v.id("tasks"),
    status: v.string(),
  },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) throw new Error("Task not found");
    // Removed legacy checks for element association requiring draft flow

    await ctx.db.patch(args.taskId, {
      status: args.status,
      updatedAt: Date.now(),
    });

    await ctx.scheduler.runAfter(0, internal.projectsStage.recomputeStage, {
      projectId: args.projectId,
    });
    return { ok: true };
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
    const task = await ctx.db.get(taskId);
    if (!task) throw new Error("Task not found");
    let nextPatch: any = normalizeEstimatedFields(patch)
    if (Object.prototype.hasOwnProperty.call(patch, 'startDate')) {
      nextPatch.startDate = withDefaultStartDate(patch.startDate)
    }
    await ctx.db.patch(taskId, {
      ...nextPatch,
      updatedAt: Date.now(),
    });
    await ctx.scheduler.runAfter(0, internal.projectsStage.recomputeStage, {
      projectId: task.projectId,
    });
  },
});

export const createTask = mutation({
  args: {
    projectId: v.id("projects"),
    elementId: v.optional(v.id("elements")),
    title: v.string(),
    description: v.optional(v.string()),
    status: v.optional(v.string()),
    priority: v.optional(v.string()),
    category: v.optional(v.string()),
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
    estimatedHours: v.optional(v.number()),
    estimatedMinutes: v.optional(v.number()),
    assignee: v.optional(v.string()),
    assigneeIds: v.optional(v.array(v.id("employees"))),
    checklist: v.optional(v.any()), // flexible for now
  },
  handler: async (ctx, args) => {
    const { projectId, ...fields } = args;
    const normalizedFields = normalizeEstimatedFields(fields);
    await ctx.db.insert("tasks", {
      projectId,
      title: fields.title,
      ...normalizedFields,
      startDate: withDefaultStartDate(fields.startDate),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      createdBy: "human",
    } as any);
    await ctx.scheduler.runAfter(0, internal.projectsStage.recomputeStage, {
      projectId,
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

    // 4. (Drafts removed)

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

        const checklist = Array.isArray(task.checklist)
          ? task.checklist.map((item: any, index: number) => ({
            ...item,
            order: Number.isFinite(item.order) ? item.order : index,
            estimatedHours:
              item?.estimatedHours ??
              (Number.isFinite(item?.estimatedMinutes) ? item.estimatedMinutes / 60 : undefined),
          }))
          : task.checklist;

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
          estimatedHours:
            task.estimatedHours ?? (task.estimatedMinutes !== undefined ? task.estimatedMinutes / 60 : undefined),
          stage: task.stage,
          workType: task.workType,
          workTypeLabelHe: task.workTypeLabelHe,
          plannedStartDate: task.plannedStartDate,
          plannedEndDate: task.plannedEndDate,
          checklist,
          accountingLinks: task.accountingLinks,
          assignee: task.assignee,
          assigneeIds: task.assigneeIds,
          dependencies: task.dependencies,
          materials,
          labor,
          // Draft fields are no longer used
          isDraft: false,
          draftOfTaskId: undefined,
          draftRevisionId: undefined,
          draftPatch: undefined,
          elementSubtaskId: task.elementSubtaskId,
          aiThreadId: task.aiThreadId,
        };
      });

      const elementStatus = element.status === "drafting" ? "approvedForQuote" : element.status;
      return {
        elementId: element._id,
        elementTitle: element.title,
        elementType: element.type,
        elementStatus,
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
