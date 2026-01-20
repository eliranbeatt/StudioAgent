import { action, mutation, query, internalAction, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import { extractBrainDumpStructuredDraft } from "./flow/brainDumpExtractor";
import { Id } from "./_generated/dataModel";


export const create = mutation({
  args: {
    name: v.optional(v.string()),
    clientName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    // Default name format: "YYYY-MM-DD HH:mm"
    const fallbackName = new Date(now).toISOString().replace("T", " ").substring(0, 16);

    const projectId = await ctx.db.insert("projects", {
      name: args.name ?? fallbackName,
      clientName: args.clientName,
      status: "active",
      currency: "NIS",
      description: "",
      projectTypes: [],
      defaults: {
        profitPct: 0.3,
        overheadPct: 0.15,
        riskPct: 0.1,
        excludeManagementLaborFromCost: true,
      },
      createdAt: now,
      updatedAt: now,
    });





    return projectId;
  },
});

export const list = query({
  handler: async (ctx) => {
    return await ctx.db.query("projects").order("desc").collect();
  },
});

export const listProjects = query({
  args: { excludeId: v.optional(v.id("projects")) },
  handler: async (ctx, args) => {
    const projects = await ctx.db.query("projects").order("desc").collect();
    return projects
      .filter((project) => project._id !== args.excludeId)
      .map((project) => ({
        id: project._id,
        name: project.name,
        status: project.status,
      }));
  },
});

export const getStats = query({
  args: { id: v.id("projects") },
  handler: async (ctx, args) => {
    const elements = await ctx.db
      .query("elements")
      .withIndex("by_project", (q) => q.eq("projectId", args.id))
      .collect();

    return {
      elementCount: elements.length,
    };
  },
});

export const getOverview = query({
  args: { id: v.union(v.id("projects"), v.id("structuredAnswers")) },
  handler: async (ctx, args) => {
    let projectId = args.id;

    // Handle structuredAnswer ID by resolving to its project
    const asAnswer = ctx.db.normalizeId("structuredAnswers", args.id);
    if (asAnswer) {
      const answer = await ctx.db.get(asAnswer);
      if (answer) {
        projectId = answer.projectId;
      } else {
        return null;
      }
    }

    // Now treat projectId as project ID (it might still be the original ID if normalization failed/matched project)
    // To be safe, force cast or just use it. 
    // If original was project ID, asAnswer is null (if table names differ).
    // Wait, normalizeId("structuredAnswers", projId) returns null. Correct.

    const project = await ctx.db.get(projectId as any);
    if (!project) {
      return null;
    }

    const elements = await ctx.db
      .query("elements")
      .withIndex("by_project", (q) => q.eq("projectId", project._id as any))
      .collect();



    return {
      project,
      elements: elements.map((el) => ({
        id: el._id,
        title: el.title,
        type: el.type,
        status: el.status,
        updatedAt: el.updatedAt,
      })),
      counts: {
        elementCount: elements.length,
      },
    };
  },
});

export const resolveProjectId = query({
  args: { id: v.string() },
  handler: async (ctx, args) => {
    const normalizedProject = ctx.db.normalizeId("projects", args.id);
    if (normalizedProject) {
      const project = await ctx.db.get(normalizedProject);
      if (project) return { projectId: normalizedProject };
    }

    const normalizedAnswer = ctx.db.normalizeId("structuredAnswers", args.id);
    if (normalizedAnswer) {
      const answer = await ctx.db.get(normalizedAnswer);
      if (answer?.projectId) return { projectId: answer.projectId };
    }

    return { projectId: null };
  },
});

export const getRecentElements = query({
  args: { projectId: v.id("projects"), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 5;
    const elements = await ctx.db
      .query("elements")
      .withIndex("by_project_updated", (q) => q.eq("projectId", args.projectId))
      .order("desc")
      .take(limit);

    return elements.map((el) => ({
      id: el._id,
      title: el.title,
      type: el.type,
      status: el.status,
      updatedAt: el.updatedAt,
    }));
  },
});

export const getTasksForElements = query({
  args: { projectId: v.id("projects"), elementIds: v.array(v.id("elements")) },
  handler: async (ctx, args) => {
    const results: Array<{ elementId: string; tasks: any[] }> = [];
    for (const elementId of args.elementIds) {
      const tasks = await ctx.db
        .query("tasks")
        .withIndex("by_element", (q) => q.eq("elementId", elementId))
        .collect();
      results.push({
        elementId,
        tasks: tasks.map((task) => ({
          id: task._id,
          title: task.title,
          status: task.status,
          estimatedHours:
            task.estimatedHours ?? (task.estimatedMinutes !== undefined ? task.estimatedMinutes / 60 : undefined),
          dedupKey: task.dedupKey,
        })),
      });
    }
    return results;
  },
});

export const getAccountingForElements = query({
  args: { projectId: v.id("projects"), elementIds: v.array(v.id("elements")) },
  handler: async (ctx, args) => {
    const results: Array<{ elementId: string; lines: any[] }> = [];
    for (const elementId of args.elementIds) {
      const lines = await ctx.db
        .query("accountingLines")
        .withIndex("by_element", (q) => q.eq("elementId", elementId))
        .collect();
      results.push({
        elementId,
        lines: lines.map((line) => ({
          id: line._id,
          title: line.title,
          type: line.type,
          total: line.total,
          qty: line.qty,
          unitCost: line.unitCost,
          dedupKey: line.dedupKey,
        })),
      });
    }
    return results;
  },
});

export const getPrintPartsForElements = query({
  args: { projectId: v.id("projects"), elementIds: v.array(v.id("elements")) },
  handler: async (ctx, args) => {
    const results: Array<{ elementId: string; parts: any[] }> = [];
    for (const elementId of args.elementIds) {
      const parts = await ctx.db
        .query("printParts")
        .withIndex("by_element", (q) => q.eq("elementId", elementId))
        .collect();
      results.push({
        elementId,
        parts: parts.map((part) => ({
          id: part._id,
          label: part.label,
          qty: part.qty,
          substrate: part.substrate,
          size: part.size,
          requiresProof: part.requiresProof,
        })),
      });
    }
    return results;
  },
});

export const updateProjectDetails = mutation({
  args: {
    id: v.id("projects"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    status: v.optional(v.union(v.literal("active"), v.literal("archived"), v.literal("lead"), v.literal("production"), v.literal("done"), v.literal("rejected"))),
    projectTypes: v.optional(v.array(v.string())),
    details: v.optional(
      v.object({
        eventDate: v.optional(v.number()),
        budgetCap: v.optional(v.number()),
        location: v.optional(v.string()),
        notes: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.id);
    if (!project) {
      throw new Error("Project not found.");
    }

    const updates: Record<string, any> = { updatedAt: Date.now() };
    if (args.name !== undefined) updates.name = args.name;
    if (args.description !== undefined) updates.description = args.description;
    if (args.status !== undefined) updates.status = args.status;
    if (args.projectTypes !== undefined) updates.projectTypes = args.projectTypes;
    if (args.details !== undefined) {
      const cleanDetails = Object.fromEntries(
        Object.entries(args.details).filter(([, value]) => value !== undefined)
      );
      if (Object.keys(cleanDetails).length > 0) {
        updates.details = {
          ...(project.details ?? {}),
          ...cleanDetails,
        };
      }
    }

    await ctx.db.patch(args.id, updates);
    return { ok: true };
  },
});



export const generateOverviewSummary = action({
  args: { id: v.id("projects") },
  handler: async (ctx, args) => {
    const overview = await ctx.runQuery(api.projects.getOverview, { id: args.id });
    if (!overview?.project) {
      throw new Error("Project not found.");
    }

    const files = await ctx.runQuery(api.files.listProjectFiles, {
      projectId: args.id,
    });

    const tasksRes = await ctx.runQuery(api.tasks.listForProject, {
      projectId: args.id,
    });

    const financials = await ctx.runQuery(api.financials.getFinancialSummary, {
      projectId: args.id,
    });

    const summary = await buildOverviewSummary({
      project: overview.project,
      elements: overview.elements ?? [],
      files: files ?? [],
      tasks: tasksRes?.tasks ?? [],
      financials,
    });

    await ctx.runMutation(api.projects.updateProjectSummary, {
      id: args.id,
      overviewSummary: summary,
    });

    return { summary };
  },
});

export const updateProjectSummary = mutation({
  args: {
    id: v.id("projects"),
    overviewSummary: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      overviewSummary: args.overviewSummary,
      updatedAt: Date.now(),
    });
    return { ok: true };
  },
});

export const listLinkedProjects = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const links = await ctx.db
      .query("projectLinks")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();

    const results: Array<any> = [];
    for (const link of links) {
      const project = await ctx.db.get(link.linkedProjectId);
      if (!project) continue;
      const digest = await ctx.db
        .query("projectDigests")
        .withIndex("by_project", (q) => q.eq("projectId", link.linkedProjectId))
        .first();
      results.push({
        linkId: link._id,
        mode: link.mode,
        project: {
          id: project._id,
          name: project.name,
          status: project.status,
        },
        digest: digest
          ? {
            summary: digest.summary,
            keyElements: digest.keyElements ?? [],
            fileHighlights: digest.fileHighlights ?? [],
          }
          : null,
      });
    }

    return results;
  },
});

