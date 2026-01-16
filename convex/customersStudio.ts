import { query } from "./_generated/server";
import { v } from "convex/values";

export const listCustomersStudio = query({
  args: {
    status: v.optional(v.union(v.literal("active"), v.literal("archived"))),
    query: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    let q = ctx.db.query("customers");
    
    if (args.status) {
      q = q.withIndex("by_status", (q) => q.eq("status", args.status));
    }

    let customers = await q.collect();

    if (args.query) {
      const lowerQuery = args.query.toLowerCase();
      customers = customers.filter(c => 
        c.name.toLowerCase().includes(lowerQuery) || 
        (c.notes && c.notes.toLowerCase().includes(lowerQuery))
      );
    }

    // Enhance with contacts count and active projects count (basic check)
    // For list view, we might want to avoid N+1 queries if list is huge. 
    // But for studio scale (dozens/hundreds), it's acceptable or we can optimize later.
    const results = await Promise.all(customers.map(async (c) => {
      const contacts = await ctx.db
        .query("customerContacts")
        .withIndex("by_customer", (q) => q.eq("customerId", c._id))
        .collect();
        
      const projects = await ctx.db
        .query("projects")
        .withIndex("by_customerId", (q) => q.eq("customerId", c._id))
        .collect();

      return {
        _id: c._id,
        name: c.name,
        status: c.status,
        updatedAt: c.updatedAt,
        contactsCount: contacts.length,
        activeProjectsCount: projects.filter(p => p.status === "active").length,
      };
    }));

    return results.sort((a, b) => b.updatedAt - a.updatedAt);
  },
});

export const getCustomerStudio = query({
  args: { customerId: v.id("customers") },
  handler: async (ctx, args) => {
    const customer = await ctx.db.get(args.customerId);
    if (!customer) return null;

    const contacts = await ctx.db
      .query("customerContacts")
      .withIndex("by_customer", (q) => q.eq("customerId", args.customerId))
      .collect();

    return {
      ...customer,
      contacts,
    };
  },
});

export const listProjectsByCustomer = query({
  args: { 
    customerId: v.id("customers"),
    includeArchived: v.optional(v.boolean()) 
  },
  handler: async (ctx, args) => {
    const projects = await ctx.db
      .query("projects")
      .withIndex("by_customerId", (q) => q.eq("customerId", args.customerId))
      .collect();

    const filtered = args.includeArchived 
      ? projects 
      : projects.filter(p => p.status === "active");

    return filtered.map(p => ({
      _id: p._id,
      name: p.name,
      status: p.status,
      updatedAt: p.updatedAt,
      eventDate: p.eventDate,
    })).sort((a, b) => b.updatedAt - a.updatedAt);
  },
});
