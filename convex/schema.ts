import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// Enums
const projectStatus = v.union(v.literal("active"), v.literal("archived"), v.literal("lead"), v.literal("production"), v.literal("done"), v.literal("rejected"));
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

const customerStatus = v.union(v.literal("active"), v.literal("archived"));

const receiptStatus = v.union(
  v.literal("uploaded"),
  v.literal("extracted"),
  v.literal("reviewed"),
  v.literal("approved")
);

const shareScope = v.union(
  v.literal("projectSummary"),
  v.literal("quote"),
  v.literal("gallery")
);

const printQaStatus = v.union(
  v.literal("not_started"),
  v.literal("in_review"),
  v.literal("pass"),
  v.literal("fail")
);

const StudioWorkType = v.union(
  v.literal("carpentry"),
  v.literal("metal_fab"),
  v.literal("paint_finish"),
  v.literal("printing_graphics"),
  v.literal("props_sculpt"),
  v.literal("rigging_install"),
  v.literal("transport_logistics"),
  v.literal("purchasing"),
  v.literal("management")
);

const runbookScope = v.union(v.literal("project"), v.literal("element"));
const runbookStatus = v.union(v.literal("draft"), v.literal("active"), v.literal("archived"));
const runbookSource = v.union(v.literal("ai"), v.literal("manual"), v.literal("mixed"));

const runbookItemKind = v.union(
  v.literal("step"),
  v.literal("checkpoint"),
  v.literal("approval"),
  v.literal("note")
);

const runbookItemStatus = v.union(
  v.literal("todo"),
  v.literal("doing"),
  v.literal("done"),
  v.literal("blocked")
);

const runbookListType = v.union(
  v.literal("bringList"),
  v.literal("safety"),
  v.literal("quickFixKit"),
  v.literal("checkpoints"),
  v.literal("assumptions")
);

const TaskChecklistItem = v.object({
  id: v.string(),
  title: v.string(),
  description: v.optional(v.string()),
  workType: v.optional(StudioWorkType),
  workTypeLabelHe: v.optional(v.string()),
  estimatedMinutes: v.optional(v.number()),
  order: v.optional(v.number()),
  done: v.optional(v.boolean()),
  dependsOnItemIds: v.optional(v.array(v.string())),
});