export const linkProject = mutation({
  args: {
    projectId: v.id("projects"),
    linkedProjectId: v.id("projects"),
    mode: v.union(v.literal("contextOnly"), v.literal("importSuggestions")),
  },
  handler: async (ctx, args) => {
    if (args.projectId === args.linkedProjectId) {
      throw new Error("Cannot link project to itself.");
    }

    const existing = await ctx.db
      .query("projectLinks")
      .withIndex("by_project_linked", (q) =>
        q.eq("projectId", args.projectId).eq("linkedProjectId", args.linkedProjectId)
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        mode: args.mode,
        updatedAt: Date.now(),
      });
      return { id: existing._id, updated: true };
    }

    const id = await ctx.db.insert("projectLinks", {
      projectId: args.projectId,
      linkedProjectId: args.linkedProjectId,
      mode: args.mode,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    return { id, updated: false };
  },
});

export const unlinkProject = mutation({
  args: {
    projectId: v.id("projects"),
    linkedProjectId: v.id("projects"),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("projectLinks")
      .withIndex("by_project_linked", (q) =>
        q.eq("projectId", args.projectId).eq("linkedProjectId", args.linkedProjectId)
      )
      .first();

    if (!existing) return { ok: false };

    await ctx.db.delete(existing._id);
    return { ok: true };
  },
});

