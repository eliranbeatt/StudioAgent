import { query } from "./_generated/server";
import { v } from "convex/values";

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

    // 3. Fetch AccountingLines (for materials/labor linked to tasks)
    const allLines = await ctx.db
      .query("accountingLines")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();

    // Build Maps
    const tasksByElement = new Map<string, typeof allTasks>();
    for (const task of allTasks) {
       if (task.elementId) {
           const list = tasksByElement.get(task.elementId) ?? [];
           list.push(task);
           tasksByElement.set(task.elementId, list);
       }
    }

    const linesByTask = new Map<string, typeof allLines>();
    for (const line of allLines) {
        if (line.taskId) {
            const list = linesByTask.get(line.taskId) ?? [];
            list.push(line);
            linesByTask.set(line.taskId, list);
        }
    }

    // Transform
    const results = elements.map(element => {
        const elementTasks = tasksByElement.get(element._id) ?? [];
        const mappedTasks = elementTasks.map(task => {
            const lines = linesByTask.get(task._id) ?? [];
            const materials = lines.filter(l => l.type === "material").map(l => ({
                id: l._id,
                name: l.title,
                qty: l.qty ?? 0,
                unitCost: l.unitCost ?? 0,
            }));
            const labor = lines.filter(l => l.type === "labor").map(l => ({
                id: l._id,
                role: l.title,
                qty: l.qty ?? 0,
                rate: l.unitCost ?? 0, // Using unitCost as rate
            }));

            return {
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
                dependencies: task.dependencies,
                materials,
                labor,
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