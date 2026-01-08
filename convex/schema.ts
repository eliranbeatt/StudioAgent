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
    description: v.optional(v.string()),
    overviewSummary: v.optional(v.string()),
    projectTypes: v.optional(v.array(v.string())),
    stage: v.optional(v.union(v.literal("IDEATION"), v.literal("QUOTE"), v.literal("BREAKDOWN"))),
    counters: v.optional(v.object({
      nextElementNo: v.number(),
    })),
    pricingDefaults: v.optional(v.object({
      profitPct: v.number(),
      overheadPct: v.number(),
      riskPct: v.number(),
      excludeManagementLaborFromCost: v.boolean(),
    })),
    details: v.optional(
      v.object({
        eventDate: v.optional(v.number()),
        budgetCap: v.optional(v.number()),
        location: v.optional(v.string()),
        notes: v.optional(v.string()),
      })
    ),
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
    rev: v.optional(v.number()), // Incremented on every update
    approvedVersionId: v.optional(v.id("elementVersions")), // Latest approved snapshot
    hasUnapprovedChanges: v.optional(v.boolean()), // True if edited after approve
    tags: v.array(v.string()),
    currentApprovedVersionId: v.optional(v.id("elementVersions")),
    currentDraftId: v.optional(v.id("elementDrafts")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_project", ["projectId"])
    .index("by_project_status", ["projectId", "status"])
    .index("by_project_updated", ["projectId", "updatedAt"])
    .index("by_status", ["status"]),

  // Tasks
  tasks: defineTable({
    projectId: v.id("projects"),
    elementId: v.optional(v.id("elements")),
    title: v.string(),
    description: v.optional(v.string()),
    status: v.optional(v.string()),
    priority: v.optional(v.string()),
    category: v.optional(v.string()),
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
    estimatedMinutes: v.optional(v.number()),
    assignee: v.optional(v.string()),
    dependencies: v.optional(v.array(v.string())), // Task IDs
    createdFromChangeSetId: v.optional(v.id("changeSets")),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_project", ["projectId"])
    .index("by_element", ["elementId"]),

  // Accounting Lines (Materials, Labor, Subcontract)
  accountingLines: defineTable({
    projectId: v.id("projects"),
    elementId: v.optional(v.id("elements")),
    taskId: v.optional(v.id("tasks")),
    type: v.union(v.literal("material"), v.literal("labor"), v.literal("subcontract"), v.literal("other")),
    title: v.string(),
    qty: v.optional(v.number()),
    unitCost: v.optional(v.number()),
    total: v.number(),
    billable: v.optional(v.boolean()),
    createdFromChangeSetId: v.optional(v.id("changeSets")),
    createdAt: v.number(),
  }).index("by_project", ["projectId"])
    .index("by_element", ["elementId"])
    .index("by_task", ["taskId"]),

  // Print Parts
  printParts: defineTable({
    projectId: v.id("projects"),
    elementId: v.id("elements"),
    label: v.string(),
    substrate: v.optional(v.string()),
    qty: v.number(),
    size: v.optional(v.string()),
    requiresProof: v.optional(v.boolean()),
    createdFromChangeSetId: v.optional(v.id("changeSets")),
    createdAt: v.number(),
  }).index("by_element", ["elementId"]),

  // Receipts
  receipts: defineTable({
    projectId: v.id("projects"),
    purchaseId: v.optional(v.id("purchases")),
    fileId: v.id("projectFiles"),
    createdFromChangeSetId: v.optional(v.id("changeSets")),
    createdAt: v.number(),
  }).index("by_purchase", ["purchaseId"]),

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



  // Change Sets (Refactored)
  changeSets: defineTable({
    projectId: v.id("projects"),
    stage: v.union(v.literal("IDEATION"), v.literal("QUOTE"), v.literal("BREAKDOWN")),
    status: v.union(v.literal("PROPOSED"), v.literal("APPLIED"), v.literal("DISCARDED")),
    reason_he: v.optional(v.string()),

    // Conflict control
    base: v.optional(v.object({
      elements: v.optional(v.array(v.object({
        elementId: v.id("elements"),
        rev: v.number(),
      }))),
    })),

    // The ops list
    ops: v.array(v.object({
      kind: v.string(), // e.g. "element.create", "task.create"
      payload: v.any(),
    })),

    // UI preview strings
    preview_he: v.optional(v.object({
      elements: v.optional(v.array(v.string())),
      tasks: v.optional(v.array(v.string())),
      accounting: v.optional(v.array(v.string())),
      printing: v.optional(v.array(v.string())),
      purchases: v.optional(v.array(v.string())),
    })),

    schemaVersion: v.optional(v.number()),

    createdAt: v.number(),
    createdBy_he: v.optional(v.string()),
    appliedAt: v.optional(v.number()),
    appliedBy_he: v.optional(v.string()),
    discardedAt: v.optional(v.number()),
    discardedBy_he: v.optional(v.string()),
  })
    .index("by_project", ["projectId"])
    .index("by_project_status", ["projectId", "status"])
    .index("by_project_stage", ["projectId", "stage"]),

  // Graveyard Items
  graveyardItems: defineTable({
    projectId: v.id("projects"),
    title: v.string(),
    description: v.optional(v.string()),
    
    // The "dead" item causing this entry (e.g. an element being deleted, or a high-value purchase being voided)
    sourceRef: v.optional(v.object({
      id: v.string(),
      type: v.string(), // "element", "purchase", "task", etc.
    })),

    // Options for the user
    options: v.array(v.object({
      id: v.string(), // "keep", "discard", "archive"
      label: v.string(),
      // If chosen, these ops are applied as a new ChangeSet
      patchOps: v.optional(v.array(v.any())), 
    })),

    status: v.union(v.literal("pending"), v.literal("resolved"), v.literal("dismissed")),
    resolvedAt: v.optional(v.number()),
    resolvedBy: v.optional(v.id("users")),
    chosenOptionId: v.optional(v.string()),

    createdAt: v.number(),
  })
    .index("by_project", ["projectId"])
    .index("by_project_status", ["projectId", "status"]),


  // Quote Versions





  // Suggested Elements


  // Element Snapshot Index (Analytics/Search)


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

  purchases: defineTable({
    projectId: v.optional(v.id("projects")),
    vendorId: v.id("vendors"),
    date: v.number(),
    currency: v.string(),
    totalAmount: v.number(),
    status: v.union(
      v.literal("recorded"),
      v.literal("paid"),
      v.literal("cancelled")
    ),
    lineItems: v.array(v.any()), // [{ catalogId?, description?, qty, unit, unitPrice, lineTotal }]
    notes: v.optional(v.string()),
    createdFromChangeSetId: v.optional(v.id("changeSets")), // Audit
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_date", ["date"]),

  projectFiles: defineTable({
    projectId: v.id("projects"),
    storageId: v.id("_storage"),
    fileName: v.string(),
    contentType: v.string(),
    size: v.number(),
    extractedText: v.optional(v.string()),
    summary: v.optional(v.string()),
    extractedInfo: v.optional(v.object({
      topics: v.optional(v.array(v.string())),
      domain: v.optional(v.string()),
      entities: v.optional(v.array(v.object({
        name: v.string(),
        type: v.optional(v.string()),
      }))),
      summary: v.optional(v.string()),
      facts: v.optional(v.array(v.string())),
      language: v.optional(v.string()),
      model: v.optional(v.string()),
      updatedAt: v.optional(v.number()),
    })),
    createdAt: v.number(),
  }).index("by_project", ["projectId", "createdAt"]),

  proposedUpdates: defineTable({
    entityType: v.union(
      v.literal("Vendor"),
      v.literal("Person"),
      v.literal("CatalogItem"),
      v.literal("PriceObservation"),
      v.literal("NormalizationMapping")
    ),
    payload: v.any(),
    reason: v.string(),
    createdFrom: v.any(), // { projectId, agentRunId, messageId }
    status: v.union(v.literal("pending"), v.literal("accepted"), v.literal("rejected")),
    resolution: v.optional(v.any()), // { resolvedBy, resolvedAt, resultEntityId }
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_status", ["status"]),

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
    title: v.optional(v.string()), // Deprecated in favor of title_he?
    title_he: v.optional(v.string()),
    status: v.union(v.literal("active"), v.literal("archived")),
    mode: v.optional(v.union(
      v.literal("CHAT"),
      v.literal("QUESTIONS"),
      v.literal("SUGGESTIONS")
    )),
    stage: v.union(
      v.literal("ideation"),
      v.literal("planning"),
      v.literal("solutioning"),
      v.literal("IDEATION"),
      v.literal("QUOTE"),
      v.literal("BREAKDOWN")
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_project", ["projectId"])
    .index("by_project_updated", ["projectId", "updatedAt"]),

  conversationMessages: defineTable({
    conversationId: v.id("conversations"),
    projectId: v.id("projects"),
    role: v.union(v.literal("user"), v.literal("assistant"), v.literal("event")),
    text_he: v.optional(v.string()),
    block: v.optional(v.any()), // JSON
    eventType: v.optional(v.string()),
    eventPayload: v.optional(v.any()),
    changeSetId: v.optional(v.id("changeSets")),
    createdAt: v.number(),
  })
    .index("by_conversation", ["conversationId"])
    .index("by_project", ["projectId"])
    .index("by_changeset", ["changeSetId"]),

  // Legacy messages table (keep for now)
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

  structuredAnswers: defineTable({
    projectId: v.id("projects"),
    stage: v.union(
      v.literal("ideation"),
      v.literal("planning"),
      v.literal("solutioning")
    ),
    answers: v.any(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_project_stage", ["projectId", "stage"]),



  // Memory System
  memoryDocs: defineTable({
    projectId: v.id("projects"),
    elementId: v.optional(v.id("elements")),
    kind: v.union(
      v.literal("SOURCE_DOC"),
      v.literal("RUNNING_MEMORY"),
      v.literal("QA_DIGEST")
    ),
    title_he: v.optional(v.string()),
    source: v.optional(v.object({
      sourceType: v.union(
        v.literal("FILE"),
        v.literal("TEXT"),
        v.literal("URL"),
        v.literal("CHAT_EXPORT"),
        v.literal("OTHER")
      ),
      fileId: v.optional(v.id("projectFiles")),
      url: v.optional(v.string()),
    })),
    rawText_he: v.optional(v.string()),
    aiSummary: v.optional(v.object({
      model: v.string(),
      summaryMd_he: v.string(),
      facts_he: v.optional(v.array(v.string())),
      updatedAt: v.number(),
    })),
    contentMd_he: v.optional(v.string()),
    schemaVersion: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_project", ["projectId"])
    .index("by_project_kind", ["projectId", "kind"])
    .index("by_project_element_kind", ["projectId", "elementId", "kind"]),

  qaPairs: defineTable({
    projectId: v.id("projects"),
    elementId: v.optional(v.id("elements")),
    question_he: v.string(),
    questionKey: v.optional(v.string()),
    answer_he: v.string(),
    source: v.object({
      sourceType: v.union(
        v.literal("CLARIFICATION_BLOCK"),
        v.literal("CHAT_PARSE")
      ),
      conversationId: v.optional(v.id("conversations")),
      messageId: v.optional(v.id("conversationMessages")),
    }),
    createdAt: v.number(),
  })
    .index("by_project", ["projectId"])
    .index("by_project_element", ["projectId", "elementId"])
    .index("by_project_questionKey", ["projectId", "questionKey"]),

  // -------------------------
  // Project Linking & Digests
  // -------------------------

  projectLinks: defineTable({
    projectId: v.id("projects"),
    linkedProjectId: v.id("projects"),
    mode: v.union(v.literal("contextOnly"), v.literal("importSuggestions")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_project", ["projectId"])
    .index("by_project_linked", ["projectId", "linkedProjectId"]),

  projectDigests: defineTable({
    projectId: v.id("projects"),
    summary: v.string(),
    keyElements: v.optional(v.array(v.object({
      id: v.id("elements"),
      title: v.string(),
      type: v.string(),
    }))),
    fileHighlights: v.optional(v.array(v.string())),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_project", ["projectId"]),
});