export const generateProjectDigest = mutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project) throw new Error("Project not found.");

    const elements = await ctx.db
      .query("elements")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
    const files = await ctx.db
      .query("projectFiles")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .order("desc")
      .take(6);

    const keyElements = elements.slice(0, 6).map((el) => ({
      id: el._id,
      title: el.title,
      type: el.type,
    }));

    const fileHighlights = files.map((file) =>
      file.summary ? `${file.fileName}: ${file.summary}` : file.fileName
    );

    const summaryParts = [
      project.description?.trim(),
      keyElements.length ? `Elements: ${keyElements.map((el) => el.title).join(", ")}.` : null,
      fileHighlights.length ? `Knowledge: ${fileHighlights.join(" | ")}.` : null,
    ].filter(Boolean);

    const summary = summaryParts.length > 0 ? summaryParts.join(" ") : "No summary available.";

    const existing = await ctx.db
      .query("projectDigests")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        summary,
        keyElements,
        fileHighlights,
        updatedAt: Date.now(),
      });
      return { id: existing._id, updated: true };
    }

    const id = await ctx.db.insert("projectDigests", {
      projectId: args.projectId,
      summary,
      keyElements,
      fileHighlights,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    return { id, updated: false };
  },
});

export const updateTaskOrder = mutation({
  args: {
    projectId: v.id("projects"),
    columnOrder: v.any(), // { todo: [taskId], ... }
  },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project) throw new Error("Project not found");

    const currentConfig = project.tasksConfiguration ?? {};
    await ctx.db.patch(args.projectId, {
      tasksConfiguration: {
        ...currentConfig,
        kanbanColumnOrder: args.columnOrder,
      },
      updatedAt: Date.now(),
    });
  },
});

