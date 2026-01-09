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
    const needsEstimate = tasks.filter(t => !t.estimatedMinutes || t.estimatedMinutes === 0);
    
    if (needsEstimate.length === 0) return { count: 0 };

    // 3. Logic (Shared with agent.ts ideally, but inlined here for "Task Tab" mode)
    // We will apply changes to taskRevisions (Draft Mode)
    
    let count = 0;
    
    for (const task of needsEstimate) {
        const est = estimateMinutesForTask(task);
        
        // Check for existing draft
        const existingDraft = await ctx.db
            .query("taskRevisions")
            .withIndex("by_task", (q) => q.eq("taskId", task._id))
            .filter((q) => q.eq(q.field("status"), "draft"))
            .first();

        const patch = { estimatedMinutes: est };

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



function estimateMinutesForTask(task: any) {
  const title = String(task?.title ?? "").toLowerCase();
  const category = String(task?.category ?? "").toLowerCase();

  const domainMinutes: Record<string, number> = {
    planning: 120,
    design: 180,
    procurement: 90,
    fabrication: 240,
    finishing: 180,
    print: 120,
    installation: 240,
    logistics: 90,
    qa: 60,
    admin: 60,
  };

  const matchKeyword = (keywords: string[]) =>
    keywords.some((keyword) => title.includes(keyword));

  if (matchKeyword(["install", "setup", "on-site"])) return 240;
  if (matchKeyword(["fabricate", "build", "assembly", "joinery"])) return 240;
  if (matchKeyword(["finish", "surface", "paint", "sand"])) return 180;
  if (matchKeyword(["design", "draw", "concept", "moodboard"])) return 180;
  if (matchKeyword(["procure", "vendor", "order", "purchase"])) return 90;
  if (matchKeyword(["qa", "quality", "test"])) return 60;
  if (matchKeyword(["pack", "ship", "logistics", "transport"])) return 90;

  return domainMinutes[category] ?? 90;
}
