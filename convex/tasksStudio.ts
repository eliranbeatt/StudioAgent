import { query } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";

export const listGlobal = query({
  args: {
    projectId: v.optional(v.id("projects")),
    assigneeId: v.optional(v.string()), // Can be employee ID or legacy string
    workType: v.optional(v.string()),
    status: v.optional(v.string()),
    projectStatus: v.optional(v.string()),
    dueFrom: v.optional(v.number()),
    dueTo: v.optional(v.number()),
    search: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let tasks;

    // Optimization: Use index if a strong filter is present
    if (args.projectId) {
      tasks = await ctx.db.query("tasks")
        .withIndex("by_project", (q) => q.eq("projectId", args.projectId!))
        .collect();
    } else if (args.status) {
      tasks = await ctx.db.query("tasks")
        .withIndex("by_status", (q) => q.eq("status", args.status!))
        .collect();
    } else if (args.workType) {
      tasks = await ctx.db.query("tasks")
        .withIndex("by_workType", (q) => q.eq("workType", args.workType as any))
        .collect();
    } else if (args.dueFrom) {
       tasks = await ctx.db.query("tasks")
        .withIndex("by_dueDate", (q) => q.gte("dueDate", args.dueFrom!))
        .collect();
    } else {
       tasks = await ctx.db.query("tasks").collect();
    }

    // In-memory filtering for the rest
    if (args.projectId) {
      // Already filtered by index if it was the primary choice, but safe to filter again if another index was picked (unlikely here)
    }

    if (args.status) {
      tasks = tasks.filter(t => t.status === args.status);
    }
    
    if (args.workType) {
      tasks = tasks.filter(t => t.workType === args.workType);
    }

    if (args.assigneeId) {
      // Check both string assignee and assigneeIds array
      tasks = tasks.filter(t => 
        t.assignee === args.assigneeId || 
        t.assigneeIds?.includes(args.assigneeId as any)
      );
    }

    if (args.dueFrom) {
      tasks = tasks.filter(t => t.dueDate && t.dueDate >= args.dueFrom!);
    }
    if (args.dueTo) {
      tasks = tasks.filter(t => t.dueDate && t.dueDate <= args.dueTo!);
    }

    if (args.search) {
      const lower = args.search.toLowerCase();
      tasks = tasks.filter(t => t.title.toLowerCase().includes(lower));
    }

    // Sort by Due Date (soonest first) -> Updated At (newest first)
    tasks.sort((a, b) => {
      const dueA = a.dueDate ?? Number.MAX_SAFE_INTEGER;
      const dueB = b.dueDate ?? Number.MAX_SAFE_INTEGER;
      if (dueA !== dueB) return dueA - dueB;
      return (b.updatedAt ?? 0) - (a.updatedAt ?? 0);
    });

    if (args.limit) {
      tasks = tasks.slice(0, args.limit);
    }

    // Join with Projects to get context
    // Fetch unique projects needed
    const projectIds = Array.from(new Set(tasks.map(t => t.projectId)));
    const projectsMap = new Map();
    await Promise.all(projectIds.map(async (pid) => {
      const p = await ctx.db.get(pid as Id<"projects">);
      if (p) projectsMap.set(pid, p);
    }));

    const results = tasks.map(t => {
      const p = projectsMap.get(t.projectId);
      return {
        ...t,
        projectName: p?.name ?? "Unknown",
        customerName: p?.customerName ?? "Unknown",
        customerId: p?.customerId,
        projectStatus: p?.status,
      };
    });

    if (args.projectStatus) {
      return results.filter(t => t.projectStatus === args.projectStatus);
    }

    return results;
  },
});
