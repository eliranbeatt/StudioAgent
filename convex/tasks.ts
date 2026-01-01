import { query } from "./_generated/server";
import { v } from "convex/values";

export const listForProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const elements = await ctx.db
      .query("elements")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();

    const results: Array<{
      elementId: string;
      elementTitle: string;
      elementType: string;
      elementStatus: string;
      draftId?: string;
      revisionNumber?: number;
      tasks: Array<{
        id: string;
        title: string;
        description?: string;
        domain?: string;
        status?: string;
        priority?: string;
        category?: string;
        startDate?: string;
        endDate?: string;
        estimatedMinutes?: number;
        dependencies?: string[];
        steps?: string[];
        subtasks?: Array<{ id?: string; title?: string; status?: string }>;
        assignee?: string;
        photos?: Array<{ url?: string; label?: string }>;
        materials?: Array<{
          id: string;
          name: string;
          qty: number;
          unitCost: number;
          actualQty?: number;
          actualUnitCost?: number;
        }>;
        labor?: Array<{
          id: string;
          role: string;
          qty: number;
          rate: number;
          actualQty?: number;
          actualRate?: number;
        }>;
      }>;
    }> = [];

    const flatTasks: Array<{
      id: string;
      title: string;
      description?: string;
      domain?: string;
      status?: string;
      priority?: string;
      category?: string;
      startDate?: string;
      endDate?: string;
      estimatedMinutes?: number;
      dependencies?: string[];
      steps?: string[];
      subtasks?: Array<{ id?: string; title?: string; status?: string }>;
      assignee?: string;
      photos?: Array<{ url?: string; label?: string }>;
      materials?: Array<{
        id: string;
        name: string;
        qty: number;
        unitCost: number;
        actualQty?: number;
        actualUnitCost?: number;
      }>;
      labor?: Array<{
        id: string;
        role: string;
        qty: number;
        rate: number;
        actualQty?: number;
        actualRate?: number;
      }>;
      elementId: string;
      elementTitle: string;
      draftId?: string;
      revisionNumber?: number;
    }> = [];

    for (const element of elements) {
      if (!element.currentDraftId) {
        results.push({
          elementId: element._id,
          elementTitle: element.title,
          elementType: element.type,
          elementStatus: element.status,
          tasks: [],
        });
        continue;
      }

      const draft = await ctx.db.get(element.currentDraftId);
      const snapshot = draft?.workingSnapshot ?? {};
      const tasksMap = snapshot?.tasks?.byId ?? {};
      const materialsMap = snapshot?.materials?.byId ?? {};
      const laborMap = snapshot?.labor?.byId ?? {};

      const materialsByTask = new Map<string, any[]>();
      for (const [materialId, materialLine] of Object.entries<any>(materialsMap)) {
        if (materialLine?.deletedAt) continue;
        const linkedTaskIds = materialLine?.links?.taskIds ?? [];
        for (const taskId of linkedTaskIds) {
          const list = materialsByTask.get(taskId) ?? [];
          list.push({
            id: String(materialId),
            name: String(materialLine?.name ?? "Material"),
            qty: Number(materialLine?.qty ?? 0),
            unitCost: Number(materialLine?.unitCost ?? 0),
            actualQty:
              materialLine?.actualQty === undefined ? undefined : Number(materialLine?.actualQty),
            actualUnitCost:
              materialLine?.actualUnitCost === undefined
                ? undefined
                : Number(materialLine?.actualUnitCost),
          });
          materialsByTask.set(taskId, list);
        }
      }

      const laborByTask = new Map<string, any[]>();
      for (const [laborId, laborLine] of Object.entries<any>(laborMap)) {
        if (laborLine?.deletedAt) continue;
        const linkedTaskIds = laborLine?.links?.taskIds ?? [];
        for (const taskId of linkedTaskIds) {
          const list = laborByTask.get(taskId) ?? [];
          list.push({
            id: String(laborId),
            role: String(laborLine?.role ?? "Labor"),
            qty: Number(laborLine?.qty ?? 0),
            rate: Number(laborLine?.rate ?? 0),
            actualQty:
              laborLine?.actualQty === undefined ? undefined : Number(laborLine?.actualQty),
            actualRate:
              laborLine?.actualRate === undefined ? undefined : Number(laborLine?.actualRate),
          });
          laborByTask.set(taskId, list);
        }
      }

      const tasks = Object.values<any>(tasksMap)
        .filter((task) => !task?.deletedAt)
        .map((task) => ({
          id: String(task.id ?? ""),
          title: String(task.title ?? "Untitled task"),
          description: task.description ? String(task.description) : undefined,
          domain: task.domain ? String(task.domain) : undefined,
          status: task.status ? String(task.status) : undefined,
          priority: task.priority ? String(task.priority) : undefined,
          category: task.category ? String(task.category) : undefined,
          startDate: task.startDate ? String(task.startDate) : undefined,
          endDate: task.endDate ? String(task.endDate) : undefined,
          estimatedMinutes:
            task.estimatedMinutes === undefined ? undefined : Number(task.estimatedMinutes),
          dependencies: Array.isArray(task.dependencies)
            ? task.dependencies.map((dep: any) => String(dep))
            : undefined,
          steps: Array.isArray(task.steps) ? task.steps.map((step: any) => String(step)) : undefined,
          subtasks: Array.isArray(task.subtasks)
            ? task.subtasks.map((subtask: any) => ({
                id: subtask?.id ? String(subtask.id) : undefined,
                title: subtask?.title ? String(subtask.title) : undefined,
                status: subtask?.status ? String(subtask.status) : undefined,
              }))
            : undefined,
          assignee: task.assignee ? String(task.assignee) : undefined,
          photos: normalizePhotos(task?.photos ?? task?.images ?? task?.media),
        }))
        .filter((task) => task.id.length > 0);

      const tasksWithLinks = tasks.map((task) => ({
        ...task,
        materials: materialsByTask.get(task.id) ?? [],
        labor: laborByTask.get(task.id) ?? [],
      }));

      for (const task of tasksWithLinks) {
        flatTasks.push({
          ...task,
          elementId: element._id,
          elementTitle: element.title,
          draftId: draft?._id,
          revisionNumber: draft?.revisionNumber,
        });
      }

      results.push({
        elementId: element._id,
        elementTitle: element.title,
        elementType: element.type,
        elementStatus: element.status,
        draftId: draft?._id,
        revisionNumber: draft?.revisionNumber,
        tasks: tasksWithLinks,
      });
    }

    return {
      elements: results,
      tasks: flatTasks,
      totals: {
        elementCount: results.length,
        taskCount: results.reduce((sum, el) => sum + el.tasks.length, 0),
      },
    };
  },
});

function normalizePhotos(input: any) {
  if (!Array.isArray(input)) return undefined;
  const photos = input
    .map((item) => {
      if (typeof item === "string") {
        return { url: item };
      }
      if (item && typeof item === "object") {
        const url = item.url ?? item.src ?? item.path;
        if (!url) return null;
        return { url: String(url), label: item.label ? String(item.label) : undefined };
      }
      return null;
    })
    .filter(Boolean) as Array<{ url?: string; label?: string }>;
  return photos.length > 0 ? photos : undefined;
}