export const deleteProject = mutation({
  args: { id: v.id("projects") },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.id);
    if (!project) {
      throw new Error("Project not found");
    }

    const projectId = args.id;

    // 1. Delete records with direct projectId and by_project index (or simple query)
    const tablesWithProjectIndex = [
      "elements",
      "tasks",
      "trelloSyncRuns",
      "trelloMappings",
      "accountingLines",
      "accountingSections",
      "materialLines",
      "workLines",
      "printParts",
      "receipts",
      "elementDrafts",
      "elementVersions",
      "projectCostContainers",
      "projectCostVersions",
      "quoteVersions",
      "budgetBaselines",
      "changeOrders",
      "changeSets",
      "auditLogs",
      "graveyardItems",
      "suggestedElements",
      "shareLinks",
      "printFiles",
      "elementImages",
      "projectFiles",
      "inventoryReservations",
      "conversations",
      "conversationMessages",
      "structuredAnswers",
      "memoryDocs",
      "qaPairs",
      "projectDigests",
    ];

    for (const table of tablesWithProjectIndex) {
      const records = await ctx.db
        .query(table as any)
        .withIndex("by_project", (q: any) => q.eq("projectId", projectId))
        .collect();

      // Special handling for nested children or storage
      if (table === "receipts") {
        for (const receipt of records) {
          const items = await ctx.db
            .query("receiptItems")
            .withIndex("by_receipt", (q: any) => q.eq("receiptId", receipt._id))
            .collect();
          for (const item of items) await ctx.db.delete(item._id);
        }
      }

      if (table === "printFiles") {
        for (const pf of records) {
          const analyses = await ctx.db
            .query("printFileAnalyses")
            .withIndex("by_printFile", (q: any) => q.eq("printFileId", pf._id))
            .collect();
          for (const analysis of analyses) await ctx.db.delete(analysis._id);
        }
      }

      if (table === "conversations") {
        for (const conv of records) {
          const legacyMessages = await ctx.db
            .query("messages")
            .withIndex("by_conversation", (q: any) => q.eq("conversationId", conv._id))
            .collect();
          for (const msg of legacyMessages) await ctx.db.delete(msg._id);
        }
      }

      if (table === "projectFiles") {
        for (const file of records) {
          if (file.storageId) {
            try {
              await ctx.storage.delete(file.storageId);
            } catch (e) {
              console.error(`Failed to delete storage file ${file.storageId}`, e);
            }
          }
        }
      }

      for (const record of records) {
        await ctx.db.delete(record._id);
      }
    }

    // 2. Delete from tables containing projectId but without by_project index

    // purchases
    const purchases = await ctx.db
      .query("purchases")
      .filter((q) => q.eq(q.field("projectId"), projectId))
      .collect();
    for (const p of purchases) await ctx.db.delete(p._id);

    // budgetAdjustments
    const budgetAdjustments = await ctx.db
      .query("budgetAdjustments")
      .filter((q) => q.eq(q.field("projectId"), projectId))
      .collect();
    for (const ba of budgetAdjustments) await ctx.db.delete(ba._id);

    // taskRevisions (Index is by_task or by_project_status)
    const taskRevisions = await ctx.db
      .query("taskRevisions")
      .withIndex("by_project_status", (q: any) => q.eq("projectId", projectId))
      .collect();
    for (const tr of taskRevisions) await ctx.db.delete(tr._id);

    // 3. Project Links (both directions)
    const linksAsSource = await ctx.db
      .query("projectLinks")
      .withIndex("by_project", (q: any) => q.eq("projectId", projectId))
      .collect();
    for (const link of linksAsSource) await ctx.db.delete(link._id);

    const linksAsTarget = await ctx.db
      .query("projectLinks")
      .withIndex("by_linked_project", (q: any) => q.eq("linkedProjectId", projectId))
      .collect();
    for (const link of linksAsTarget) await ctx.db.delete(link._id);

    // 4. Finally delete the project itself
    await ctx.db.delete(projectId);

    return { success: true };
  },
});

export const getTaskOrder = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    return project?.tasksConfiguration?.kanbanColumnOrder ?? null;
  },
});


