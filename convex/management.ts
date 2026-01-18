import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { normalizeName } from "./lib/normalize";

type CatalogAttributeDef = {
  key: string;
  labelHe: string;
  type: "number" | "enum" | "boolean" | "text";
  unit?: string;
  required?: boolean;
  enumOptions?: Array<{ value: string; labelHe: string }>;
  commonValues?: Array<any>;
};

function normalizeAttributeValue(def: CatalogAttributeDef, value: any) {
  if (def.type === "number") {
    const num = Number(value);
    if (!Number.isFinite(num)) return null;
    const asString = Number.isInteger(num) ? String(num) : String(num);
    return { normalized: asString, raw: num };
  }
  if (def.type === "boolean") {
    if (typeof value === "boolean") return { normalized: value ? "true" : "false", raw: value };
    if (value === "true" || value === "false") {
      const parsed = value === "true";
      return { normalized: parsed ? "true" : "false", raw: parsed };
    }
    return null;
  }
  const text = typeof value === "string" ? value.trim() : String(value ?? "").trim();
  if (!text) return null;
  if (def.type === "enum") {
    const allowed = (def.enumOptions ?? []).map((opt) => opt.value);
    if (allowed.length > 0 && !allowed.includes(text)) return null;
  }
  return { normalized: text.toLowerCase(), raw: text };
}

function buildNormalizedKey(templateId: string, defs: CatalogAttributeDef[], attributes: Record<string, any>) {
  const parts = [`template:${templateId}`];
  for (const def of defs) {
    const value = attributes[def.key];
    const normalized = normalizeAttributeValue(def, value);
    if (!normalized) continue;
    parts.push(`${def.key}=${normalized.normalized}`);
  }
  return parts.join("|");
}

function validateAttributes(defs: CatalogAttributeDef[], attributes: Record<string, any>) {
  for (const def of defs) {
    const value = attributes[def.key];
    if (def.required && (value === undefined || value === null || value === "")) {
      throw new Error(`Missing required attribute: ${def.key}`);
    }
    if (value === undefined || value === null || value === "") continue;
    const normalized = normalizeAttributeValue(def, value);
    if (!normalized) {
      throw new Error(`Invalid value for ${def.key}`);
    }
  }
}

function pricingModelFromUom(uomCode?: string) {
  if (!uomCode) return "per_unit" as const;
  if (uomCode === "sheet") return "per_sheet" as const;
  if (uomCode === "m") return "per_m" as const;
  if (uomCode === "m2" || uomCode === "sqm") return "per_m2" as const;
  if (uomCode === "pack") return "per_pack" as const;
  return "per_unit" as const;
}

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
// CATALOG (TEMPLATES / VARIANTS / UOMS)
// ==========================

