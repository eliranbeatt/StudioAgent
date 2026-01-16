import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";

export const runEstimator = mutation({
  args: {
    projectId: v.id("projects"),
  },
  handler: async (ctx, args) => {
    // 1. Fetch all tasks for project
    const tasks = await ctx.db
        .query("tasks")
        .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
        .collect();
    
    // 2. Filter tasks needing estimate or dependency update
    // Simple heuristic: if estimate is missing or 0
    const needsEstimate = tasks.filter((t) => {
        const hours =
            t.estimatedHours ??
            (t.estimatedMinutes !== undefined ? t.estimatedMinutes / 60 : undefined);
        return !hours || hours === 0;
    });
    
    if (needsEstimate.length === 0) return { count: 0 };

    // 3. Logic (Shared with agent.ts ideally, but inlined here for "Task Tab" mode)
    // We will apply changes to taskRevisions (Draft Mode)
    
    let count = 0;
    
    for (const task of needsEstimate) {
        const est = estimateHoursForTask(task);
        
        // Check for existing draft
        const existingDraft = await ctx.db
            .query("taskRevisions")
            .withIndex("by_task", (q) => q.eq("taskId", task._id))
            .filter((q) => q.eq(q.field("status"), "draft"))
            .first();

        const patch = { estimatedHours: est };

        if (existingDraft) {
             await ctx.db.patch(existingDraft._id, {
                patch: { ...existingDraft.patch, ...patch },
                updatedAt: Date.now(),
                source: "agent",
                agentRunId: "estimator-v1"
             });
        } else {
             await ctx.db.insert("taskRevisions", {
                projectId: args.projectId,
                taskId: task._id,
                baseVersionHash: "v1",
                patch,
                source: "agent",
                agentRunId: "estimator-v1",
                status: "draft",
                createdAt: Date.now(),
                updatedAt: Date.now(),
             });
        }
        count++;
    }

    return { count };
  },
});



function estimateHoursForTask(task: any) {
  const title = String(task?.title ?? "").toLowerCase();
  const category = String(task?.category ?? "").toLowerCase();

  const domainHours: Record<string, number> = {
    planning: 2,
    design: 3,
    procurement: 1.5,
    fabrication: 4,
    finishing: 3,
    print: 2,
    installation: 4,
    logistics: 1.5,
    qa: 1,
    admin: 1,
  };

  const matchKeyword = (keywords: string[]) =>
    keywords.some((keyword) => title.includes(keyword));

  if (matchKeyword(["install", "setup", "on-site"])) return 4;
  if (matchKeyword(["fabricate", "build", "assembly", "joinery"])) return 4;
  if (matchKeyword(["finish", "surface", "paint", "sand"])) return 3;
  if (matchKeyword(["design", "draw", "concept", "moodboard"])) return 3;
  if (matchKeyword(["procure", "vendor", "order", "purchase"])) return 1.5;
  if (matchKeyword(["qa", "quality", "test"])) return 1;
  if (matchKeyword(["pack", "ship", "logistics", "transport"])) return 1.5;

  return domainHours[category] ?? 1.5;
}