async function buildOverviewSummary({
  project,
  elements,
  files,
  tasks,
  financials,
}: {
  project: any;
  elements: any[];
  files: any[];
  tasks: any[];
  financials: any;
}) {
  const apiKey = process.env.OPENAI_API_KEY;
  const elementList = elements.slice(0, 12).map((el) => {
    const elTasks = (tasks ?? []).filter((t) => t.elementId === el.id);
    const taskTitles = elTasks.slice(0, 5).map(t => t.title).join(", ");
    return `- ${el.title} (${el.type}): משימות עיקריות: ${taskTitles || 'אין עדיין'}`;
  });

  const fileList = (files ?? []).slice(0, 8).map((file) =>
    file.summary ? `${file.fileName}: ${file.summary}` : file.fileName
  );

  const fallbackSummary = [
    project.description?.trim(),
    elements.length ? `Elements: ${elements.map(e => e.title).join(", ")}.` : "No elements yet.",
    fileList.length ? `Knowledge: ${fileList.join(" | ")}.` : null,
  ]
    .filter(Boolean)
    .join(" ");

  if (!apiKey) {
    return fallbackSummary;
  }

  const contextData = {
    projectName: project.name,
    customerName: project.customerName || project.clientName || "לא צוין",
    description: project.description || "אין תיאור",
    elements: elements.map(el => {
      const elTasks = (tasks ?? []).filter((t) => t.elementId === el.id);
      const elMaterials = el.materials ?? []; // Note: materials might need to be passed in or fetched if not in elements
      return {
        title: el.title,
        type: el.type,
        status: el.status,
        tasks: elTasks.map(t => ({ title: t.title, status: t.status })),
        // Add more if available
      };
    }),
    files: fileList,
    financials: financials ? {
      baseline: financials.baseline,
      forecast: financials.forecast,
      effectiveBudget: financials.effectiveBudget,
      variance: financials.variance,
    } : "אין נתונים פיננסיים"
  };

  const systemPrompt = `You are a professional project coordinator for a set design and production studio.\nYour task is to write a comprehensive project summary in HEBREW.\n\nStructure the response as follows:\n1. **Short Concise Summary**: 2-3 sentences summarizing the project goals and the customer.\n2. **Deep Elaborated Description**:\n   - A detailed overview of the project scope.\n   - For each element: explain what it is, its status, key tasks, and relevant materials/vendors.\n   - Accounting & Financial status: Mention if there's an approved quote, total budget vs forecast, and estimated profit/margins.\n   - Mention any critical constraints or missing information.\n\nLANGUAGE: HEBREW ONLY.\nTONE: Professional, practical, and clear.`;

  const userPrompt = `Project Context JSON:\n${JSON.stringify(contextData, null, 2)}`;

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-5-mini", // Requested model
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.3,
        max_tokens: 1500,
      }),
    });

    if (!response.ok) {
      // Fallback to gpt-4o-mini if gpt-5-mini is not available
      const retryResponse = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          temperature: 0.3,
          max_tokens: 1500,
        }),
      });
      if (!retryResponse.ok) return fallbackSummary;
      const retryData = await retryResponse.json();
      const retryContent = retryData?.choices?.[0]?.message?.content;
      return typeof retryContent === "string" && retryContent.trim() ? retryContent.trim() : fallbackSummary;
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    return typeof content === "string" && content.trim() ? content.trim() : fallbackSummary;
  } catch {
    return fallbackSummary;
  }
}

// ------------------------------------------------------------
// New Project Modal & AI Summary Implementation
// ------------------------------------------------------------

