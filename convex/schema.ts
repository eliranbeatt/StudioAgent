import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// Enums
const projectStatus = v.union(v.literal("active"), v.literal("archived"));
const elementStatus = v.union(
  v.literal("drafting"),
  v.literal("approvedForQuote"),
  v.literal("inProduction"),
  v.literal("delivered"),
  v.literal("archived")
);
const draftStatus = v.union(
  v.literal("open"),
  v.literal("needsReview"),
  v.literal("approved"),
  v.literal("discarded")
);
const coStatus = v.union(
  v.literal("draft"),
  v.literal("sent"),
  v.literal("approved"),
  v.literal("rejected"),
  v.literal("cancelled")
);
const quoteStatus = v.union(
  v.literal("draft"),
  v.literal("generated"),
  v.literal("approved"),
  v.literal("superseded")
);
const baselineStatus = v.union(v.literal("approved"), v.literal("superseded"));
const graveyardStatus = v.union(
  v.literal("pending"),
  v.literal("resolved"),
  v.literal("dismissed")
);
const procurementMode = v.union(
  v.literal("purchase"),
  v.literal("stock"),
  v.literal("rent"),
  v.literal("subcontract")
);
const inventoryResStatus = v.union(
  v.literal("active"),
  v.literal("overbooked"),
  v.literal("cancelled"),
  v.literal("fulfilled")
);

