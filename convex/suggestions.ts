import { query } from "./_generated/server";
import { v } from "convex/values";

export const listSuggested = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("suggestedElements")
      .withIndex("by_project_status", (q) =>
        q.eq("projectId", args.projectId).eq("status", "pending")
      )
      .collect();
  },
});