export const createProjectFromModal = mutation({
  args: {
    name: v.optional(v.string()),
    customerId: v.optional(v.id("customers")),
    customerNameNew: v.optional(v.string()),
    types: v.array(v.string()),
    eventDate: v.optional(v.string()), // ISO string
    notes: v.optional(v.string()),
    brainDumpRaw: v.optional(v.string()),
    status: v.union(v.literal("lead"), v.literal("production"), v.literal("done"), v.literal("rejected")),
    elements: v.array(v.string()), // Element names
  },
  handler: async (ctx, args) => {
    // 1. Resolve Customer
    let customerId = args.customerId;
    let customerName = args.customerNameNew;

    if (!customerId && args.customerNameNew) {
      const normalized = args.customerNameNew.trim().toLowerCase();
      // @ts-ignore
      const existing = await ctx.db
        .query("customers")
        .withIndex("by_nameNormalized", (q) => q.eq("nameNormalized", normalized))
        .first();

      if (existing) {
        customerId = existing._id;
        customerName = existing.name;
      } else {
        const newCustId = "CUST-" + Math.random().toString(36).substr(2, 9).toUpperCase();
        customerId = await ctx.db.insert("customers", {
          customerId: newCustId,
          name: args.customerNameNew.trim(),
          nameNormalized: normalized,
          status: "active",
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
        customerName = args.customerNameNew.trim();
      }
    } else if (customerId) {
      // If ID provided, ensure we have the name
      const existing = await ctx.db.get(customerId);
      if (existing) {
        customerName = existing.name;
      }
    }

    // 2. Determine Project Name
    let finalName = args.name;
    if (!finalName || !finalName.trim()) {
      const dateStr = new Date().toISOString().slice(0, 16).replace("T", " ");
      finalName = customerName ? `${dateStr} - ${customerName}` : dateStr;
    }

    // 3. Create Project
    const brainDumpText = typeof args.brainDumpRaw === "string" ? args.brainDumpRaw.trim() : "";

    const projectId = await ctx.db.insert("projects", {
      name: finalName,
      customerId: customerId,
      customerName: customerName,
      // @ts-ignore
      customerNameRaw: args.customerNameNew,
      // @ts-ignore
      types: args.types, // These are projectTypes effectively
      projectTypes: args.types, // Map to existing field as well for compatibility
      // @ts-ignore
      status: args.status,
      // @ts-ignore
      eventDate: args.eventDate,
      // @ts-ignore
      notes: args.notes,
      // @ts-ignore
      summaryStatus: "queued",
      // @ts-ignore
      summary: "",
      currency: "NIS", // Default
      createdAt: Date.now(),
      updatedAt: Date.now(),
      defaults: {
        profitPct: 0.3,
        overheadPct: 0.15,
        riskPct: 0.1,
        excludeManagementLaborFromCost: true,
      },
      details: {
        eventDate: args.eventDate ? new Date(args.eventDate).getTime() : undefined,
        notes: args.notes
      },
      brainDumpRaw: brainDumpText || undefined,
      brainDumpStructuredDraft: brainDumpText ? extractBrainDumpStructuredDraft(brainDumpText) : undefined,
    });

    // 4. Create Elements (Live)
    let sortOrder = 1;
    for (const elName of args.elements) {
      if (!elName.trim()) continue;
      await ctx.db.insert("elements", {
        projectId,
        title: elName,
        type: "mixed", // Default
        status: "approvedForQuote",
        // @ts-ignore
        order: sortOrder++,
        tags: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }

    // 5. Schedule Summary Generation
    await ctx.scheduler.runAfter(0, internal.projects.generateInitialSummary, { projectId });

    if (brainDumpText) {
      const snippet = brainDumpText.length > 4000 ? `${brainDumpText.slice(0, 4000)}\n\n[...truncated...]` : brainDumpText;
      await ctx.scheduler.runAfter(0, internal.memory.appendUserInput, {
        projectId,
        text: `Brain dump (wizard)\n\n${snippet}`,
      });
    }

    return projectId;
  },
});

export const generateInitialSummary = internalAction({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    // 1. Update status to generating
    await ctx.runMutation(internal.projects.updateSummaryStatus, {
      projectId: args.projectId,
      status: "generating"
    });

    try {
      // 2. Load Data
      const project = await ctx.runQuery(api.projects.getProjectInternal, { id: args.projectId });
      if (!project) throw new Error("Project not found");

      const elements = await ctx.runQuery(api.projects.getElementsInternal, { projectId: args.projectId });

      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) throw new Error("Missing OPENAI_API_KEY");

      // 2.1 AI Reasoning for Search Query
      const projectDataStr = `
Project Name: ${project.name}
Customer: ${project.customerName || "N/A"}
Event Date: ${project.eventDate || "N/A"}
Types: ${(project.projectTypes || []).join(", ")}
Notes: ${project.notes || project.description || "None"}
Elements: ${(elements || []).map((e: any) => e.title).join(", ")}
`;

      let searchContext = "";
      let sources: { title: string; url: string }[] = [];

      try {
        // Step 1: Ask AI if we need to search and what for
        const searchReasoningRes = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({
            model: "gpt-5-mini",
            messages: [
              { role: "system", content: "You are an expert researcher. You have project details. Your goal is to find external context (event details, customer visual style, technical specs) to help write a summary. Return a SINGLE Google search query that would be most helpful. If the project description is self-contained or generic (e.g. 'Build a box'), return 'EMPTY'." },
              { role: "user", content: projectDataStr }
            ],
            temperature: 0.2, // Low temp for decision making
            max_tokens: 50
          })
        });

        const reasoningData = await searchReasoningRes.json();
        const aiSuggestedQuery = reasoningData.choices?.[0]?.message?.content?.trim() || "EMPTY";

        console.log("AI Search Decision:", aiSuggestedQuery);

        if (aiSuggestedQuery !== "EMPTY" && aiSuggestedQuery.length > 5) {
          const { searchWeb } = await import("./lib/webSearch");
          const searchResult = await searchWeb(aiSuggestedQuery);
          if (searchResult && !searchResult.error && searchResult.results) {
            searchContext = `Extracted Web Knowledge (Query: "${aiSuggestedQuery}"):\n${searchResult.results.map((r: any) => `- ${r.title}: ${r.content}`).join("\n")}\n\n`;
            sources = searchResult.results.map((r: any) => ({ title: r.title, url: r.url }));
          }
        }
      } catch (err) {
        console.error("AI search reasoning failed", err);
      }

      // 3. Prepare AI Prompt
      const systemPrompt = `You are a professional project coordinator for a set design studio (Output language: Hebrew).
Write a concise project summary based on the details provided.
Do not add fluff.
Sections:
- **מה זה הפרויקט**
- **דדליין / אירוע**
- **סוגי עבודה (Workstreams)**
- **אלמנטים**
- **דגשים / מגבלות**
- **מה חסר (שאלות פתוחות קצרות)**`;

      const userPrompt = `Project: ${project.name}
Customer: ${project.customerName || "N/A"}
Event Date: ${project.eventDate || "N/A"}
Types: ${(project.projectTypes || []).join(", ")}
Notes: ${project.notes || project.description || "None"}
Elements: ${(elements || []).map((e: any) => e.title).join(", ")}

${searchContext}`;



      // 4. Call AI
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-5-mini", // Strong model for reasoning
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt }
          ]
        })
      });

      if (!response.ok) throw new Error("AI call failed");
      const data = await response.json();
      const summary = data.choices[0].message.content;

      // 5. Save Result
      await ctx.runMutation(internal.projects.saveSummary, {
        projectId: args.projectId,
        summary,
        status: "ready",
        sources
      });

    } catch (error: any) {
      console.error("Summary generation failed:", error);
      await ctx.runMutation(internal.projects.saveSummary, {
        projectId: args.projectId,
        summary: "",
        status: "failed",
        error: error.message
      });
    }
  },
});

