
import { query } from "./_generated/server";
import { v } from "convex/values";

export const listAllSkills = query({
    args: {},
    handler: async (ctx) => {
        return await ctx.db.query("skills").collect();
    },
});