const TaskAccountingLink = v.object({
  lineType: v.union(v.literal("material"), v.literal("work")),
  lineId: v.string(),
  relation: v.optional(v.union(v.literal("primary"), v.literal("supporting"))),
  note: v.optional(v.string()),
});



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
    name: v.optional(v.string()),
    displayName: v.optional(v.string()),
    trelloCredentials: v.optional(v.object({
      apiKey: v.string(),
      token: v.string()
    })),
    preferredModel: v.optional(v.string()), // e.g. "gpt-5-mini", "gpt-5-nano"
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_email", ["email"]),

  // Projects
  projects: defineTable({
    name: v.string(),
    clientName: v.optional(v.string()),
    customerId: v.optional(v.id("customers")),
    customerName: v.optional(v.string()),
    customerNameRaw: v.optional(v.string()),
    types: v.optional(v.array(v.string())),
    eventDate: v.optional(v.string()), // ISO string
    notes: v.optional(v.string()),
    summary: v.optional(v.string()),
    summaryStatus: v.optional(v.union(v.literal("empty"), v.literal("queued"), v.literal("generating"), v.literal("ready"), v.literal("failed"))),
    summaryUpdatedAt: v.optional(v.number()),
    summarySources: v.optional(v.array(v.object({ title: v.string(), url: v.optional(v.string()) }))),
    summaryError: v.optional(v.string()),
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
    tasksConfiguration: v.optional(v.object({
      defaultView: v.optional(v.string()),
      kanbanColumnOrder: v.optional(v.any()), // { todo: taskId[], ... }
      filtersDefaults: v.optional(v.any()),
      draftModeEnabled: v.optional(v.boolean()),
      trelloConfig: v.optional(v.object({
        boardId: v.optional(v.string()),
        listMappings: v.optional(v.any()),
        // Legacy fields - kept for migration or fallback, but ideally moved to users
        apiKey: v.optional(v.string()),
        token: v.optional(v.string())
      })),
    })),
    createdBy: v.optional(v.id("users")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_status", ["status"])
    .index("by_customerId", ["customerId"])
    .index("by_updatedAt", ["updatedAt"]),



  // Elements
  elements: defineTable({
    projectId: v.id("projects"),
    title: v.string(),
    description: v.optional(v.string()),
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
    order: v.optional(v.number()),
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
    dueDate: v.optional(v.number()),
    estimatedMinutes: v.optional(v.number()),
    assignee: v.optional(v.string()),
    dependencies: v.optional(v.array(v.string())), // Task IDs

    // NEW V3 Fields
    stage: v.optional(v.union(
      v.literal("clarification"),
      v.literal("quote"),
      v.literal("procurement"),
      v.literal("build"),
      v.literal("install"),
      v.literal("teardown"),
      v.literal("accounting")
    )),
    workType: v.optional(StudioWorkType),
    workTypeLabelHe: v.optional(v.string()),
    plannedStartDate: v.optional(v.string()), // "YYYY-MM-DD"
    plannedEndDate: v.optional(v.string()),
    durationBucket: v.optional(v.union(v.literal("small"), v.literal("large"))),
    checklist: v.optional(v.array(TaskChecklistItem)),
    accountingLinks: v.optional(v.array(TaskAccountingLink)),

    // New fields for Tasks Tab v2
    isDraft: v.optional(v.boolean()),
    draftOfTaskId: v.optional(v.id("tasks")),
    draftRevisionId: v.optional(v.id("taskRevisions")),
    elementSubtaskId: v.optional(v.string()),
    aiThreadId: v.optional(v.id("conversations")),
    assigneeIds: v.optional(v.array(v.id("employees"))),

    // Metadata
    createdBy: v.optional(v.union(v.literal("human"), v.literal("agent"))),
    createdByRunId: v.optional(v.string()), // changed from v.id("agentRuns") as table is missing

    createdFromChangeSetId: v.optional(v.id("changeSets")),
    dedupKey: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
  }).index("by_project", ["projectId"])
    .index("by_element", ["elementId"])
    .index("by_project_status", ["projectId", "status"])
    .index("by_project_element", ["projectId", "elementId"])
    .index("by_project_assignee", ["projectId", "assignee"])
    .index("by_project_updatedAt", ["projectId", "updatedAt"])
    .index("by_project_dueDate", ["projectId", "dueDate"])
    .index("by_project_workType", ["projectId", "workType"])
    .index("by_project_plannedStart", ["projectId", "plannedStartDate"]),

  // Runbooks (install-day execution artifacts + element templates)
  runbooks: defineTable({
    projectId: v.id("projects"),
    scope: runbookScope,
    elementId: v.optional(v.id("elements")),
    titleHe: v.string(),
    summaryHe: v.optional(v.string()),
    status: runbookStatus,
    version: v.number(),
    source: runbookSource,

    // Execution state
    executionStartedAt: v.optional(v.number()),
    orderingLocked: v.optional(v.boolean()),

    // Approvals
    approvalsRequired: v.optional(v.boolean()),
    approvalStages: v.optional(v.array(v.string())),
    approvalRecords: v.optional(v.array(v.object({
      stage: v.string(),
      signedBy: v.string(),
      signedAt: v.number(),
      note: v.optional(v.string()),
    }))),

    createdBy: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_project", ["projectId"])
    .index("by_project_scope", ["projectId", "scope"])
    .index("by_project_scope_status", ["projectId", "scope", "status"])
    .index("by_project_element", ["projectId", "elementId"]),

  runbookItems: defineTable({
    projectId: v.id("projects"),
    runbookId: v.id("runbooks"),
    phaseId: v.string(),
    phaseOrder: v.number(),
    phaseNameHe: v.string(),
    orderIndex: v.number(),
    kind: runbookItemKind,
    textHe: v.string(),
    responsibleHe: v.optional(v.string()),
    durationMins: v.optional(v.number()),
    linkedTaskId: v.optional(v.id("tasks")),
    linkedElementId: v.optional(v.id("elements")),
    status: runbookItemStatus,
    doneAt: v.optional(v.number()),
    doneBy: v.optional(v.string()),
    comment: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_runbook", ["runbookId"])
    .index("by_runbook_phase", ["runbookId", "phaseOrder"])
    .index("by_project", ["projectId"]),

  runbookListItems: defineTable({
    projectId: v.id("projects"),
    runbookId: v.id("runbooks"),
    listType: runbookListType,
    orderIndex: v.number(),
    textHe: v.string(),
    checked: v.boolean(),
    checkedAt: v.optional(v.number()),
    checkedBy: v.optional(v.string()),
    linkedMaterialLineId: v.optional(v.id("materialLines")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_runbook", ["runbookId"])
    .index("by_runbook_type", ["runbookId", "listType"])
    .index("by_project", ["projectId"]),

  // Task Revisions (Draft Patch Layer)
  taskRevisions: defineTable({
    projectId: v.id("projects"),
    taskId: v.id("tasks"),
    baseVersionHash: v.string(),
    patch: v.any(), // JSON object with changed fields
    source: v.union(v.literal("human"), v.literal("agent")),
    agentRunId: v.optional(v.string()), // ID or string
    status: v.union(v.literal("draft"), v.literal("applied"), v.literal("discarded")),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_task", ["taskId"])
    .index("by_project_status", ["projectId", "status"]),

  // Trello Sync Runs
  trelloSyncRuns: defineTable({
    projectId: v.id("projects"),
    startedAt: v.number(),
    finishedAt: v.optional(v.number()),
    status: v.union(v.literal("running"), v.literal("success"), v.literal("failed")),
    summary: v.optional(v.any()),
    retryLog: v.optional(v.array(v.any())),
    diffPlanPreview: v.optional(v.any()),
  }).index("by_project", ["projectId"]),

  // Trello Mappings
  trelloMappings: defineTable({
    projectId: v.id("projects"),
    taskId: v.id("tasks"),
    trelloCardId: v.string(),
    trelloListId: v.optional(v.string()),
    contentHash: v.string(),
    lastSyncedAt: v.number(),
  })
    .index("by_project", ["projectId"])
    .index("by_task", ["taskId"])
    .index("by_card", ["trelloCardId"]),

  // Accounting Lines (Materials, Labor, Subcontract)
  accountingLines: defineTable({
    projectId: v.id("projects"),
    elementId: v.optional(v.id("elements")),
    taskId: v.optional(v.id("tasks")),
    sectionId: v.optional(v.id("accountingSections")),
    sectionKey: v.optional(v.string()),
    sectionLabelHe: v.optional(v.string()),
    type: v.union(v.literal("material"), v.literal("labor"), v.literal("subcontract"), v.literal("other")),
    title: v.string(),
    qty: v.optional(v.number()),
    unitCost: v.optional(v.number()),
    total: v.number(),
    billable: v.optional(v.boolean()),

    // NEW V3 Fields (BOM + Labor Metadata)
    itemName: v.optional(v.string()),
    spec: v.optional(v.string()),
    unit: v.optional(v.string()),
    unitCostEstimate: v.optional(v.number()),
    wastePct: v.optional(v.number()),
    vendorId: v.optional(v.id("vendors")),
    vendorName: v.optional(v.string()),
    vendorSku: v.optional(v.string()),
    vendorUrl: v.optional(v.string()),
    leadTimeDays: v.optional(v.number()),

    workType: v.optional(StudioWorkType),
    hours: v.optional(v.number()),
    crewSize: v.optional(v.number()),
    ratePerHour: v.optional(v.number()),

    source: v.optional(v.string()),
    confidence: v.optional(v.number()),
    notes: v.optional(v.string()),
    actualTotalCost: v.optional(v.number()),
    receiptItemIds: v.optional(v.array(v.id("receiptItems"))),

    createdFromChangeSetId: v.optional(v.id("changeSets")),
    dedupKey: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
  }).index("by_project", ["projectId"])
    .index("by_element", ["elementId"])
    .index("by_task", ["taskId"])
    .index("by_project_updatedAt", ["projectId", "updatedAt"]),

  // Accounting Sections (canonical keys for routing)
  accountingSections: defineTable({
    projectId: v.id("projects"),
    key: v.string(),
    labelHe: v.string(),
    sortOrder: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_project", ["projectId"])
    .index("by_project_key", ["projectId", "key"]),

  // Material Lines (linked to tasks)
  materialLines: defineTable({
    projectId: v.id("projects"),
    elementId: v.optional(v.id("elements")),
    taskId: v.optional(v.id("tasks")),
    sectionId: v.optional(v.id("accountingSections")),
    sectionKey: v.optional(v.string()),
    sectionLabelHe: v.optional(v.string()),
    workType: v.optional(StudioWorkType),
    workTypeLabelHe: v.optional(v.string()),
    itemName: v.optional(v.string()),
    spec: v.optional(v.string()),
    quantity: v.optional(v.number()),
    unitCode: v.optional(
      v.union(
        v.literal("ea"),
        v.literal("m"),
        v.literal("sqm"),
        v.literal("m2"),
        v.literal("m3"),
        v.literal("kg"),
        v.literal("l"),
        v.literal("set"),
        v.literal("box"),
        v.literal("roll")
      )
    ),
    unitLabelHe: v.optional(v.string()),
    unit: v.optional(v.string()),
    wastePct: v.optional(v.number()),
    plannedUnitCost: v.optional(v.number()),
    plannedTotalCost: v.optional(v.number()),
    vendorId: v.optional(v.id("vendors")),
    vendorName: v.optional(v.string()),
    leadTimeDays: v.optional(v.number()),
    procurementCode: v.optional(
      v.union(
        v.literal("in_stock"),
        v.literal("local_buy"),
        v.literal("import"),
        v.literal("rental")
      )
    ),
    procurementLabelHe: v.optional(v.string()),
    procurement: v.optional(v.string()),
    notes: v.optional(v.string()),
    sourceCode: v.optional(
      v.union(
        v.literal("agent_estimate"),
        v.literal("vendor_quote"),
        v.literal("invoice"),
        v.literal("manual")
      )
    ),
    sourceLabelHe: v.optional(v.string()),
    source: v.optional(v.string()),
    confidence: v.optional(v.number()),
    actualUnitCost: v.optional(v.number()),
    actualTotalCost: v.optional(v.number()),
    receiptItemIds: v.optional(v.array(v.id("receiptItems"))),
    checklistItemId: v.optional(v.string()),
    createdFromChangeSetId: v.optional(v.id("changeSets")),
    dedupKey: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
  }).index("by_project", ["projectId"])
    .index("by_element", ["elementId"])
    .index("by_task", ["taskId"])
    .index("by_project_updatedAt", ["projectId", "updatedAt"]),

  // Work Lines (linked to tasks)
  workLines: defineTable({
    projectId: v.id("projects"),
    elementId: v.optional(v.id("elements")),
    taskId: v.optional(v.id("tasks")),
    sectionId: v.optional(v.id("accountingSections")),
    sectionKey: v.optional(v.string()),
    sectionLabelHe: v.optional(v.string()),
    workType: v.optional(StudioWorkType),
    workTypeLabelHe: v.optional(v.string()),
    roleHe: v.optional(v.string()),
    rateTypeCode: v.optional(
      v.union(v.literal("hour"), v.literal("day"), v.literal("flat"))
    ),
    rateTypeLabelHe: v.optional(v.string()),
    rateType: v.optional(v.string()),
    crewSize: v.optional(v.number()),
    plannedQuantity: v.optional(v.number()),
    plannedUnitCost: v.optional(v.number()),
    plannedTotalCost: v.optional(v.number()),
    isManagement: v.optional(v.boolean()),
    notes: v.optional(v.string()),
    sourceCode: v.optional(
      v.union(
        v.literal("agent_estimate"),
        v.literal("vendor_quote"),
        v.literal("invoice"),
        v.literal("manual")
      )
    ),
    sourceLabelHe: v.optional(v.string()),
    source: v.optional(v.string()),
    confidence: v.optional(v.number()),
    actualTotalCost: v.optional(v.number()),
    receiptItemIds: v.optional(v.array(v.id("receiptItems"))),
    createdFromChangeSetId: v.optional(v.id("changeSets")),
    dedupKey: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
  })
    .index("by_project", ["projectId"])
    .index("by_element", ["elementId"])
    .index("by_task", ["taskId"])
    .index("by_project_updatedAt", ["projectId", "updatedAt"]),

  // Print Parts
  printParts: defineTable({
    projectId: v.id("projects"),
    elementId: v.id("elements"),
    label: v.string(),
    substrate: v.optional(v.string()),
    finish: v.optional(v.string()),
    qty: v.number(),
    size: v.optional(v.string()),
    width: v.optional(v.number()),
    height: v.optional(v.number()),
    unit: v.optional(v.union(v.literal("mm"), v.literal("cm"), v.literal("m"))),
    requiresProof: v.optional(v.boolean()),
    testPrintRequired: v.optional(v.boolean()),
    qaStatus: v.optional(printQaStatus),
    notes: v.optional(v.string()),
    createdFromChangeSetId: v.optional(v.id("changeSets")),
    createdAt: v.number(),
  })
    .index("by_element", ["elementId"])
    .index("by_project", ["projectId"]),

  // Receipts
  receipts: defineTable({
    projectId: v.id("projects"),
    purchaseId: v.optional(v.id("purchases")),
    fileId: v.id("projectFiles"),
    fileIds: v.optional(v.array(v.id("projectFiles"))),
    vendorId: v.optional(v.id("vendors")),
    status: v.optional(receiptStatus),
    date: v.optional(v.number()),
    total: v.optional(v.number()),
    currency: v.optional(v.string()),
    extraction: v.optional(v.any()),
    createdFromChangeSetId: v.optional(v.id("changeSets")),
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
  })
    .index("by_purchase", ["purchaseId"])
    .index("by_project", ["projectId"])
    .index("by_vendor", ["vendorId"]),

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
    currentDraftId: v.optional(v.id("elementDrafts")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_project", ["projectId"]),

  // Project Cost Versions
  projectCostVersions: defineTable({
    projectId: v.id("projects"),
    status: v.optional(v.string()),
    snapshot: v.optional(v.any()),
    createdAt: v.number(),
  })
    .index("by_project", ["projectId"]),

  // Quote Versions
  quoteVersions: defineTable({
    projectId: v.id("projects"),
    status: v.string(),
    sourceElementVersionIds: v.array(v.id("elementVersions")),
    sourceProjectCostVersionId: v.optional(v.id("projectCostVersions")),
    language: v.optional(v.string()),
    sections: v.optional(v.any()),
    totals: v.optional(v.any()),
    version: v.optional(v.number()),
    customerId: v.optional(v.id("customers")),
    customerName: v.optional(v.string()),
    inputs: v.optional(v.object({
      projectDescription: v.optional(v.string()),
      specs: v.optional(v.string()),
      includeFlags: v.optional(v.object({
        includeElements: v.boolean(),
        elementsMode: v.union(v.literal("bySection"), v.literal("byElement")),
        includeTerms: v.boolean(),
        includeDates: v.boolean(),
        includeAgreements: v.boolean(),
        includeOptions: v.boolean(),
      })),
      validUntil: v.optional(v.string()),
      logoFileId: v.optional(v.id("projectFiles")),
    })),
    margins: v.optional(v.object({
      riskPct: v.number(),
      overheadPct: v.number(),
      profitPct: v.number(),
    })),
    currency: v.optional(v.string()),
    priceSummary: v.optional(v.any()),
    sellBreakdown: v.optional(v.any()),
    quoteText_he: v.optional(v.string()),
    quoteBlocks: v.optional(v.any()),
    pdfFileId: v.optional(v.id("projectFiles")),
    contentHash: v.optional(v.string()),
    previousQuoteId: v.optional(v.id("quoteVersions")),
    createdAt: v.number(),
  })
    .index("by_project", ["projectId"]),

  // Budget Baselines
  budgetBaselines: defineTable({
    projectId: v.id("projects"),
    quoteVersionId: v.optional(v.id("quoteVersions")),
    status: v.string(),
    sourceElementVersionIds: v.optional(v.array(v.id("elementVersions"))),
    sourceProjectCostVersionId: v.optional(v.id("projectCostVersions")),
    planned: v.optional(v.any()),
    approvedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_project", ["projectId"]),

  // Change Orders
  changeOrders: defineTable({
    projectId: v.id("projects"),
    title: v.string(),
    status: v.string(),
    financials: v.any(),
    approvedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_project", ["projectId"]),

  // Budget Adjustments
  budgetAdjustments: defineTable({
    projectId: v.id("projects"),
    baselineId: v.id("budgetBaselines"),
    changeOrderId: v.optional(v.id("changeOrders")),
    delta: v.any(),
    approvedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_baseline", ["baselineId"]),

  // Change Sets (Refactored for v2)
  changeSets: defineTable({
    projectId: v.id("projects"),
    // Common fields
    stage: v.union(v.literal("IDEATION"), v.literal("QUOTE"), v.literal("BREAKDOWN")),
    status: v.union(
      v.literal("PROPOSED"),
      v.literal("APPLIED"),
      v.literal("PARTIALLY_APPLIED"),
      v.literal("DISCARDED")
    ),

    // v2: Scope & Configuration
    scope: v.optional(v.union(
      v.literal("tasks"),
      v.literal("accounting"),
      v.literal("elements"),
      v.literal("quote"),
      v.literal("knowledge"),
      v.literal("project"),
      v.literal("multi")
    )),
    baseSnapshot: v.optional(v.object({
      projectUpdatedAt: v.optional(v.number()),
      elementsUpdatedAt: v.optional(v.number()),
      tasksUpdatedAt: v.optional(v.number()),
      accountingUpdatedAt: v.optional(v.number()),
      quoteUpdatedAt: v.optional(v.number()),
    })),
    runConfig: v.optional(v.object({
      modelPreset: v.string(),
      allowWeb: v.boolean(),
      createImages: v.boolean(),
      selectedModules: v.array(v.string()), // e.g. ["critique", "risks"]
      tabContext: v.optional(v.string()),
      applyMode: v.optional(v.string())
    })),

    // v2: Results
    report_he: v.optional(v.any()), // Structured report payload
    gaps: v.optional(v.any()),      // structured gaps payload
    links: v.optional(v.array(v.object({
      title: v.string(),
      url: v.string(),
      domain: v.string(),
      publishedAt: v.optional(v.string()),
      usedFor_he: v.string()
    }))),
    generatedImages: v.optional(v.array(v.object({
      elementId: v.optional(v.string()),
      kind: v.string(), // "technical" | "client"
      imageRef: v.string(),
      caption_he: v.string()
    }))),

    // v2: Grouped suggestions
    changeGroups: v.optional(v.array(v.object({
      id: v.string(),
      title_he: v.string(),
      scope: v.string(),
      rationale_he: v.string(),
      riskLevel: v.string(), // "low"|"medium"|"high"
      requiresUserApproval: v.boolean(),
      operations: v.array(v.any()) // The ops
    }))),

    appliedGroupIds: v.optional(v.array(v.string())),
    appliedOpIndices: v.optional(v.array(v.number())),
    auditLogIds: v.optional(v.array(v.string())),
    userEdits: v.optional(v.any()),

    // Legacy / Flat Ops (kept for backward compatibility or simple runs)
    reason_he: v.optional(v.string()),
    base: v.optional(v.any()),
    ops: v.optional(v.array(v.object({
      kind: v.string(),
      payload: v.any(),
    }))),
    preview_he: v.optional(v.any()),
    sourceChangeSetId: v.optional(v.id("changeSets")),

    schemaVersion: v.optional(v.number()),

    createdAt: v.number(),
    createdBy: v.optional(v.object({
      type: v.union(v.literal("agent"), v.literal("user")),
      agentName: v.optional(v.string()),
      userId: v.optional(v.string())
    })),
    createdBy_he: v.optional(v.string()), // legacy simple string

    updatedAt: v.optional(v.number()),
    appliedAt: v.optional(v.number()),
    appliedBy_he: v.optional(v.string()),
    discardedAt: v.optional(v.number()),
    discardedBy_he: v.optional(v.string()),

    sourceSkillRunId: v.optional(v.id("skillRuns")), // Link to the skill run that produced this ChangeSet
  })
    .index("by_project", ["projectId"])
    .index("by_project_status", ["projectId", "status"])
    .index("by_project_stage", ["projectId", "stage"]),

  // Audit Logs (New)
  auditLogs: defineTable({
    projectId: v.id("projects"),
    changeSetId: v.id("changeSets"),
    groupId: v.optional(v.string()),
    operation: v.string(), // "create", "update", "softDelete", "link"
    entityRef: v.string(), // e.g. "task:123"
    before: v.optional(v.any()),
    after: v.optional(v.any()),
    appliedBy: v.optional(v.id("users")),
    appliedAt: v.number(),
  })
    .index("by_project", ["projectId"])
    .index("by_changeSet", ["changeSetId"]),


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
  suggestedElements: defineTable({
    projectId: v.id("projects"),
    title: v.string(),
    type: v.optional(v.string()),
    status: v.union(v.literal("pending"), v.literal("approved"), v.literal("rejected")),
    approvedElementId: v.optional(v.id("elements")),
    sourceMessageId: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_project", ["projectId"])
    .index("by_project_status", ["projectId", "status"]),


  // Element Snapshot Index (Analytics/Search)


  // -------------------------
  // Management Hub Tables
  // -------------------------

  // Customers
  customers: defineTable({
    customerId: v.string(),
    name: v.string(),
    nameNormalized: v.string(),
    status: customerStatus,
    notes: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_customerId", ["customerId"])
    .index("by_nameNormalized", ["nameNormalized"])
    .index("by_status", ["status"]),

  customerContacts: defineTable({
    customerId: v.id("customers"),
    name: v.string(),
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
    role: v.optional(v.string()),
    notes: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_customer", ["customerId"]),

  // Share Links
  shareLinks: defineTable({
    token: v.string(),
    projectId: v.id("projects"),
    scope: shareScope,
    quoteVersionId: v.optional(v.id("quoteVersions")),
    pdfFileId: v.optional(v.id("projectFiles")),
    expiresAt: v.optional(v.number()),
    createdBy: v.optional(v.union(v.literal("human"), v.literal("agent"))),
    createdByUserId: v.optional(v.id("users")),
    createdAt: v.number(),
  })
    .index("by_token", ["token"])
    .index("by_project", ["projectId"]),

  // Receipt Items
  receiptItems: defineTable({
    receiptId: v.id("receipts"),
    nameRaw: v.string(),
    qty: v.optional(v.number()),
    unit: v.optional(v.string()),
    unitPrice: v.optional(v.number()),
    total: v.optional(v.number()),
    vendorId: v.optional(v.id("vendors")),
    mappedAccountingLineId: v.optional(v.id("accountingLines")),
    mappedMaterialLineId: v.optional(v.id("materialLines")),
    mappedDraftMaterialId: v.optional(v.string()),
    mappedWorkLineId: v.optional(v.id("workLines")),
    mappedDraftWorkId: v.optional(v.string()),
    mappedTaskId: v.optional(v.id("tasks")),
    mappedElementId: v.optional(v.id("elements")),
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
  })
    .index("by_receipt", ["receiptId"])
    .index("by_mappedMaterialLine", ["mappedMaterialLineId"]),

  // Print Files
  printFiles: defineTable({
    printPartId: v.id("printParts"),
    projectId: v.id("projects"),
    fileId: v.id("projectFiles"),
    kind: v.union(
      v.literal("source"),
      v.literal("printReady"),
      v.literal("mockup")
    ),
    originalFilename: v.optional(v.string()),
    uploadedAt: v.number(),
    warnings: v.array(v.string()),
    createdAt: v.number(),
  }).index("by_printPart", ["printPartId"])
    .index("by_project", ["projectId"]),

  printFileAnalyses: defineTable({
    printFileId: v.id("printFiles"),
    widthPx: v.optional(v.number()),
    heightPx: v.optional(v.number()),
    dpiX: v.optional(v.number()),
    dpiY: v.optional(v.number()),
    pageCount: v.optional(v.number()),
    pageWidthMm: v.optional(v.number()),
    pageHeightMm: v.optional(v.number()),
    warnings: v.array(v.string()),
    createdAt: v.number(),
  }).index("by_printFile", ["printFileId"]),

  // Element Images
  elementImages: defineTable({
    projectId: v.id("projects"),
    elementId: v.id("elements"),
    fileId: v.optional(v.id("projectFiles")),
    url: v.optional(v.string()), // For AI/External images
    type: v.union(
      v.literal("engineering"),
      v.literal("illustration"),
      v.literal("reference")
    ),
    caption: v.optional(v.string()),
    createdFromChangeSetId: v.optional(v.id("changeSets")),
    createdAt: v.number(),
  })
    .index("by_element", ["elementId"])
    .index("by_project", ["projectId"]),

  // Employees / People
  employees: defineTable({
    displayName: v.string(),
    displayNameNormalized: v.optional(v.string()),
    role: v.string(),
    defaultDayRate: v.number(),
    active: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_displayNameNormalized", ["displayNameNormalized"]),

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
    metadata: v.optional(v.any()),
    createdAt: v.number(),
  })
    .index("by_conversation", ["conversationId"])
    .index("by_project", ["projectId"])
    .index("by_changeset", ["changeSetId"]),

  // -------------------------
  // Skills Architecture (New)
  // -------------------------

  // Skills Registry
  skills: defineTable({
    skillId: v.string(), // Unique key e.g. "elements_builder_full"
    labelHe: v.string(),
    descriptionHe: v.string(),
    category: v.string(), // "consult", "build", "review", "research", "audit"
    flow: v.optional(v.string()),
    scheduling: v.optional(v.object({
      suggestAfter: v.optional(v.array(v.string())),
      suggestAtStage: v.optional(v.array(v.string())),
    })),
    config: v.object({
      requiresClarifications: v.boolean(),
      clarificationsTargetSkillId: v.optional(v.string()),
      allowedTools: v.object({
        webSearch: v.boolean(),
        ragSearch: v.boolean(),
        fileInspect: v.boolean(),
        runSkill: v.optional(v.boolean()),
      }),
      outputContract: v.string(), // "blocks", "changeset"
    }),
    prompts: v.object({
      systemHeaderRef: v.string(),
      promptAddon: v.string(),
    }),
    model: v.optional(v.string()),
    isEnabled: v.boolean(),
    version: v.optional(v.number()),
  }).index("by_skillId", ["skillId"]),

  // Skill Runs
  skillRuns: defineTable({
    projectId: v.id("projects"),
    conversationId: v.id("agentConversations"),
    skillId: v.string(),
    status: v.union(v.literal("running"), v.literal("succeeded"), v.literal("failed")),
    inputParams: v.any(),
    blocks: v.optional(v.any()),
    usage: v.optional(v.any()),
    rawModelResponse: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_project", ["projectId"])
    .index("by_conversation", ["conversationId"]),

  // Clarification Sessions
  clarificationSessions: defineTable({
    projectId: v.id("projects"),
    conversationId: v.id("agentConversations"),
    targetSkillId: v.string(),
    questions: v.array(v.any()), // { id, text_he, type, options_he }
    answers: v.optional(v.any()), // Record<string, string>
    isSatisfied: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_project_target", ["projectId", "targetSkillId"])
    .index("by_conversation", ["conversationId"]),

  // Agent Conversations (New)
  agentConversations: defineTable({
    projectId: v.id("projects"),
    title: v.string(),
    mode: v.union(v.literal("chat"), v.literal("builder")),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_project", ["projectId"]),

  // Agent Messages (New)
  agentMessages: defineTable({
    conversationId: v.id("agentConversations"),
    role: v.union(v.literal("user"), v.literal("assistant"), v.literal("system")),
    text: v.optional(v.string()),
    blocks: v.optional(v.array(v.any())),
    runId: v.optional(v.id("skillRuns")),
    createdAt: v.number(),
  }).index("by_conversation", ["conversationId"]),

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
  }).index("by_project", ["projectId"])
    .index("by_project_stage", ["projectId", "stage"]),



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
      autoAppendEnabled: v.optional(v.boolean()),
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
      conversationId: v.optional(
        v.union(v.id("conversations"), v.id("agentConversations"), v.string())
      ),
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
    .index("by_project_linked", ["projectId", "linkedProjectId"])
    .index("by_linked_project", ["linkedProjectId"]),

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

  appSettings: defineTable({
    key: v.string(), // e.g. "global"
    value: v.any(),
  }).index("by_key", ["key"]),

  // LLM Traces
  llmTraces: defineTable({
    projectId: v.optional(v.id("projects")),
    conversationId: v.optional(v.union(v.id("conversations"), v.string())), // Relaxed to string to allow any ID type
    runId: v.optional(v.string()), // skill run id
    provider: v.string(), // "openai", "gemini", etc.
    model: v.string(),
    inputTokens: v.number(),
    outputTokens: v.number(),
    latencyMs: v.number(),
    status: v.union(v.literal("success"), v.literal("failed")),
    request: v.any(), // JSON
    response: v.any(), // JSON
    error: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_project", ["projectId"])
    .index("by_run", ["runId"])
    .index("by_conversation", ["conversationId"]),
});
