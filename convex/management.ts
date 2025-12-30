import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// ==========================
// VENDORS
// ==========================

export const createVendor = mutation({
  args: {
    name: v.string(),
    type: v.string(),
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("vendors", {
      name: args.name,
      type: args.type,
      phone: args.phone,
      email: args.email,
      active: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

export const listVendors = query({
  handler: async (ctx) => {
    return await ctx.db.query("vendors").order("desc").collect();
  },
});

// ==========================
// CATALOG
// ==========================

export const createCatalogItem = mutation({
  args: {
    canonicalName: v.string(),
    unit: v.string(),
    tags: v.array(v.string()),
    typicalVendorId: v.optional(v.id("vendors")),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("materialCatalog", {
      canonicalName: args.canonicalName,
      unit: args.unit,
      tags: args.tags,
      synonyms: [],
      typicalVendorId: args.typicalVendorId,
      active: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

export const searchCatalog = query({
  args: { query: v.string() },
  handler: async (ctx, args) => {
    // Simple search for now. Convex supports full text search but needs index config.
    // We'll just do a basic scan or exact match for prototype.
    // In production: use .withSearchIndex("search_body", ...)
    
    // For now, return all and filter client side or basic check
    const all = await ctx.db.query("materialCatalog").collect();
    if (!args.query) return all;
    
    const lowerQ = args.query.toLowerCase();
    return all.filter(item => item.canonicalName.toLowerCase().includes(lowerQ));
  },
});

// ==========================
// EMPLOYEES
// ==========================

export const createEmployee = mutation({
    args: {
        displayName: v.string(),
        role: v.string(),
        defaultDayRate: v.number(),
    },
    handler: async (ctx, args) => {
        return await ctx.db.insert("employees", {
            displayName: args.displayName,
            role: args.role,
            defaultDayRate: args.defaultDayRate,
            active: true,
            createdAt: Date.now(),
            updatedAt: Date.now(),
        })
    }
})

export const listEmployees = query({
    handler: async (ctx) => {
        return await ctx.db.query("employees").collect();
    }
})
