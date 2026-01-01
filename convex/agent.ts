import { mutation, query, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import OpenAI from "openai";

export const getOrCreateConversation = mutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("conversations")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .filter((q) => q.eq(q.field("status"), "active"))
      .first();

    if (existing) return existing._id;

    return await ctx.db.insert("conversations", {
      projectId: args.projectId,
      status: "active",
      stage: "ideation",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

export const listMessages = query({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("messages")
      .withIndex("by_conversation", (q) => q.eq("conversationId", args.conversationId))
      .order("asc")
      .collect();
  },
});

export const sendMessage = mutation({
  args: {
    conversationId: v.id("conversations"),
    content: v.string(),
    channel: v.union(v.literal("free"), v.literal("structured")),
    model: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // 1. Save user message
    const userMessageId = await ctx.db.insert("messages", {
      conversationId: args.conversationId,
      role: "user",
      content: args.content,
      type: "text",
      channel: args.channel,
      createdAt: Date.now(),
    });

    // 2. Simple Skill Routing + structured intake
    let responseContent = "I'm processing your request. How else can I help with the project?";
    let responseType: "text" | "questions" | "changeSet" = "text";
    let skillUsed = "general_chat";
    let metadata: any = undefined;

    const inputLower = args.content.toLowerCase();
    const structuredFields =
      args.channel === "structured" ? parseStructuredFields(args.content) : {};
    const conversation = await ctx.db.get(args.conversationId);
    const projectId = conversation?.projectId;
    const stage = conversation?.stage ?? "ideation";
    const fileContext = projectId
      ? await ctx.db
        .query("projectFiles")
        .withIndex("by_project", (q) => q.eq("projectId", projectId))
        .order("desc")
        .take(5)
      : [];

    const stageSkillMap: Record<string, { free: string; structured: string }> = {
      ideation: { free: "ideation_chat", structured: "ideation_questions" },
      planning: { free: "planning_chat", structured: "planning_questions" },
      solutioning: { free: "solutioning_chat", structured: "solutioning_questions" },
    };

    const patchOpsCandidate = extractPatchOps(args.content);
    if (patchOpsCandidate && projectId) {
      const draft = await findDefaultDraft(ctx, projectId);
      if (draft) {
        responseContent = "Proposed ChangeSet ready for review.";
        responseType = "changeSet";
        skillUsed = "change_set_builder";
        metadata = {
          draftType: draft.draftType,
          draftId: draft.draftId,
          baseRevisionNumber: draft.revisionNumber,
          patchOps: patchOpsCandidate,
          fileContext: fileContext.map((file) => ({
            fileName: file.fileName,
            summary: file.summary ?? "",
          })),
        };
      } else {
        responseContent = "No open draft found to apply this ChangeSet.";
        responseType = "text";
        skillUsed = "change_set_builder";
      }
    }

    if (!metadata && args.channel === "structured") {
      skillUsed = stageSkillMap[stage]?.structured ?? "ideation_questions";
      if (structuredFields.title && projectId) {
        const elementType = normalizeElementType(structuredFields.type);
        const elementId = await ctx.db.insert("elements", {
          projectId,
          title: structuredFields.title,
          type: elementType,
          status: "drafting",
          tags: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });

        const draftId = await ctx.db.insert("elementDrafts", {
          elementId,
          projectId,
          status: "open",
          revisionNumber: 1,
          createdFrom: { tab: "Studio", stage: "structured" },
          workingSnapshot: {
            title: structuredFields.title,
            tasks: { byId: {} },
            labor: { byId: {} },
            materials: { byId: {} },
            subcontract: { byId: {} },
            notes: [],
            meta: { version: 1 },
          },
          schemaVersion: 1,
          createdBy: undefined,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });

        await ctx.db.patch(elementId, { currentDraftId: draftId });
        await ctx.runMutation(internal.brain.createSectionForElementInternal, {
          projectId,
          elementId,
          title: structuredFields.title,
        });

        responseContent = `Created element "${structuredFields.title}" (${elementType}). You can add tasks, materials, and labor next.`;
        responseType = "text";
        skillUsed = "create_element";
        metadata = { createdElementId: elementId, draftId };
      } else if (structuredFields.title && !projectId) {
        responseContent = "Missing project context. Please refresh the page and try again.";
        responseType = "text";
        skillUsed = "system_error";
      } else {
        responseContent = "Answer these and I will create the element:";
        responseType = "questions";
        skillUsed = stageSkillMap[stage]?.structured ?? "ideation_questions";
        metadata = {
          questions: [
            { id: "title", label: "Element title", required: true },
            { id: "type", label: "Element type (build|print|install|subcontract|mixed)", required: true },
            { id: "dimensions", label: "Dimensions or size (optional)", required: false },
            { id: "finish", label: "Finish / materials preference (optional)", required: false },
          ],
          hint: "Reply in this format: title: ... | type: ... | dimensions: ...",
          fileContext: fileContext.map((file) => ({
            fileName: file.fileName,
            summary: file.summary ?? "",
          })),
        };
      }
    } else if (!metadata) {
      // ---------------------------------------------------------
      // REAL LLM INTEGRATION
      // ---------------------------------------------------------
      if (process.env.OPENAI_API_KEY) {
        try {
          const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

          // Map abstract models to real OpenAI models
          let targetModel = "gpt-4o"; // Default for "gpt-5.2" or fallback
          if (args.model === "gpt-5-mini" || args.model === "gpt-5-nano") {
            targetModel = "gpt-4o-mini";
          }
          // For "thinking", we could add a system instruction or use a refined model if available.
          // For now, mapping to gpt-4o is safest.

          const systemInstructions = `You are AgenticEshet, a studio assistant for project management.
Current Stage: ${stage}
Context:
${fileContext.map((f) => `- ${f.fileName}: ${f.summary ?? "no summary"}`).join("\n")}

You help with ideation, planning, and task management. Be concise and helpful.`;

          const completion = await client.chat.completions.create({
            model: targetModel,
            messages: [
              { role: "system", content: systemInstructions },
              { role: "user", content: args.content },
            ],
          });

          const llmResponse = completion.choices[0]?.message?.content;
          if (llmResponse) {
            responseContent = llmResponse;
            skillUsed = `llm_${args.model?.replace(/[^a-zA-Z0-9]/g, "_") ?? "default"}`;
          } else {
            responseContent = "I couldn't generate a response (empty from AI).";
          }
        } catch (err: any) {
          console.error("OpenAI Error:", err);
          responseContent = `I encountered an issue connecting to the AI brain: ${err.message}`;
        }
      } else {
        // Fallback Mocks if no API Key
        skillUsed = stageSkillMap[stage]?.free ?? "general_chat";
        if (inputLower.includes("budget") || inputLower.includes("cost")) {
          responseContent = "I can summarize financials in the Accounting tab and flag missing cost lines.";
          skillUsed = "financial_overview";
        } else if (inputLower.includes("task")) {
          responseContent = "Tell me which element to add tasks to, and the task list.";
          skillUsed = "task_planning";
        } else if (fileContext.length > 0) {
          const fileList = fileContext.map((f) => `- ${f.fileName}: ${f.summary ?? "no summary"}`).join("\n");
          responseContent = `I found project files that might help:\n${fileList}\nTell me what you want to extract or change.`;
          skillUsed = "project_context";
        }
      }
    }

    // 3. Save Agent response
    const agentMessageId = await ctx.db.insert("messages", {
      conversationId: args.conversationId,
      role: "agent",
      content: responseContent,
      type: responseType,
      channel: args.channel,
      skillUsed,
      metadata,
      createdAt: Date.now(),
    });

    await ctx.db.patch(args.conversationId, { updatedAt: Date.now() });

    return {
      userMessageId,
      agentMessageId,
      projectId,
      stage,
    };
  },
});

export const getConversation = query({
  args: { id: v.id("conversations") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  }
})

export const setConversationStage = mutation({
  args: {
    id: v.id("conversations"),
    stage: v.union(v.literal("ideation"), v.literal("planning"), v.literal("solutioning")),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { stage: args.stage, updatedAt: Date.now() });
    return { ok: true };
  },
});

export const getStructuredAnswers = query({
  args: {
    projectId: v.id("projects"),
    stage: v.union(v.literal("ideation"), v.literal("planning"), v.literal("solutioning")),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("structuredAnswers")
      .withIndex("by_project_stage", (q) =>
        q.eq("projectId", args.projectId).eq("stage", args.stage)
      )
      .first();
  },
});

export const saveStructuredAnswers = mutation({
  args: {
    projectId: v.id("projects"),
    stage: v.union(v.literal("ideation"), v.literal("planning"), v.literal("solutioning")),
    answers: v.any(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("structuredAnswers")
      .withIndex("by_project_stage", (q) =>
        q.eq("projectId", args.projectId).eq("stage", args.stage)
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        answers: args.answers,
        updatedAt: Date.now(),
      });
      return { id: existing._id, updated: true };
    }

    const id = await ctx.db.insert("structuredAnswers", {
      projectId: args.projectId,
      stage: args.stage,
      answers: args.answers,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    return { id, updated: false };
  },
});

export const createElementFromStructured = mutation({
  args: {
    projectId: v.id("projects"),
    title: v.string(),
    type: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const elementType = normalizeElementType(args.type);
    const elementId = await ctx.db.insert("elements", {
      projectId: args.projectId,
      title: args.title,
      type: elementType,
      status: "drafting",
      tags: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const draftId = await ctx.db.insert("elementDrafts", {
      elementId,
      projectId: args.projectId,
      status: "open",
      revisionNumber: 1,
      createdFrom: { tab: "Studio", stage: "structured" },
      workingSnapshot: {
        title: args.title,
        tasks: { byId: {} },
        labor: { byId: {} },
        materials: { byId: {} },
        subcontract: { byId: {} },
        notes: [],
        meta: { version: 1 },
      },
      schemaVersion: 1,
      createdBy: undefined,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    await ctx.db.patch(elementId, { currentDraftId: draftId });
    await ctx.runMutation(internal.brain.createSectionForElementInternal, {
      projectId: args.projectId,
      elementId,
      title: args.title,
    });

    return { elementId, draftId, type: elementType };
  },
});

export const generateTaskPatchOps = mutation({
  args: {
    projectId: v.id("projects"),
    stage: v.union(v.literal("ideation"), v.literal("planning"), v.literal("solutioning")),
    elementId: v.optional(v.id("elements")),
  },
  handler: async (ctx, args) => {
    const draft = args.elementId
      ? await findDraftForElement(ctx, args.elementId)
      : await findDefaultDraft(ctx, args.projectId);

    if (!draft) {
      throw new Error("No open draft found for task generation.");
    }

    const structured = await ctx.db
      .query("structuredAnswers")
      .withIndex("by_project_stage", (q) =>
        q.eq("projectId", args.projectId).eq("stage", args.stage)
      )
      .first();

    const fileContext = await ctx.db
      .query("projectFiles")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .order("desc")
      .take(5);

    const tasks = buildTasksFromContext(args.stage, structured?.answers ?? {}, fileContext);
    const now = Date.now();
    const patchOps = tasks.map((task, index) => {
      const id = `task_${now}_${index}`;
      return {
        op: "add",
        path: `/tasks/byId/${id}`,
        value: {
          id,
          title: task.title,
          domain: task.domain,
          status: "todo",
        },
      };
    });

    return {
      draftType: "element" as const,
      draftId: draft.draftId,
      baseRevisionNumber: draft.revisionNumber,
      patchOps,
      summary: `Generated ${patchOps.length} tasks from ${args.stage} context.`,
    };
  },
});

export const estimateTaskDependencies = mutation({
  args: {
    projectId: v.id("projects"),
    elementId: v.optional(v.id("elements")),
  },
  handler: async (ctx, args) => {
    const draft = args.elementId
      ? await findDraftForElement(ctx, args.elementId)
      : await findDefaultDraft(ctx, args.projectId);

    if (!draft) {
      throw new Error("No open draft found for task estimation.");
    }

    const draftDoc = await ctx.db.get(draft.draftId);
    const snapshot = draftDoc?.workingSnapshot ?? {};
    const tasksMap = snapshot?.tasks?.byId ?? {};
    const tasks = Object.values<any>(tasksMap).filter((task) => !task?.deletedAt);

    const domainRank = new Map<string, number>([
      ["planning", 1],
      ["design", 2],
      ["procurement", 3],
      ["fabrication", 4],
      ["finishing", 5],
      ["print", 6],
      ["installation", 7],
      ["logistics", 8],
      ["qa", 9],
      ["admin", 10],
    ]);

    const sorted = tasks
      .map((task) => ({
        ...task,
        domainKey: String(task?.domain ?? "").toLowerCase(),
      }))
      .sort((a, b) => {
        const rankA = domainRank.get(a.domainKey) ?? 99;
        const rankB = domainRank.get(b.domainKey) ?? 99;
        if (rankA !== rankB) return rankA - rankB;
        return String(a.title ?? "").localeCompare(String(b.title ?? ""));
      });

    const patchOps: any[] = [];
    for (let index = 0; index < sorted.length; index++) {
      const task = sorted[index];
      const taskId = String(task.id ?? "");
      if (!taskId) continue;

      const shouldEstimate =
        task.estimatedMinutes === undefined ||
        task.estimatedMinutes === null ||
        Number(task.estimatedMinutes) <= 0;
      if (shouldEstimate) {
        patchOps.push({
          op: "replace",
          path: `/tasks/byId/${taskId}/estimatedMinutes`,
          value: estimateMinutesForTask(task),
        });
      }

      const dependencies = Array.isArray(task.dependencies) ? task.dependencies : [];
      if (dependencies.length === 0 && index > 0) {
        const previousTask = sorted[index - 1];
        if (previousTask?.id) {
          patchOps.push({
            op: "replace",
            path: `/tasks/byId/${taskId}/dependencies`,
            value: [String(previousTask.id)],
          });
        }
      }
    }

    return {
      draftType: "element" as const,
      draftId: draft.draftId,
      baseRevisionNumber: draft.revisionNumber,
      patchOps,
      summary: `Estimated dependencies and time for ${sorted.length} tasks.`,
    };
  },
});

async function findDefaultDraft(ctx: any, projectId: string) {
  const draft = await ctx.db
    .query("elementDrafts")
    .withIndex("by_project", (q: any) => q.eq("projectId", projectId))
    .filter((q: any) =>
      q.or(q.eq(q.field("status"), "open"), q.eq(q.field("status"), "needsReview"))
    )
    .first();

  if (draft) {
    return {
      draftType: "element" as const,
      draftId: draft._id,
      revisionNumber: draft.revisionNumber,
    };
  }

  return null;
}

async function findDraftForElement(ctx: any, elementId: any) {
  const element = await ctx.db.get(elementId);
  if (!element?.currentDraftId) return null;
  const draft = await ctx.db.get(element.currentDraftId);
  if (!draft || (draft.status !== "open" && draft.status !== "needsReview")) return null;
  return {
    draftType: "element" as const,
    draftId: draft._id,
    revisionNumber: draft.revisionNumber,
  };
}

function extractPatchOps(content: string) {
  const trimmed = content.trim();
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    try {
      const parsed = JSON.parse(trimmed);
      return Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  const patchPrefix = "patchOps:";
  if (trimmed.toLowerCase().startsWith(patchPrefix)) {
    const jsonPart = trimmed.slice(patchPrefix.length).trim();
    try {
      const parsed = JSON.parse(jsonPart);
      return Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  return null;
}

function buildTasksFromContext(
  stage: "ideation" | "planning" | "solutioning",
  answers: Record<string, string>,
  files: Array<{ fileName: string; summary?: string }>
) {
  const tasks: Array<{ title: string; domain: string }> = [];
  const contextText = [
    ...Object.values(answers),
    ...files.map((f) => `${f.fileName} ${f.summary ?? ""}`),
  ]
    .join(" ")
    .toLowerCase();

  if (stage === "ideation") {
    tasks.push(
      { title: "Site measurements & constraints", domain: "planning" },
      { title: "Concept options & moodboard", domain: "design" },
      { title: "Rough materials & vendors shortlist", domain: "procurement" }
    );
  }

  if (stage === "planning") {
    tasks.push(
      { title: "Finalize dimensions & drawings", domain: "design" },
      { title: "Procurement plan & lead times", domain: "procurement" },
      { title: "Fabrication plan & schedule", domain: "fabrication" },
      { title: "Finish specification", domain: "finishing" },
      { title: "Transport & install plan", domain: "installation" }
    );
  }

  if (stage === "solutioning") {
    tasks.push(
      { title: "Cut list & prep", domain: "fabrication" },
      { title: "Assembly & joinery", domain: "fabrication" },
      { title: "Surface prep & finishing", domain: "finishing" },
      { title: "QA & pack", domain: "logistics" },
      { title: "Install & handoff", domain: "installation" }
    );
  }

  if (contextText.includes("print")) {
    tasks.push({ title: "Print production", domain: "print" });
  }
  if (contextText.includes("install") || contextText.includes("installation")) {
    tasks.push({ title: "On-site installation", domain: "installation" });
  }
  if (contextText.includes("electrical") || contextText.includes("lighting")) {
    tasks.push({ title: "Electrical setup & testing", domain: "electrical" });
  }
  if (contextText.includes("metal")) {
    tasks.push({ title: "Metalwork fabrication", domain: "fabrication" });
  }

  const unique = new Map<string, { title: string; domain: string }>();
  for (const task of tasks) {
    unique.set(task.title, task);
  }
  return Array.from(unique.values());
}

function estimateMinutesForTask(task: any) {
  const title = String(task?.title ?? "").toLowerCase();
  const domain = String(task?.domain ?? "").toLowerCase();

  const domainMinutes: Record<string, number> = {
    planning: 120,
    design: 180,
    procurement: 90,
    fabrication: 240,
    finishing: 180,
    print: 120,
    installation: 240,
    logistics: 90,
    qa: 60,
    admin: 60,
  };

  const matchKeyword = (keywords: string[]) =>
    keywords.some((keyword) => title.includes(keyword));

  if (matchKeyword(["install", "setup", "on-site"])) return 240;
  if (matchKeyword(["fabricate", "build", "assembly", "joinery"])) return 240;
  if (matchKeyword(["finish", "surface", "paint", "sand"])) return 180;
  if (matchKeyword(["design", "draw", "concept", "moodboard"])) return 180;
  if (matchKeyword(["procure", "vendor", "order", "purchase"])) return 90;
  if (matchKeyword(["qa", "quality", "test"])) return 60;
  if (matchKeyword(["pack", "ship", "logistics", "transport"])) return 90;

  return domainMinutes[domain] ?? 90;
}

function parseStructuredFields(content: string) {
  const fields: Record<string, string> = {};
  const parts = content.split(/[|\n]/);
  for (const part of parts) {
    const [rawKey, ...rawValue] = part.split(/[:=]/);
    if (!rawKey || rawValue.length === 0) continue;
    const key = rawKey.trim().toLowerCase();
    const value = rawValue.join(":").trim();
    if (!value) continue;
    fields[key] = value;
  }
  return fields;
}

function normalizeElementType(input?: string) {
  const allowed = new Set([
    "build",
    "rent",
    "print",
    "transport",
    "install",
    "subcontract",
    "mixed",
  ]);
  const value = (input ?? "").trim().toLowerCase();
  return allowed.has(value) ? (value as any) : "build";
}
