
import { query } from "./_generated/server";
import { v } from "convex/values";

export const inspectMessages = query({
    args: {},
    handler: async (ctx) => {
        const conversationId = "ss76hxwdah96eze8a0ztxkpars7z6dsa";
        const messages = await ctx.db
            .query("agentMessages")
            .withIndex("by_conversation", (q) => q.eq("conversationId", conversationId as any))
            .collect();
        return messages;
    }
});
