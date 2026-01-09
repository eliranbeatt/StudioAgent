import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const getViewer = query({
    handler: async (ctx) => {
        // 1. Try Auth
        const identity = await ctx.auth.getUserIdentity();
        if (identity) {
            return await ctx.db
                .query("users")
                .withIndex("by_email", (q) => q.eq("email", identity.email!))
                .unique();
        }

        // 2. Fallback to Global Settings (for dev / no-auth mode)
        const settings = await ctx.db
            .query("appSettings")
            .withIndex("by_key", (q) => q.eq("key", "global"))
            .unique();

        return settings?.value ?? null;
    },
});

export const updatePreferredModel = mutation({
    args: {
        model: v.string(),
    },
    handler: async (ctx, args) => {
        const identity = await ctx.auth.getUserIdentity();

        if (identity) {
            // Auth Mode
            const user = await ctx.db
                .query("users")
                .withIndex("by_email", (q) => q.eq("email", identity.email!))
                .unique();

            if (user) {
                await ctx.db.patch(user._id, { preferredModel: args.model, updatedAt: Date.now() });
            } else {
                await ctx.db.insert("users", {
                    email: identity.email!,
                    displayName: identity.name,
                    preferredModel: args.model,
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                });
            }
        } else {
            // No Auth Mode -> Global Settings
            const existing = await ctx.db
                .query("appSettings")
                .withIndex("by_key", (q) => q.eq("key", "global"))
                .unique();

            if (existing) {
                await ctx.db.patch(existing._id, {
                    value: { ...existing.value, preferredModel: args.model }
                });
            } else {
                await ctx.db.insert("appSettings", {
                    key: "global",
                    value: { preferredModel: args.model }
                });
            }
        }
    },
});
