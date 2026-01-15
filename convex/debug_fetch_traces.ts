
import { query } from "./_generated/server";
import { v } from "convex/values";

export const getRecentSkillRuns = query({
    args: { limit: v.optional(v.number()) },
    handler: async (ctx, args) => {
        // Hardcode limit to 10 for debugging
        const limit = 10;
        const runs = await ctx.db.query("skillRuns").order("desc").take(limit);
        return runs.map(r => ({
            id: r._id,
            skillId: r.skillId,
            status: r.status,
            inputParams: r.inputParams,
            createdAtPretty: new Date(r.createdAt).toISOString()
        }));
    },
});