export const createCategory = mutation({
  args: {
    nameHe: v.string(),
    parentId: v.optional(v.id("materialCategories")),
    sortOrder: v.optional(v.number()),
    icon: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("materialCategories", {
      nameHe: args.nameHe,
      parentId: args.parentId,
      sortOrder: args.sortOrder,
      icon: args.icon,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

export const listCategories = query({
  handler: async (ctx) => {
    return await ctx.db.query("materialCategories").collect();
  },
});

export const createUom = mutation({
  args: {
    code: v.union(
      v.literal("ea"),
      v.literal("sheet"),
      v.literal("m"),
      v.literal("m2"),
      v.literal("sqm"),
      v.literal("m3"),
      v.literal("kg"),
      v.literal("l"),
      v.literal("set"),
      v.literal("box"),
      v.literal("roll"),
      v.literal("pack"),
      v.literal("job"),
      v.literal("hour")
    ),
    labelHe: v.string(),
    baseDimension: v.union(
      v.literal("count"),
      v.literal("length"),
      v.literal("area"),
      v.literal("volume"),
      v.literal("weight")
    ),
    toBaseFactor: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("uoms", {
      code: args.code,
      labelHe: args.labelHe,
      baseDimension: args.baseDimension,
      toBaseFactor: args.toBaseFactor,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

export const listUoms = query({
  handler: async (ctx) => {
    return await ctx.db.query("uoms").collect();
  },
});

export const createTemplate = mutation({
  args: {
    nameHe: v.string(),
    categoryId: v.optional(v.id("materialCategories")),
    kind: v.optional(
      v.union(
        v.literal("material"),
        v.literal("print_service"),
        v.literal("cut_service"),
        v.literal("rental"),
        v.literal("shipping"),
        v.literal("other_service")
      )
    ),
    defaultUomCode: v.optional(
      v.union(
        v.literal("ea"),
        v.literal("sheet"),
        v.literal("m"),
        v.literal("m2"),
        v.literal("sqm"),
        v.literal("m3"),
        v.literal("kg"),
        v.literal("l"),
        v.literal("set"),
        v.literal("box"),
        v.literal("roll"),
        v.literal("pack"),
        v.literal("job"),
        v.literal("hour")
      )
    ),
    searchKeywords: v.optional(v.array(v.string())),
    attributeDefs: v.optional(v.array(v.any())),
    notesHe: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    let categoryId = args.categoryId;
    if (!categoryId) {
      const existing = await ctx.db
        .query("materialCategories")
        .filter((q) => q.eq(q.field("nameHe"), "Uncategorized"))
        .first();
      if (existing) {
        categoryId = existing._id;
      } else {
        categoryId = await ctx.db.insert("materialCategories", {
          nameHe: "Uncategorized",
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
      }
    }

    const attributeDefs = Array.isArray(args.attributeDefs)
      ? (args.attributeDefs as CatalogAttributeDef[])
      : [];

    return await ctx.db.insert("materialTemplates", {
      categoryId,
      nameHe: args.nameHe,
      kind: args.kind ?? "material",
      defaultUomCode: args.defaultUomCode ?? "ea",
      searchKeywords: args.searchKeywords ?? [args.nameHe],
      attributeDefs,
      notesHe: args.notesHe,
      active: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

export const searchTemplates = query({
  args: { query: v.string() },
  handler: async (ctx, args) => {
    const all = await ctx.db.query("materialTemplates").collect();
    if (!args.query) return all;

    const lowerQ = args.query.toLowerCase();
    return all.filter((item) => item.nameHe.toLowerCase().includes(lowerQ));
  },
});

export const listVariants = query({
  args: { templateId: v.id("materialTemplates") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("materialVariants")
      .withIndex("by_template", (q) => q.eq("templateId", args.templateId))
      .collect();
  },
});

export const listVariantsAll = query({
  handler: async (ctx) => {
    return await ctx.db.query("materialVariants").collect();
  },
});

export const createVariant = mutation({
  args: {
    templateId: v.id("materialTemplates"),
    labelHe: v.string(),
    attributes: v.optional(v.any()),
    normalizedKey: v.optional(v.string()),
    uomCode: v.optional(
      v.union(
        v.literal("ea"),
        v.literal("sheet"),
        v.literal("m"),
        v.literal("m2"),
        v.literal("sqm"),
        v.literal("m3"),
        v.literal("kg"),
        v.literal("l"),
        v.literal("set"),
        v.literal("box"),
        v.literal("roll"),
        v.literal("pack"),
        v.literal("job"),
        v.literal("hour")
      )
    ),
    thicknessMm: v.optional(v.number()),
    widthMm: v.optional(v.number()),
    heightMm: v.optional(v.number()),
    lengthMm: v.optional(v.number()),
    notesHe: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const template = await ctx.db.get(args.templateId);
    if (!template) throw new Error("Template not found");

    const attributes = (args.attributes ?? {}) as Record<string, any>;
    const defs = (template.attributeDefs ?? []) as CatalogAttributeDef[];
    validateAttributes(defs, attributes);

    const normalizedKey =
      args.normalizedKey ??
      buildNormalizedKey(String(args.templateId), defs, attributes);

    return await ctx.db.insert("materialVariants", {
      templateId: args.templateId,
      labelHe: args.labelHe,
      attributes,
      normalizedKey,
      thicknessMm: args.thicknessMm,
      widthMm: args.widthMm,
      heightMm: args.heightMm,
      lengthMm: args.lengthMm,
      uomCode: args.uomCode,
      status: "active",
      notesHe: args.notesHe,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

// ==========================
// SYNONYMS
// ==========================

export const listSynonyms = query({
  handler: async (ctx) => {
    return await ctx.db.query("catalogSynonyms").collect();
  },
});

export const createSynonym = mutation({
  args: {
    phrase: v.string(),
    templateId: v.id("materialTemplates"),
    boost: v.optional(v.number()),
    notesHe: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const trimmed = args.phrase.trim();
    if (!trimmed) throw new Error("Phrase is required");
    return await ctx.db.insert("catalogSynonyms", {
      phrase: trimmed,
      templateId: args.templateId,
      boost: args.boost,
      notesHe: args.notesHe,
      createdAt: Date.now(),
    });
  },
});

export const resolveTemplateByPhrase = query({
  args: { phrase: v.string() },
  handler: async (ctx, args) => {
    const trimmed = args.phrase.trim();
    if (!trimmed) return null;
    const matches = await ctx.db
      .query("catalogSynonyms")
      .withIndex("by_phrase", (q) => q.eq("phrase", trimmed))
      .collect();
    if (matches.length === 0) return null;
    const sorted = matches.sort((a, b) => (b.boost ?? 0) - (a.boost ?? 0));
    return sorted[0];
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
    variantId: v.id("materialVariants"),
    vendorId: v.optional(v.id("vendors")),
    freshnessDays: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    let freshnessDays = args.freshnessDays;
    if (!freshnessDays) {
      const prefs = await ctx.db
        .query("procurementPrefs")
        .withIndex("by_key", (q) => q.eq("key", "global"))
        .first();
      const global = prefs?.value ?? {};
      freshnessDays = Number(global?.priceFreshnessDaysDefault ?? 30);
    }

    const freshnessMs = Math.max(0, freshnessDays) * 24 * 60 * 60 * 1000;
    const cutoff = now - freshnessMs;
    const records = await ctx.db
      .query("catalogPriceRecords")
      .withIndex("by_variant_checkedAt", (q) => q.eq("variantId", args.variantId))
      .order("desc")
      .take(50);

    const match = records.find((record) => {
      if (args.vendorId && record.vendorId !== args.vendorId) return false;
      if (freshnessMs > 0 && record.checkedAt < cutoff) return false;
      return true;
    });

    if (!match) return { found: false };

    return {
      found: true,
      amount: match.amount,
      currency: match.currency,
      checkedAt: match.checkedAt,
      vendorId: match.vendorId,
      pricingModel: match.pricingModel,
      sourceType: match.sourceType,
      sourceRef: match.sourceRef,
    };
  },
});

export const getPreferredForProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const records = await ctx.db.query("catalogPriceRecords").order("desc").take(200);
    const vendorCounts = new Map<string, number>();
    const itemCounts = new Map<string, number>();

    for (const record of records) {
      const projectRef = record.sourceRef?.projectId;
      if (projectRef && projectRef !== args.projectId) continue;
      if (record.vendorId) {
        vendorCounts.set(record.vendorId, (vendorCounts.get(record.vendorId) ?? 0) + 1);
      }
      const key = record.variantId ?? record.templateId;
      if (key) {
        itemCounts.set(key, (itemCounts.get(key) ?? 0) + 1);
      }
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

export const getFreshnessDefaults = query({
  handler: async (ctx) => {
    const prefs = await ctx.db
      .query("procurementPrefs")
      .withIndex("by_key", (q) => q.eq("key", "global"))
      .first();
    return prefs?.value ?? {};
  },
});

export const setFreshnessDefaults = mutation({
  args: { priceFreshnessDaysDefault: v.number() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("procurementPrefs")
      .withIndex("by_key", (q) => q.eq("key", "global"))
      .first();
    const value = { priceFreshnessDaysDefault: args.priceFreshnessDaysDefault };
    if (existing) {
      await ctx.db.patch(existing._id, { value });
      return existing._id;
    }
    return await ctx.db.insert("procurementPrefs", { key: "global", value });
  },
});

// ==========================
// PRICE OBSERVATIONS
// ==========================

export const listPriceRecords = query({
  handler: async (ctx) => {
    return await ctx.db.query("catalogPriceRecords").order("desc").take(200);
  },
});

export const createPriceRecord = mutation({
  args: {
    variantId: v.optional(v.id("materialVariants")),
    templateId: v.optional(v.id("materialTemplates")),
    vendorId: v.optional(v.id("vendors")),
    amount: v.number(),
    currency: v.string(),
    source: v.union(
      v.literal("purchase"),
      v.literal("manual"),
      v.literal("web"),
      v.literal("quote"),
      v.literal("approvedElement")
    ),
    pricingModel: v.union(
      v.literal("per_unit"),
      v.literal("per_sheet"),
      v.literal("per_m"),
      v.literal("per_m2"),
      v.literal("per_pack"),
      v.literal("tiered"),
      v.literal("formula"),
      v.literal("unknown")
    ),
    sourceRef: v.optional(v.any()),
    url: v.optional(v.string()),
    title: v.optional(v.string()),
    rawSnippet: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (!args.variantId && !args.templateId) {
      throw new Error("createPriceRecord requires variantId or templateId");
    }
    if (args.source === "web") {
      const hasEvidence = !!args.url || !!args.title || !!args.rawSnippet;
      if (!hasEvidence) {
        throw new Error("Web price records require url, title, or rawSnippet");
      }
    }
    return await ctx.db.insert("catalogPriceRecords", {
      variantId: args.variantId,
      templateId: args.templateId,
      vendorId: args.vendorId,
      amount: args.amount,
      currency: args.currency,
      checkedAt: Date.now(),
      pricingModel: args.pricingModel,
      sourceType: args.source,
      sourceRef: args.sourceRef,
      url: args.url,
      title: args.title,
      rawSnippet: args.rawSnippet,
      createdAt: Date.now(),
    });
  },
});

// ==========================
// PRICING FORMULAS
// ==========================

export const listPricingFormulas = query({
  handler: async (ctx) => {
    return await ctx.db.query("pricingFormulas").collect();
  },
});

export const createPricingFormula = mutation({
  args: {
    templateId: v.id("materialTemplates"),
    vendorId: v.optional(v.id("vendors")),
    formulaType: v.union(
      v.literal("print_m2"),
      v.literal("cnc_cut"),
      v.literal("custom")
    ),
    params: v.any(),
    currency: v.string(),
    sourceType: v.union(
      v.literal("purchase"),
      v.literal("manual"),
      v.literal("web"),
      v.literal("quote"),
      v.literal("approvedElement")
    ),
    evidenceUrl: v.optional(v.string()),
    notesHe: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.sourceType === "web" && !args.evidenceUrl) {
      throw new Error("Web formulas require evidenceUrl");
    }
    return await ctx.db.insert("pricingFormulas", {
      templateId: args.templateId,
      vendorId: args.vendorId,
      formulaType: args.formulaType,
      params: args.params,
      currency: args.currency,
      checkedAt: Date.now(),
      sourceType: args.sourceType,
      evidenceUrl: args.evidenceUrl,
      notesHe: args.notesHe,
      createdAt: Date.now(),
    });
  },
});

// ==========================
// VENDOR LOCATIONS
// ==========================

export const listVendorLocations = query({
  handler: async (ctx) => {
    return await ctx.db.query("vendorLocations").collect();
  },
});

export const createVendorLocation = mutation({
  args: {
    vendorId: v.id("vendors"),
    nameHe: v.string(),
    addressHe: v.string(),
    pickupHoursHe: v.optional(v.string()),
    pickupNotesHe: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("vendorLocations", {
      vendorId: args.vendorId,
      nameHe: args.nameHe,
      addressHe: args.addressHe,
      pickupHoursHe: args.pickupHoursHe,
      pickupNotesHe: args.pickupNotesHe,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

// ==========================
// PROCUREMENT PREFS
// ==========================

export const getProcurementPrefs = query({
  args: { key: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("procurementPrefs")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .first();
  },
});

export const setProcurementPrefs = mutation({
  args: { key: v.string(), value: v.any() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("procurementPrefs")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, { value: args.value });
      return existing._id;
    }
    return await ctx.db.insert("procurementPrefs", { key: args.key, value: args.value });
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
      if (!line.variantId && !line.templateId) continue;
      await ctx.db.insert("catalogPriceRecords", {
        variantId: line.variantId,
        templateId: line.templateId,
        vendorId: args.vendorId,
        amount: Number(line.unitPrice ?? 0),
        currency: args.currency,
        checkedAt: Date.now(),
        pricingModel: pricingModelFromUom(line.uomCode),
        sourceType: "purchase",
        sourceRef: {
          projectId: args.projectId,
          purchaseId,
          uomCode: line.uomCode,
        },
        createdAt: Date.now(),
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
            displayNameNormalized: normalizeName(args.displayName),
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
