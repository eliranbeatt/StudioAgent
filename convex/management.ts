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

export const searchVendors = query({
  args: { query: v.string() },
  handler: async (ctx, args) => {
    const all = await ctx.db.query("vendors").collect();
    if (!args.query) return all;
    const lowerQ = args.query.toLowerCase();
    return all.filter((vendor) => vendor.name.toLowerCase().includes(lowerQ));
  },
});

export const getLaborDefaults = query({
  args: { role: v.string() },
  handler: async (ctx, args) => {
    const lowerRole = args.role.toLowerCase();
    const employees = await ctx.db.query("employees").collect();
    return employees.filter((emp) => emp.role.toLowerCase().includes(lowerRole));
  },
});

export const getBestPrice = query({
  args: {
    catalogId: v.id("materialCatalog"),
    vendorId: v.optional(v.id("vendors")),
    unit: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const observations = await ctx.db
      .query("priceObservations")
      .withIndex("by_catalog", (q) => q.eq("catalogId", args.catalogId))
      .order("desc")
      .take(50);

    const unit = args.unit?.toLowerCase();
    const match = observations.find((obs) => {
      if (args.vendorId && obs.vendorId !== args.vendorId) return false;
      if (unit && obs.sourceRef?.unit && String(obs.sourceRef.unit).toLowerCase() !== unit) return false;
      return true;
    });

    if (!match) {
      return { found: false };
    }

    return {
      found: true,
      price: match.unitCost,
      currency: match.currency,
      observedAt: match.observedAt,
      vendorId: match.vendorId,
      source: match.source,
      sourceRef: match.sourceRef,
    };
  },
});

export const getPreferredForProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const observations = await ctx.db.query("priceObservations").order("desc").take(200);
    const vendorCounts = new Map<string, number>();
    const itemCounts = new Map<string, number>();

    for (const obs of observations) {
      const projectRef = obs.sourceRef?.projectId;
      if (projectRef && projectRef !== args.projectId) {
        continue;
      }
      if (obs.vendorId) {
        vendorCounts.set(obs.vendorId, (vendorCounts.get(obs.vendorId) ?? 0) + 1);
      }
      itemCounts.set(obs.catalogId, (itemCounts.get(obs.catalogId) ?? 0) + 1);
    }

    const topVendors = Array.from(vendorCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([id]) => id);

    const topItems = Array.from(itemCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([id]) => id);

    const vendors = await Promise.all(topVendors.map((id) => ctx.db.get(id as any)));
    const items = await Promise.all(topItems.map((id) => ctx.db.get(id as any)));

    return {
      topVendors: vendors.filter(Boolean),
      topItems: items.filter(Boolean),
    };
  },
});

// ==========================
// PRICE OBSERVATIONS
// ==========================

export const listPriceObservations = query({
  handler: async (ctx) => {
    return await ctx.db.query("priceObservations").order("desc").take(200);
  },
});

export const createPriceObservation = mutation({
  args: {
    catalogId: v.id("materialCatalog"),
    vendorId: v.optional(v.id("vendors")),
    unitCost: v.number(),
    currency: v.string(),
    unit: v.optional(v.string()),
    source: v.union(
      v.literal("purchase"),
      v.literal("manual"),
      v.literal("approvedElement")
    ),
    sourceRef: v.any(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("priceObservations", {
      catalogId: args.catalogId,
      vendorId: args.vendorId,
      unitCost: args.unitCost,
      currency: args.currency,
      observedAt: Date.now(),
      source: args.source,
      sourceRef: { ...args.sourceRef, unit: args.unit },
    });
  },
});

// ==========================
// PURCHASES / PROCUREMENT LOG
// ==========================

export const listPurchases = query({
  handler: async (ctx) => {
    return await ctx.db.query("purchases").withIndex("by_date", (q) => q).order("desc").take(200);
  },
});

export const createPurchase = mutation({
  args: {
    projectId: v.optional(v.id("projects")),
    vendorId: v.id("vendors"),
    currency: v.string(),
    status: v.union(v.literal("recorded"), v.literal("paid"), v.literal("cancelled")),
    lineItems: v.array(v.any()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const totalAmount = args.lineItems.reduce(
      (sum, line) => sum + Number(line.lineTotal ?? 0),
      0
    );

    const purchaseId = await ctx.db.insert("purchases", {
      projectId: args.projectId,
      vendorId: args.vendorId,
      date: Date.now(),
      currency: args.currency,
      totalAmount,
      status: args.status,
      lineItems: args.lineItems,
      notes: args.notes,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    for (const line of args.lineItems) {
      if (!line.catalogId) continue;
      await ctx.db.insert("priceObservations", {
        catalogId: line.catalogId,
        vendorId: args.vendorId,
        unitCost: Number(line.unitPrice ?? 0),
        currency: args.currency,
        observedAt: Date.now(),
        source: "purchase",
        sourceRef: {
          projectId: args.projectId,
          purchaseId,
          unit: line.unit,
        },
      });
    }

    return purchaseId;
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

// ==========================
// PROPOSED UPDATES
// ==========================

export const listProposed = query({
  handler: async (ctx) => {
    return await ctx.db
      .query("proposedUpdates")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .order("desc")
      .collect();
  },
});

export const proposeUpdate = mutation({
  args: {
    entityType: v.union(
      v.literal("Vendor"),
      v.literal("Person"),
      v.literal("CatalogItem"),
      v.literal("PriceObservation"),
      v.literal("NormalizationMapping")
    ),
    payload: v.any(),
    reason: v.string(),
    createdFrom: v.any(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("proposedUpdates", {
      entityType: args.entityType,
      payload: args.payload,
      reason: args.reason,
      createdFrom: args.createdFrom,
      status: "pending",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

export const acceptProposed = mutation({
  args: { proposedId: v.id("proposedUpdates") },
  handler: async (ctx, args) => {
    const proposal = await ctx.db.get(args.proposedId);
    if (!proposal) throw new Error("Proposal not found");
    if (proposal.status !== "pending") throw new Error("Proposal already resolved");

    await ctx.db.patch(args.proposedId, {
      status: "accepted",
      resolution: { resolvedAt: Date.now() },
      updatedAt: Date.now(),
    });

    return { ok: true };
  },
});

export const rejectProposed = mutation({
  args: { proposedId: v.id("proposedUpdates") },
  handler: async (ctx, args) => {
    const proposal = await ctx.db.get(args.proposedId);
    if (!proposal) throw new Error("Proposal not found");
    if (proposal.status !== "pending") throw new Error("Proposal already resolved");

    await ctx.db.patch(args.proposedId, {
      status: "rejected",
      resolution: { resolvedAt: Date.now() },
      updatedAt: Date.now(),
    });

    return { ok: true };
  },
});