export default defineSchema({
  // Users (Application users)
  users: defineTable({
    email: v.string(),
    displayName: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_email", ["email"]),

  // Projects
  projects: defineTable({
    name: v.string(),
    clientName: v.optional(v.string()),
    status: projectStatus,
    currency: v.string(), // Default 'NIS'
    defaults: v.object({
      profitPct: v.number(),
      overheadPct: v.number(),
      riskPct: v.number(),
      excludeManagementLaborFromCost: v.boolean(),
    }),
    projectCostContainerId: v.optional(v.id("projectCostContainers")),
    activeBudgetBaselineId: v.optional(v.id("budgetBaselines")),
    createdBy: v.optional(v.id("users")),
    createdAt: v.number(),
    updatedAt: v.number(),
  }),

  // Project Links (Past project context)
  projectLinks: defineTable({
    projectId: v.id("projects"),
    linkedProjectId: v.id("projects"),
    mode: v.union(v.literal("contextOnly"), v.literal("importSuggestions")),
    createdAt: v.number(),
  }).index("by_project", ["projectId"]),

  // Elements
  elements: defineTable({
    projectId: v.id("projects"),
    title: v.string(),
    type: v.union(
      v.literal("build"),
      v.literal("rent"),
      v.literal("print"),
      v.literal("transport"),
      v.literal("install"),
      v.literal("subcontract"),
      v.literal("mixed")
    ),
    status: elementStatus,
    tags: v.array(v.string()),
    currentApprovedVersionId: v.optional(v.id("elementVersions")),
    currentDraftId: v.optional(v.id("elementDrafts")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_project", ["projectId"])
    .index("by_status", ["status"]),

  // Element Drafts (Working snapshots)
  elementDrafts: defineTable({
    elementId: v.id("elements"),
    projectId: v.id("projects"),
    baseVersionId: v.optional(v.id("elementVersions")),
    status: draftStatus,
    revisionNumber: v.number(),
    createdFrom: v.any(), // { tab, stage }
    workingSnapshot: v.any(), // ElementSnapshot JSONB
    schemaVersion: v.number(),
    createdBy: v.optional(v.id("users")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_element", ["elementId"])
    .index("by_project", ["projectId"])
    .index("by_status", ["status"]),

  // Element Versions (Immutable)
  elementVersions: defineTable({
    elementId: v.id("elements"),
    projectId: v.id("projects"),
    versionNumber: v.number(),
    status: v.literal("approved"),
    tags: v.array(v.string()),
    summary: v.optional(v.string()),
    snapshot: v.any(), // ElementSnapshot JSONB
    schemaVersion: v.number(),
    approvedBy: v.optional(v.id("users")),
    approvedAt: v.number(),
    createdAt: v.number(),
  })
    .index("by_element", ["elementId"])
    .index("by_project", ["projectId"])
    .index("by_element_version", ["elementId", "versionNumber"]),

  // Project Cost Containers
  projectCostContainers: defineTable({
    projectId: v.id("projects"),
    title: v.string(),
    currentApprovedVersionId: v.optional(v.id("projectCostVersions")),
    currentDraftId: v.optional(v.id("projectCostDrafts")),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_project", ["projectId"]),

  // Project Cost Drafts
  projectCostDrafts: defineTable({
    containerId: v.id("projectCostContainers"),
    projectId: v.id("projects"),
    baseVersionId: v.optional(v.id("projectCostVersions")),
    status: draftStatus,
    revisionNumber: v.number(),
    createdFrom: v.any(),
    workingSnapshot: v.any(),
    schemaVersion: v.number(),
    createdBy: v.optional(v.id("users")),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_container", ["containerId"]),

  // Project Cost Versions
  projectCostVersions: defineTable({
    containerId: v.id("projectCostContainers"),
    projectId: v.id("projects"),
    versionNumber: v.number(),
    status: v.literal("approved"),
    tags: v.array(v.string()),
    summary: v.optional(v.string()),
    snapshot: v.any(),
    schemaVersion: v.number(),
    approvedBy: v.optional(v.id("users")),
    approvedAt: v.number(),
    createdAt: v.number(),
  }).index("by_container_version", ["containerId", "versionNumber"]),

  // Change Sets
  changeSets: defineTable({
    draftType: v.union(v.literal("element"), v.literal("projectCost")),
    draftId: v.union(v.id("elementDrafts"), v.id("projectCostDrafts")), // Logic to resolve ID type
    projectId: v.id("projects"),
    createdBy: v.any(), // { type, userId, agentSkillId }
    createdFrom: v.any(), // { tab, stage }
    baseRevisionNumber: v.number(),
    patchOps: v.any(), // Array of ops
    impactPreview: v.any(),
    reconciliation: v.any(), // { safeFixOps, reviewRequired, blockers, warnings }
    reason: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_project", ["projectId"])
    .index("by_draft", ["draftType", "draftId" as any]), // Using any to bypass explicit type check for union id in index definition if strictly required, but Convex handles string fields for IDs in indexes usually.

  // Graveyard Items
  graveyardItems: defineTable({
    projectId: v.id("projects"),
    draftType: v.union(v.literal("element"), v.literal("projectCost")),
    draftId: v.string(), // ID string
    changeSetId: v.id("changeSets"),
    status: graveyardStatus,
    kind: v.string(),
    message: v.string(),
    options: v.any(), // [{ id, label, patchOps... }]
    selectedOptionId: v.optional(v.string()),
    resolvedBy: v.optional(v.id("users")),
    resolvedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_project_status", ["projectId", "status"])
    .index("by_draft", ["draftType", "draftId", "status"]),

  // Quote Versions
  quoteVersions: defineTable({
    projectId: v.id("projects"),
    status: quoteStatus,
    sourceElementVersionIds: v.array(v.id("elementVersions")),
    sourceProjectCostVersionId: v.optional(v.id("projectCostVersions")),
    language: v.string(),
    sections: v.any(),
    totals: v.any(),
    createdBy: v.optional(v.id("users")),
    createdAt: v.number(),
  }).index("by_project", ["projectId"]),

  // Budget Baselines
  budgetBaselines: defineTable({
    projectId: v.id("projects"),
    quoteVersionId: v.id("quoteVersions"),
    status: baselineStatus,
    sourceElementVersionIds: v.array(v.id("elementVersions")),
    sourceProjectCostVersionId: v.optional(v.id("projectCostVersions")),
    planned: v.any(), // { byElement[], totals{} }
    approvedBy: v.optional(v.id("users")),
    approvedAt: v.number(),
    createdAt: v.number(),
  }).index("by_project", ["projectId"]),

  // Change Orders
  changeOrders: defineTable({
    projectId: v.id("projects"),
    title: v.string(),
    status: coStatus,
    source: v.any(), // { changeSetIds[], ... }
    financials: v.any(), // { deltaDirectCost, ... }
    approvedBy: v.optional(v.id("users")),
    approvedAt: v.optional(v.number()),
    rejectedAt: v.optional(v.number()),
    notes: v.optional(v.string()),
    createdBy: v.optional(v.id("users")),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_project", ["projectId"]),

  // Budget Adjustments
  budgetAdjustments: defineTable({
    projectId: v.id("projects"),
    baselineId: v.id("budgetBaselines"),
    changeOrderId: v.id("changeOrders"),
    delta: v.any(),
    approvedBy: v.optional(v.id("users")),
    approvedAt: v.number(),
    createdAt: v.number(),
  }).index("by_baseline", ["baselineId"]),

  // Project Digests (Archive/Context)
  projectDigests: defineTable({
    projectId: v.id("projects"),
    digest: v.any(),
    schemaVersion: v.number(),
    generatedAt: v.number(),
  }).index("by_project", ["projectId"]),

  // Element Snapshot Index (Analytics/Search)
  elementSnapshotIndex: defineTable({
    projectId: v.id("projects"),
    elementId: v.id("elements"),
    versionId: v.optional(v.id("elementVersions")),
    draftId: v.optional(v.id("elementDrafts")),
    totalDirectCost: v.number(),
    totalSellPrice: v.number(),
    vendorIds: v.array(v.id("vendors")),
    materialNames: v.array(v.string()),
    domains: v.array(v.string()),
    updatedAt: v.number(),
  })
    .index("by_project", ["projectId"])
    .index("by_element", ["elementId"])
    .index("by_version", ["versionId"]),

  // -------------------------
  // Management Hub Tables
  // -------------------------

  // Employees / People
  employees: defineTable({
    displayName: v.string(),
    role: v.string(),
    defaultDayRate: v.number(),
    active: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }),

  // Vendors
  vendors: defineTable({
    name: v.string(),
    type: v.string(), // "general", "print", etc.
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
    address: v.optional(v.string()),
    notes: v.optional(v.string()),
    active: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_name", ["name"]),

  // Material Catalog
  materialCatalog: defineTable({
    canonicalName: v.string(),
    unit: v.string(),
    synonyms: v.array(v.string()),
    typicalVendorId: v.optional(v.id("vendors")),
    tags: v.array(v.string()),
    active: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_name", ["canonicalName"]),

  // Price Observations
  priceObservations: defineTable({
    catalogId: v.id("materialCatalog"),
    vendorId: v.optional(v.id("vendors")),
    unitCost: v.number(),
    currency: v.string(),
    observedAt: v.number(),
    source: v.union(
      v.literal("purchase"),
      v.literal("manual"),
      v.literal("approvedElement")
    ),
    sourceRef: v.any(), // { projectId, elementId, versionId }
  }).index("by_catalog", ["catalogId", "observedAt"]),

  // Inventory Items
  inventoryItems: defineTable({
    catalogId: v.optional(v.id("materialCatalog")),
    name: v.string(),
    unit: v.string(),
    onHandQty: v.number(),
    location: v.optional(v.string()),
    notes: v.optional(v.string()),
    active: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_name", ["name"]),

  // Inventory Reservations
  inventoryReservations: defineTable({
    inventoryItemId: v.id("inventoryItems"),
    projectId: v.id("projects"),
    elementId: v.optional(v.id("elements")),
    materialLineId: v.optional(v.string()),
    qty: v.number(),
    dateRange: v.optional(v.any()), // { start, end }
    status: inventoryResStatus,
    computedAvailableAfter: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_item", ["inventoryItemId"])
    .index("by_project", ["projectId"]),

  // -------------------------
  // Agent & Chat Tables
  // -------------------------

  conversations: defineTable({
    projectId: v.id("projects"),
    title: v.optional(v.string()),
    status: v.union(v.literal("active"), v.literal("archived")),
    stage: v.union(v.literal("ideation"), v.literal("planning"), v.literal("solutioning")),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_project", ["projectId"]),

  messages: defineTable({
    conversationId: v.id("conversations"),
    role: v.union(v.literal("user"), v.literal("agent"), v.literal("system")),
    content: v.string(),
    type: v.union(v.literal("text"), v.literal("questions"), v.literal("changeSet")),
    channel: v.union(v.literal("free"), v.literal("structured")),
    skillUsed: v.optional(v.string()),
    metadata: v.optional(v.any()), // e.g. { questions: [], changeSetId: "" }
    createdAt: v.number(),
  }).index("by_conversation", ["conversationId"]),
});