export const retrySummary = mutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    // @ts-ignore
    await ctx.db.patch(args.projectId, { summaryStatus: "queued", summaryError: undefined });
    await ctx.scheduler.runAfter(0, internal.projects.generateInitialSummary, { projectId: args.projectId });
  }
});

// Internal helpers for the action
export const updateSummaryStatus = internalMutation({
  args: { projectId: v.id("projects"), status: v.string() },
  handler: async (ctx, args) => {
    // Safe cast string to union if possible or just use string if schema is loose during dev
    // @ts-ignore
    await ctx.db.patch(args.projectId, { summaryStatus: args.status });
  }
});

export const saveSummary = internalMutation({
  args: {
    projectId: v.id("projects"),
    summary: v.string(),
    status: v.string(),
    error: v.optional(v.string()),
    sources: v.optional(v.array(v.object({ title: v.string(), url: v.optional(v.string()) })))
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.projectId, {
      // @ts-ignore
      summary: args.summary,
      // @ts-ignore
      summaryStatus: args.status,
      // @ts-ignore
      summaryError: args.error,
      // @ts-ignore
      summarySources: args.sources,
      // @ts-ignore
      summaryUpdatedAt: Date.now()
    });
  }
});

// Simple getters for action to read data safely
export const getProjectInternal = query({
  args: { id: v.id("projects") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  }
});

export const getElementsInternal = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    return await ctx.db.query("elements").withIndex("by_project", q => q.eq("projectId", args.projectId)).collect();
  }
});
