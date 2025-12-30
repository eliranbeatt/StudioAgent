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
      tasks: Array<{ id: string; title: string; domain?: string }>;
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
      const tasksMap = draft?.workingSnapshot?.tasks?.byId ?? {};
      const tasks = Object.values<any>(tasksMap)
        .filter((task) => !task?.deletedAt)
        .map((task) => ({
          id: String(task.id ?? ""),
          title: String(task.title ?? "Untitled task"),
          domain: task.domain ? String(task.domain) : undefined,
        }))
        .filter((task) => task.id.length > 0);

      results.push({
        elementId: element._id,
        elementTitle: element.title,
        elementType: element.type,
        elementStatus: element.status,
        tasks,
      });
    }

    return {
      elements: results,
      totals: {
        elementCount: results.length,
        taskCount: results.reduce((sum, el) => sum + el.tasks.length, 0),
      },
    };
  },
});
