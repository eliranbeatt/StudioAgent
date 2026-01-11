import { mutation, query, internalMutation, action } from "./_generated/server";
import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import OpenAI from "openai";
import { searchWeb } from "./lib/webSearch";

const AGENT_PROMPT_VERSION = "agentPromptsSchemaAlignedV7";

const SYSTEM_PROMPT = `You are an AI studio producer for "Emlly Studio" in Tel Aviv (set design + fabrication + installs + rentals + printing).
Your outputs must be practical (buildable, priceable, installable) - not demo-level.
You work inside a Product Console with Projects + Elements + Tasks + Accounting + Purchases/Receipts.

Language policy (STRICT):
- Instructions in English.
- All user-facing prose must be in Hebrew (except product/brand names, material codes/specs, tool model numbers, file names, URLs, and JSON keys).
- Never print internal enum keys (e.g., "printing_graphics") in prose; use Hebrew labels.

Hard rules:
1. No generic tasks. Every task must be executable and tool-aware.
2. Always cover the full lifecycle when relevant: build + finish + pack + transport + install + teardown/returns.
3. Time estimates are required (minutes or hours) and must be consistent with the checklist.
4. Dependencies are required when a task cannot start without another.
5. Dates: If anchors are missing, default 'plannedStartDate' to TODAY. Schedule tasks assuming a 10-hour workday. If a day is full (>10h work), move subsequent/dependent tasks to the next day. Calculate 'plannedEndDate' = start + estimatedMinutes. Always populate 'estimatedMinutes' (default 90 if unknown).
6. BOM must be structured (qty/unit/spec/waste/vendor/lead time). Prices must be clearly marked as estimates with source/assumption.
7. When the deliverable leaves the studio (mall / set / event), create:
   - a Transport element (or tasks under a transport workstream),
   - an Install element,
   - a Teardown/Returns element.
8. Always set workType + workTypeLabelHe on tasks, and on checklist items when relevant.
9. For cost lines, use materialLine.create/workLine.create and include:
   - lineType: "material" | "work"
   - sectionKey (English) + sectionLabelHe (Hebrew)
   - taskId or taskTempOrId to link to a task.`;

const DEVELOPER_PROMPT = `
Output format:
1. First, write your response in Hebrew (plain text).
2. Then, if you need to provide a structured block, output it inside a JSON code block.

Example:
????? ??????...
\`\`\`json
{ "type": "QuestionsBlock", ... }
\`\`\`

If you output a structured block, prefer a JSON object with:
{
  "blocks": [ <primary block>, <next steps SuggestionBlock> ]
}
You may still output a single block, but if you do NOT output a ChangeSetBlock or QuestionsBlock,
you MUST include a SuggestionBlock with 2-3 next steps.

Stage is one of: IDEATION | QUOTE | BREAKDOWN.
Mode is one of: CHAT | QUESTIONS | SUGGESTIONS (hint only).

Next-best-action policy (choose exactly one): ANSWER | ASK | SUGGEST | PROPOSE_CHANGESET.
Anti-bloat: if you are about to output > 12 bullets, stop and choose a smaller next step.
If you are not providing a ChangeSetBlock or QuestionsBlock, output a SuggestionBlock with 2-3 next steps.

Deduplication Rules:
- Before creating a task or cost line, check the provided context to see if it exists.
- If it exists, use 'task.patch' or 'accountingLine.patch' instead of '.create'.
- For new items, always provide a 'dedupKey' (e.g., 'task_install_pvc') to ensure idempotency.

When citing web search results or providing URLs, YOU MUST use Markdown format: [Link Title](URL). Do not use bare URLs.

## Block schemas (preferred)
QuestionsBlock:
{
  "type": "QuestionsBlock",
  "title_he": "...",
  "questions": [ { "id": "...", "question_he": "...", "type": "text|date|number|single|multi|toggle" } ]
}

PlanBlock:
{
  "type": "PlanBlock",
  "title_he": "...",
  "summary_he": "...",
  "tasksSummary": { "taskCount": 0, "hasDates": true, "hasChecklists": true },
  "bomSummary": { "materialLines": 0, "laborLines": 0, "confidenceAvg": 0.0 }
}

SuggestionBlock:
{
  "type": "SuggestionBlock",
  "title_he": "...",
  "items": [ { "id": "...", "label_he": "...", "payload": ... } ]
}

ChangeSetBlock:
{
  "type": "ChangeSetBlock",
  "title_he": "...",
  "summary_he": "...",
  "changes": { ... },
  "diffPreview_he": { ... },
  "proposedChangeSet": {
    "reason_he": "...",
    "base": { 
      "elements": [ { "elementId": "...", "rev": 1 } ] 
    },
    "ops": [ { "kind": "...", "payload": { ... } } ]
  },
  "actions": [ { "id": "apply", "label_he": "..." }, { "id": "discard", "label_he": "..." } ]
}

Legacy ClarificationBlock (still supported):
{
  "type": "ClarificationBlock",
  "title_he": "...",
  "questions": [ { "id": "...", "text_he": "...", "inputType": "..." } ]
}

Allowed ChangeSet ops kinds & payloads (use 'tempId' to link new items):

1. task.create payload:
{
  "tempId": "...",
  "elementTempOrId": "...",
  "fields": {
    "title": "...",
    "dedupKey": "...", // OPTIONAL: A unique string to prevent duplicate creation if the agent runs multiple times
    "description": "...",
    "stage": "build"|"install"|"...",
    "workType": "metal_fab"|"printing_graphics"|"...",
    "workTypeLabelHe": "...",
    "plannedStartDate": "YYYY-MM-DD",
    "plannedEndDate": "YYYY-MM-DD",
    "estimatedMinutes": 180,
    "dependencies": ["taskIdA", "taskIdB"],
    "checklist": [
      { "id":"c1","title":"...","order":0,"done":false,"estimatedMinutes":30,"workType":"...","workTypeLabelHe":"..." }
    ]
  }
}

  2. task.patch payload:
  {
    "taskId": "...",
    "fields": {
      "title": "...",
      "description": "...",
      "stage": "build"|"install"|"...",
      "workType": "metal_fab"|"printing_graphics"|"...",
      "workTypeLabelHe": "...",
      "plannedStartDate": "YYYY-MM-DD",
      "plannedEndDate": "YYYY-MM-DD",
      "estimatedMinutes": 180,
      "dependencies": ["taskIdA", "taskIdB"],
      "checklist": [
        { "id":"c1","title":"...","order":0,"done":false,"estimatedMinutes":30,"workType":"...","workTypeLabelHe":"..." }
      ]
    }
  }

  3. accountingLine.create payload:
  {
    "elementTempOrId": "...",
    "taskTempOrId": "...",
    "fields": {
      "title": "...",
      "dedupKey": "...", // OPTIONAL: Unique key to prevent duplicates
      "type": "material" | "labor" | "subcontract" | "other",
      "lineType": "material" | "work",
      "sectionKey": "...",
      "sectionLabelHe": "...",
      "itemName": "...",
      "spec": "...",
      "qty": 24,
      "unit": "m",
      "wastePct": 0.1,
      "unitCostEstimate": 18,
      "vendorId": "...",
      "vendorTempOrId": "...",
      "vendorName": "...",
      "leadTimeDays": 2,
      "source": "estimate",
      "confidence": 0.55,
      "notes": "...",
      "workType": "..." (for labor)
    }
  }

  4. accountingLine.patch payload:
  {
    "accountingLineId": "...",
    "fields": {
      "title": "...",
      "type": "material" | "labor" | "subcontract" | "other",
      "lineType": "material" | "work",
      "sectionKey": "...",
      "sectionLabelHe": "...",
      "qty": 24,
      "unit": "m",
      "wastePct": 0.1,
      "unitCostEstimate": 18,
      "vendorId": "...",
      "vendorTempOrId": "...",
      "vendorName": "...",
      "leadTimeDays": 2,
      "source": "estimate",
      "confidence": 0.55,
      "notes": "...",
      "workType": "..."
    }
  }
  
  5. materialLine.create payload:
  {
    "tempId": "...",
    "elementTempOrId": "...",
    "taskTempOrId": "...",
    "fields": {
      "lineType": "material",
      "sectionKey": "...",
      "sectionLabelHe": "...",
      "itemName": "...",
      "spec": "...",
      "quantity": 2,
      "unitCode": "ea",
      "unitLabelHe": "...",
      "plannedUnitCost": 18,
      "plannedTotalCost": 36,
      "procurementCode": "...",
      "procurementLabelHe": "...",
      "leadTimeDays": 2,
      "vendorName": "..."
    }
  }

  6. workLine.create payload:
  {
    "tempId": "...",
    "elementTempOrId": "...",
    "taskTempOrId": "...",
    "fields": {
      "lineType": "work",
      "sectionKey": "...",
      "sectionLabelHe": "...",
      "roleHe": "...",
      "rateTypeCode": "hour" | "day" | "flat",
      "rateTypeLabelHe": "...",
      "plannedQuantity": 3,
      "plannedUnitCost": 250,
      "crewSize": 1,
      "isManagement": false
    }
  }

  7. element.patch payload:
  {
    "elementId": "...", // REQUIRED
    "patch": { "title": "...", "status": "..." },
    "draftPatch": { "merge": { ... } }
  }

  8. element.create / vendor.create / purchase.create (standard)

  9. Deletion ops:
  - "task.delete": { "taskId": "..." }
  - "materialLine.delete": { "lineId": "..." }
  - "workLine.delete": { "lineId": "..." }
  - "accountingLine.delete": { "lineId": "..." }`;

const STAGE_MODULES: Record<string, string> = {
  IDEATION: `Stage = IDEATION. Objective: Turn brief into 5–10 feasible element ideas. Rough budget + lead time range + key risks.
  V3 addition: Identify major workstreams early (Metal? Print? Rent?).`,

  QUOTE: `Stage = QUOTE.Objective: Convert chosen elements into a quote-ready structure.
  V3 rules:
- Generate structured BOM(accountingLines with qty / unit / spec).
  - Explicit labor lines for Studio vs Install.
  - If date constraints are unknown, ask.`,

  BREAKDOWN: `Stage = BREAKDOWN.Objective: Atomic tasks + dependencies + risks + shopping / pickup plan.
  V3 rules:
- Parent tasks(1 - 4h) MUST have atomic checklists.
  - Assign workType to every task.
  - Set plannedStartDate if anchors exist.
  - Verify "Studio Completeness": Transport, Install, Teardown, QA.`,
};

const MODE_NUDGES: Record<string, string> = {
  CHAT: "Mode = CHAT. Default to plain text unless a block is clearly better.",
  QUESTIONS: "Mode = QUESTIONS. Prefer a QuestionsBlock if blocked.",
  SUGGESTIONS: "Mode = SUGGESTIONS. Prefer a SuggestionBlock early.",
};

function normalizeStage(stage?: string): "IDEATION" | "QUOTE" | "BREAKDOWN" {
  if (!stage) return "IDEATION";
  const upper = stage.toUpperCase();
  if (upper === "IDEATION" || upper === "QUOTE" || upper === "BREAKDOWN") return upper;
  if (upper === "PLANNING") return "QUOTE";
  if (upper === "SOLUTIONING") return "BREAKDOWN";
  return "IDEATION";
}

function normalizeMode(mode?: string): "CHAT" | "QUESTIONS" | "SUGGESTIONS" {
  if (!mode) return "CHAT";
  const upper = mode.toUpperCase();
  if (upper === "CHAT" || upper === "QUESTIONS" || upper === "SUGGESTIONS") return upper;
  return "CHAT";
}

function safeParseAgentResponse(raw: string) {
  // New format: Text then optional ```json ... ``` (or ``` ... ```)
  try {
    const blockMatch = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (!blockMatch) {
      // No block, just text
      return { assistantText_he: raw.trim(), block: null };
    }

    const textPart = raw.slice(0, blockMatch.index ?? 0).trim();
    const jsonPart = blockMatch[1]?.trim() ?? "";

    let block: any = null;
    try {
      const parsed = JSON.parse(jsonPart);
      if (parsed && typeof parsed === "object") {
        if (Array.isArray(parsed)) {
          block = parsed;
        } else if (Array.isArray((parsed as any).blocks)) {
          block = (parsed as any).blocks;
        } else if ((parsed as any).block) {
          block = (parsed as any).block;
        } else {
          block = parsed;
        }
      }
    } catch (e) {
      console.error("Failed to parse JSON block", e);
    }

    return { assistantText_he: textPart, block };
  } catch {
    return { assistantText_he: raw, block: null };
  }
}

export const listConversations = query({
  args: { projectId: v.union(v.id("projects"), v.id("structuredAnswers")) },
  handler: async (ctx, args) => {
    let finalProjectId = args.projectId;

    const asAnswer = ctx.db.normalizeId("structuredAnswers", args.projectId);
    if (asAnswer) {
      const answer = await ctx.db.get(asAnswer);
      if (answer) {
        finalProjectId = answer.projectId;
      } else {
        return []; // Answer not found, so no project context
      }
    }

    // Ensure we have a valid project ID now
    if (!finalProjectId || !ctx.db.normalizeId("projects", finalProjectId)) {
      return [];
    }

    return await ctx.db
      .query("conversations")
      .withIndex("by_project_updated", (q) => q.eq("projectId", finalProjectId as any))
      .order("desc")
      .collect();
  },
});

export const createConversation = mutation({
  args: {
    projectId: v.id("projects"),
    stage: v.optional(v.union(v.literal("IDEATION"), v.literal("QUOTE"), v.literal("BREAKDOWN"))),
    mode: v.optional(v.union(v.literal("CHAT"), v.literal("QUESTIONS"), v.literal("SUGGESTIONS"))),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("conversations", {
      projectId: args.projectId,
      status: "active",
      stage: args.stage ?? "IDEATION",
      mode: args.mode ?? "CHAT",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

export const listConversationMessages = query({
  args: { conversationId: v.id("conversations"), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 40;
    const messages = await ctx.db
      .query("conversationMessages")
      .withIndex("by_conversation", (q) => q.eq("conversationId", args.conversationId))
      .order("desc")
      .take(limit);
    return messages.reverse();
  },
});

export const appendUserMessage = mutation({
  args: { conversationId: v.id("conversations"), text_he: v.string() },
  handler: async (ctx, args) => {
    const conversation = await ctx.db.get(args.conversationId);
    if (!conversation) throw new Error("Conversation not found");
    const messageId = await ctx.db.insert("conversationMessages", {
      conversationId: args.conversationId,
      projectId: conversation.projectId,
      role: "user",
      text_he: args.text_he,
      createdAt: Date.now(),
    });
    await ctx.db.patch(args.conversationId, { updatedAt: Date.now() });
    return messageId;
  },
});

export const appendEventMessage = mutation({
  args: {
    conversationId: v.id("conversations"),
    eventType: v.string(),
    eventPayload: v.any(),
  },
  handler: async (ctx, args) => {
    const conversation = await ctx.db.get(args.conversationId);
    if (!conversation) throw new Error("Conversation not found");
    const messageId = await ctx.db.insert("conversationMessages", {
      conversationId: args.conversationId,
      projectId: conversation.projectId,
      role: "event",
      eventType: args.eventType,
      eventPayload: args.eventPayload,
      createdAt: Date.now(),
    });
    await ctx.db.patch(args.conversationId, { updatedAt: Date.now() });
    return messageId;
  },
});

export const appendAssistantMessage = mutation({
  args: {
    conversationId: v.id("conversations"),
    text_he: v.string(),
    block: v.optional(v.any()),
    changeSetId: v.optional(v.id("changeSets")),
  },
  handler: async (ctx, args) => {
    const conversation = await ctx.db.get(args.conversationId);
    if (!conversation) throw new Error("Conversation not found");
    const messageId = await ctx.db.insert("conversationMessages", {
      conversationId: args.conversationId,
      projectId: conversation.projectId,
      role: "assistant",
      text_he: args.text_he,
      block: args.block,
      changeSetId: args.changeSetId,
      createdAt: Date.now(),
    });
    await ctx.db.patch(args.conversationId, { updatedAt: Date.now() });
    return messageId;
  },
});

export const setConversationStageV1 = mutation({
  args: {
    id: v.id("conversations"),
    stage: v.union(v.literal("IDEATION"), v.literal("QUOTE"), v.literal("BREAKDOWN")),
  },
  handler: async (ctx, args) => {
    const conversation = await ctx.db.get(args.id);
    if (!conversation) throw new Error("Conversation not found");

    await ctx.db.patch(args.id, { stage: args.stage, updatedAt: Date.now() });

    // Also update project stage if this is an advance (or even if it's just setting it)
    // We respect the monotonic rule here too to be safe, or we trust the agent?
    // Let's trust the agent's intent to switch stage. 
    // But we should check if we are "advancing" or "regressing".
    // Actually, simply setting it allows the agent to control it.
    // But recomputeStage might fight it if we regress.
    // Let's set it. recomputeStage logic in projectsStage.ts prevents regression *from computed signals*,
    // but if we set it here, we are effectively committing it.

    const project = await ctx.db.get(conversation.projectId);
    if (project) {
      const order = { IDEATION: 0, QUOTE: 1, BREAKDOWN: 2 };
      const currentOrder = order[project.stage ?? "IDEATION"] ?? 0;
      const newOrder = order[args.stage] ?? 0;

      if (newOrder > currentOrder) {
        await ctx.db.patch(project._id, { stage: args.stage, updatedAt: Date.now() });
      }
    }

    return { ok: true };
  },
});

export const setConversationMode = mutation({
  args: {
    id: v.id("conversations"),
    mode: v.union(v.literal("CHAT"), v.literal("QUESTIONS"), v.literal("SUGGESTIONS")),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { mode: args.mode, updatedAt: Date.now() });
    return { ok: true };
  },
});

export const setConversationTitle = mutation({
  args: {
    id: v.id("conversations"),
    title_he: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { title_he: args.title_he, updatedAt: Date.now() });
    return { ok: true };
  },
});

export const setConversationStatus = mutation({
  args: {
    id: v.id("conversations"),
    status: v.union(v.literal("active"), v.literal("archived")),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { status: args.status, updatedAt: Date.now() });
    return { ok: true };
  },
});

export const agentRespond = action({
  args: {
    conversationId: v.id("conversations"),
    model: v.optional(v.string()),
    uiContext: v.optional(v.object({
      selectedElementIds: v.optional(v.array(v.id("elements"))),
    })),
  },
  handler: async (ctx, args) => {
    const conversation = await ctx.runQuery(api.agent.getConversation, { id: args.conversationId });
    if (!conversation) throw new Error("Conversation not found");

    const project = await ctx.runQuery(api.projects.getOverview, { id: conversation.projectId });
    const stage = normalizeStage(conversation.stage);
    const mode = normalizeMode(conversation.mode);

    const recentMessages = await ctx.runQuery(api.agent.listConversationMessages, {
      conversationId: args.conversationId,
      limit: 30,
    });

    const userMessages = recentMessages.filter((msg) => msg.role === "user" && msg.text_he);
    const hasTitle = Boolean(String(conversation.title_he ?? "").trim());
    if (!hasTitle && userMessages.length >= 2 && process.env.OPENAI_API_KEY) {
      const titleInputs = userMessages.slice(0, 2).map((msg) => String(msg.text_he ?? "").trim());
      if (titleInputs.every((text) => text.length > 0)) {
        try {
          const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
          const completion = await client.chat.completions.create({
            model: "gpt-4o-mini",
            temperature: 0.2,
            max_tokens: 20,
            messages: [
              {
                role: "system",
                content:
                  "Create a short, concise Hebrew conversation title (2-5 words) based on the two user messages. No quotes, no punctuation.",
              },
              {
                role: "user",
                content: `Message 1: ${titleInputs[0]}\nMessage 2: ${titleInputs[1]}\nTitle:`,
              },
            ],
          });
          let title = String(completion.choices[0]?.message?.content ?? "").trim();
          title = title.replace(/^["'“”‘’]+|["'“”‘’]+$/g, "");
          title = title.replace(/[.?!]+$/g, "");
          title = title.replace(/\s+/g, " ").trim();
          if (title.length > 60) title = title.slice(0, 60).trim();
          if (title) {
            await ctx.runMutation(api.agent.setConversationTitle, {
              id: conversation._id,
              title_he: title,
            });
          }
        } catch (err) {
          console.error("Failed to auto-title conversation", err);
        }
      }
    }

    const selectedIds = args.uiContext?.selectedElementIds ?? [];
    const selectedElements = [];
    for (const id of selectedIds) {
      const element = await ctx.runQuery(api.elements.getElementDetail, { elementId: id });
      if (element?.element) {
        selectedElements.push(element);
      }
    }

    const recentElements = await ctx.runQuery(api.projects.getRecentElements, {
      projectId: conversation.projectId,
      limit: 5,
    });

    const lastUserMessage = [...recentMessages].reverse().find((msg) => msg.role === "user");
    const lastText = String(lastUserMessage?.text_he ?? "").toLowerCase();
    const wantsTasks = /task|משימ/.test(lastText);
    const wantsAccounting = /cost|price|budget|quote|תקציב|מחיר/.test(lastText);
    const wantsPrinting = /print|printing|דפוס/.test(lastText);

    const taskDetails = wantsTasks
      ? await ctx.runQuery(api.projects.getTasksForElements, {
        projectId: conversation.projectId,
        elementIds: selectedIds,
      })
      : [];
    const accountingDetails = wantsAccounting
      ? await ctx.runQuery(api.projects.getAccountingForElements, {
        projectId: conversation.projectId,
        elementIds: selectedIds,
      })
      : [];
    const printDetails = wantsPrinting
      ? await ctx.runQuery(api.projects.getPrintPartsForElements, {
        projectId: conversation.projectId,
        elementIds: selectedIds,
      })
      : [];

    const contextPayload = {
      project,
      stage,
      mode,
      promptVersion: AGENT_PROMPT_VERSION,
      conversation: recentMessages.map((msg) => ({
        role: msg.role,
        text_he: msg.text_he,
        eventType: msg.eventType,
        eventPayload: msg.eventPayload,
      })),
      selectedElements,
      recentElements,
      tasks: taskDetails,
      accounting: accountingDetails,
      printing: printDetails,
    };

    let responseText = "";

    // 1. Create Placeholder Message immediately (so UI shows "Thinking" or streaming)
    const agentMessageId = await ctx.runMutation(internal.agent.createPlaceholderMessage, {
      conversationId: args.conversationId,
      projectId: conversation.projectId,
    });

    const selectedAction = getSelectedActionFromEvents(recentMessages);
    if (selectedAction) {
      const handled = await handleSuggestionAction({
        ctx,
        agentMessageId,
        projectId: conversation.projectId,
        stage,
        actionId: selectedAction,
      });
      if (handled) {
        return { messageId: agentMessageId, changeSetId: undefined };
      }
    }

    try {
      if (process.env.OPENAI_API_KEY) {
        const user = await ctx.runQuery(api.users.getViewer);
        const requestedModel = args.model || user?.preferredModel || "gpt-5-mini";

        let targetModel = requestedModel;
        let reasoningEffort: "medium" | "high" | undefined = undefined;

        if (requestedModel === "gpt-5.2-thinking") {
          targetModel = "gpt-5.2";
          reasoningEffort = "medium";
        }

        const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        const supportsTemperature = (model: string) =>
          !model.startsWith("gpt-5") && !model.startsWith("o1");
        const isUnsupportedTemperatureError = (err: any) => {
          const message = String(err?.message ?? "");
          return /temperature/i.test(message) && /unsupported/i.test(message);
        };

        const forcedAction = selectedAction ? `User selected action: ${selectedAction}. You must execute it.` : "";

        // Initial Message Chain
        let messages: any[] = [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "system", content: DEVELOPER_PROMPT },
          { role: "system", content: STAGE_MODULES[stage] ?? "" },
          { role: "system", content: MODE_NUDGES[mode] ?? "" },
          ...(forcedAction ? [{ role: "system", content: forcedAction }] : []),
          { role: "user", content: `Context JSON: \n${JSON.stringify(contextPayload)} ` },
        ];

        // Define Tools
        const tools: any[] = [
          {
            type: "function",
            function: {
              name: "web_search",
              description: "Search the web for real-time information, such as prices, material specs, or instructions. Use this when you need facts not in the context.",
              parameters: {
                type: "object",
                properties: {
                  query: { type: "string", description: "The search query (e.g. 'Birch Plywood 18mm price Israel')." }
                },
                required: ["query"]
              }
            }
          }
        ];

        let loopCount = 0;
        const MAX_LOOPS = 4;
        let isFinalResponse = false;

        while (loopCount < MAX_LOOPS && !isFinalResponse) {
          loopCount++;

          const payload: any = {
            model: targetModel,
            messages: messages,
            stream: true,
            tools: tools,
            tool_choice: "auto",
          };

          if (reasoningEffort) {
            payload.reasoning_effort = reasoningEffort;
          } else if (supportsTemperature(targetModel)) {
            payload.temperature = 0.2;
          }

          let stream;
          try {
            stream = await client.chat.completions.create(payload);
          } catch (err: any) {
            if (payload.temperature !== undefined && isUnsupportedTemperatureError(err)) {
              const retryPayload = { ...payload };
              delete retryPayload.temperature;
              stream = await client.chat.completions.create(retryPayload);
            } else {
              throw err;
            }
          }

          let lastUpdate = Date.now();
          let chunkCount = 0;

          let currentToolCalls: any[] = [];
          let currentContent = "";

          for await (const chunk of stream as any) {
            const delta = chunk.choices[0]?.delta;

            // Handle Content
            if (delta?.content) {
              currentContent += delta.content;
              responseText += delta.content;
              chunkCount++;

              // Update DB occasionally to create "streaming" effect
              const jsonIndex = responseText.indexOf("```json");
              const isInsideBlock = jsonIndex !== -1 && jsonIndex < responseText.length - 10;

              if (!isInsideBlock && (chunkCount % 5 === 0 || Date.now() - lastUpdate > 300)) {
                const updateResult = await ctx.runMutation(internal.agent.updateMessageContent, {
                  messageId: agentMessageId,
                  text_he: responseText,
                });
                if (updateResult?.cancelled) {
                  try { if ((stream as any).controller) (stream as any).controller.abort(); } catch (e) { }
                  isFinalResponse = true; // Break outer loop
                  break;
                }
                lastUpdate = Date.now();
              }
            }

            // Handle Tool Calls
            if (delta?.tool_calls) {
              for (const toolCall of delta.tool_calls) {
                const index = toolCall.index;
                if (!currentToolCalls[index]) {
                  currentToolCalls[index] = {
                    index,
                    id: toolCall.id,
                    type: toolCall.type,
                    function: { name: "", arguments: "" }
                  };
                }
                if (toolCall.id) currentToolCalls[index].id = toolCall.id;
                if (toolCall.function?.name) currentToolCalls[index].function.name += toolCall.function.name;
                if (toolCall.function?.arguments) currentToolCalls[index].function.arguments += toolCall.function.arguments;
              }
            }
          }

          // Check if cancelled
          if (isFinalResponse && chunkCount > 0 && responseText.includes("(Cancelled)")) break;

          if (currentToolCalls.length > 0) {
            // Push assistant message (with tool_calls) to history
            messages.push({
              role: "assistant",
              content: currentContent || null,
              tool_calls: currentToolCalls
            });

            // Execute tools
            for (const call of currentToolCalls) {
              if (call.function.name === "web_search") {
                let args;
                try { args = JSON.parse(call.function.arguments); } catch (e) { args = { query: "" }; }

                // UI feedback: show what we are doing
                await ctx.runMutation(internal.agent.updateMessageContent, {
                  messageId: agentMessageId,
                  text_he: responseText + `\n\n*(מחפש: ${args.query})...*`
                });

                const result = await searchWeb(args.query);

                messages.push({
                  role: "tool",
                  tool_call_id: call.id,
                  content: JSON.stringify(result)
                });

                // Clear the "searching" text from the main responseText so it doesn't get persisted permanently in the middle?
                // Actually, keeping it as a record is fine, or we can rely on the next token update to overwrite it if we didn't commit it to responseText.
                // But responseText is what we finally save. 
                // Let's add it to responseText so the user sees the history of actions.
                responseText += `\n\n*(תוצאות חיפוש עבור "${args.query}" התקבלו)*\n`;
              } else {
                messages.push({
                  role: "tool",
                  tool_call_id: call.id,
                  content: JSON.stringify({ error: "Unknown tool" })
                });
              }
            }
            // Loop continues -> OpenAI parses tool results and gives final answer
          } else {
            isFinalResponse = true;
          }
        }
      } else {
        responseText = "OpenAI API key missing.";
      }
    } catch (e: any) {
      console.error("Agent Streaming Error:", e);
      responseText += "\n(Error generating response: " + e.message + ")";
    }

    const parsed = safeParseAgentResponse(responseText);
    const hasJsonFence = /```/i.test(responseText);
    console.log("Agent response length:", responseText.length);
    console.log("Agent response preview:", responseText.slice(0, 400));
    console.log("Agent response tail:", responseText.slice(-400));
    if (hasJsonFence && !parsed.block) {
      console.warn("Agent JSON parse failed; block is null.");
    }

    // If we have a structured block, handle it (creating ChangeSets, etc.)
    let block = parsed.block;
    let changeSetId: any = undefined;

    const blocksList = Array.isArray(block) ? block.filter(Boolean) : block ? [block] : [];

    if (blocksList.length === 0) {
      block = [buildNextStepSuggestionBlock(stage)];
    }

    const changeSetBlockIndex = blocksList.findIndex(
      (item: any) => item?.type === "ChangeSetBlock" && item?.proposedChangeSet
    );
    if (changeSetBlockIndex !== -1) {
      const changeSetBlock = blocksList[changeSetBlockIndex];
      try {
        const proposed = changeSetBlock.proposedChangeSet;
        // Ensure ops and base don't have invalid keys if they are dynamic
        // But ops is usually structured. 'base' might be the issue if it has dynamic keys?
        // Actually, the error likely came from 'changes' or 'base' having Hebrew keys.
        // Let's sanitize 'block' fully before saving.

        const invalidOriginal = findInvalidFieldNames({ ops: proposed.ops, base: proposed.base });
        if (invalidOriginal.length > 0) {
          console.warn("Invalid field names in proposed ChangeSet:", invalidOriginal.slice(0, 50));
        }

        // Ensure ops is an array
        let opsPayload = sanitizeForConvex(proposed.ops ?? []);
        if (!Array.isArray(opsPayload)) {
          if (opsPayload && typeof opsPayload === "object") opsPayload = [opsPayload];
          else opsPayload = [];
        }

        // Deep normalization of ops to ensure { kind, payload } structure
        opsPayload = opsPayload
          .map((op: any) => {
            if (!op || typeof op !== "object") return null;

            let kind = op.kind;
            let payload = op.payload;

            // 1. Fallback: 'type' instead of 'kind'
            if (!kind && op.type && typeof op.type === "string") {
              kind = op.type;
            }

            // 2. Fallback: Single-key object pattern e.g. { "task.create": { ... } }
            if (!kind) {
              const keys = Object.keys(op).filter((k) => k !== "_invalidFields");
              if (keys.length === 1) {
                const potentialKind = keys[0];
                if (typeof op[potentialKind] === "object") {
                  kind = potentialKind;
                  payload = op[potentialKind];
                }
              }
            }

            if (typeof kind !== "string") return null; // Drop if we still can't find a string kind

            return {
              kind,
              payload: payload ?? {},
            };
          })
          .filter((op: any) => op !== null);

        const sanitizedBase = sanitizeForConvex(proposed.base);
        const invalidSanitized = findInvalidFieldNames({ ops: opsPayload, base: sanitizedBase });

        if (invalidSanitized.length > 0) {
          console.error("Sanitized ChangeSet still has invalid fields:", invalidSanitized.slice(0, 50));
        } else {
          try {
            changeSetId = await ctx.runMutation(api.changeSets.createChangeSet, {
              projectId: conversation.projectId,
              stage,
              ops: opsPayload,
              reason_he: proposed.reason_he || undefined, // undefined if null/empty
              preview_he: proposed.preview_he || undefined,
              base: sanitizedBase,
            });
          } catch (createError: any) {
            console.error("Failed to CREATE ChangeSet mutation:", createError);
            console.error("Proposed Reason:", proposed.reason_he);
            console.error("Ops count:", opsPayload.length);
            // Re-throw or handle? If we re-throw, the message won't be saved?
            // Existing logic swallows it. Let's keep swallowing but log better.
          }
        }

        const { proposedChangeSet, ...rest } = changeSetBlock;
        blocksList[changeSetBlockIndex] = { ...rest };
      } catch (e) {
        console.error("Failed to process ChangeSet block:", e);
      }
    }

    if (blocksList.length > 0) {
      block = blocksList;
    }

    // Sanitize block for Convex storage (no Hebrew keys)
    if (block) {
      block = sanitizeBlockForConvex(ensureNextStepsBlock(block, stage));
    }

    // Finalize the message
    await ctx.runMutation(internal.agent.finalizeMessage, {
      messageId: agentMessageId,
      text_he: parsed.assistantText_he,
      block,
      changeSetId,
    });

    return { messageId: agentMessageId, changeSetId };
  },
});

function sanitizeBlockForConvex(block: any): any {
  if (Array.isArray(block)) return block.map(sanitizeBlockForConvex).filter(Boolean);
  if (!block || typeof block !== "object") return block;

  // Specific handling for ChangeSetBlock.changes which often has Hebrew keys
  if (block.type === "ChangeSetBlock" && block.changes && !Array.isArray(block.changes)) {
    const newChanges = Object.entries(block.changes).map(([key, value]) => ({
      label: key,
      value,
    }));
    return sanitizeForConvex({ ...block, changes: newChanges });
  }

  return sanitizeForConvex(block);
}

function ensureNextStepsBlock(
  block: any,
  stage: "IDEATION" | "QUOTE" | "BREAKDOWN"
) {
  const blocks = Array.isArray(block) ? block : [block];
  const hasSuggestion = blocks.some((item) => item?.type === "SuggestionBlock");
  const hasPrimary =
    blocks.some((item) => item?.type === "ChangeSetBlock") ||
    blocks.some((item) => item?.type === "QuestionsBlock") ||
    blocks.some((item) => item?.type === "ClarificationBlock");

  if (!hasSuggestion && hasPrimary) {
    blocks.push(buildNextStepSuggestionBlock(stage));
  }

  if (blocks.length === 0) {
    return [buildNextStepSuggestionBlock(stage)];
  }

  return blocks;
}

function buildNextStepSuggestionBlock(
  stage: "IDEATION" | "QUOTE" | "BREAKDOWN"
) {
  const suggestionsByStage: Record<string, Array<{ id: string; label_he: string; why_he: string }>> = {
    IDEATION: [
      {
        id: "suggest_elements",
        label_he: "להציע 3-5 אלמנטים/קונספטים אפשריים",
        why_he: "ממפה כיוונים ריאליים ומהיר לבחירה.",
      },
      {
        id: "ask_clarifications",
        label_he: "לנסח שאלות חידוד קצרות",
        why_he: "סוגר חסרים לפני ירידה לפרטים.",
      },
      {
        id: "rough_budget",
        label_he: "להעריך טווח תקציב ולוחות זמנים",
        why_he: "נותן מסגרת החלטה מוקדמת.",
      },
    ],
    QUOTE: [
      {
        id: "create_bom",
        label_he: "ליצור BOM בסיסי לחומרים",
        why_he: "מסדר חומרים ועלויות למבנה הצעת מחיר.",
      },
      {
        id: "generate_quote",
        label_he: "לחשב הצעת מחיר גרסה חדשה",
        why_he: "יוצר גרסת Quote עם סיכומי עלות.",
      },
      {
        id: "ask_clarifications",
        label_he: "לשאול שאלות להשלמת פרטים",
        why_he: "מוודא שכל הנתונים קיימים לפני התמחור.",
      },
    ],
    BREAKDOWN: [
      {
        id: "build_tasks",
        label_he: "לפרק למשימות עם צ׳קליסטים ותזמונים",
        why_he: "מאפשר ביצוע בפועל וסטטוס.",
      },
      {
        id: "logistics_bundle",
        label_he: "להוסיף הובלה/התקנה/פירוק אם רלוונטי",
        why_he: "סוגר את מחזור החיים המלא.",
      },
      {
        id: "ask_clarifications",
        label_he: "לשאול שאלות להשלמת פרטים",
        why_he: "מוודא שהביצוע ברור וללא חורים.",
      },
    ],
  };

  const items = suggestionsByStage[stage] ?? suggestionsByStage.IDEATION;

  return {
    type: "SuggestionBlock",
    title_he: "הצעדים הבאים שאוכל לבצע",
    submitLabel_he: "בוא נתקדם",
    selectionMode: "single",
    items: items.map((item) => ({
      id: item.id,
      label_he: item.label_he,
      why_he: item.why_he,
      payload: { action: item.id },
    })),
  };
}

function sanitizeForConvex(value: any): any {
  if (Array.isArray(value)) return value.map(sanitizeForConvex);
  if (!value || typeof value !== "object") return value;

  const result: Record<string, any> = {};
  const invalidFields: Array<{ key: string; value: any }> = [];

  for (const [key, val] of Object.entries(value)) {
    if (isValidConvexFieldName(key)) {
      result[key] = sanitizeForConvex(val);
    } else {
      invalidFields.push({ key, value: sanitizeForConvex(val) });
    }
  }

  if (invalidFields.length > 0) {
    result._invalidFields = invalidFields;
  }

  return result;
}

function isValidConvexFieldName(name: string) {
  return /^[\x20-\x7E]+$/.test(name);
}

function findInvalidFieldNames(value: any, path: string[] = []): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => findInvalidFieldNames(item, [...path, String(index)]));
  }
  if (!value || typeof value !== "object") return [];

  const invalid: string[] = [];
  for (const [key, val] of Object.entries(value)) {
    if (!isValidConvexFieldName(key)) {
      invalid.push([...path, key].join("."));
    }
    invalid.push(...findInvalidFieldNames(val, [...path, key]));
  }
  return invalid;
}

function getSelectedActionFromEvents(messages: Array<{ role?: string; eventType?: string; eventPayload?: any }>) {
  const lastEvent = messages.length > 0 ? messages[messages.length - 1] : null;
  if (!lastEvent || lastEvent.role !== "event" || lastEvent.eventType !== "suggestions_selected") {
    return null;
  }
  if (!lastEvent?.eventPayload) return null;
  const payload = lastEvent.eventPayload;
  if (payload.action) return String(payload.action);
  if (Array.isArray(payload.selectedIds) && payload.selectedIds.length > 0) {
    return String(payload.selectedIds[0]);
  }
  if (Array.isArray(payload.selectedItems) && payload.selectedItems.length > 0) {
    return String(payload.selectedItems[0]?.payload?.action ?? payload.selectedItems[0]?.id);
  }
  return null;
}

async function handleSuggestionAction({
  ctx,
  agentMessageId,
  projectId,
  stage,
  actionId,
}: {
  ctx: any;
  agentMessageId: Id<"conversationMessages">;
  projectId: Id<"projects">;
  stage: "IDEATION" | "QUOTE" | "BREAKDOWN";
  actionId: string;
}) {
  if (actionId === "estimate_tasks") {
    const result = await ctx.runMutation(api.agent_tasks.runEstimator, { projectId });
    const count = Number(result?.count ?? 0);
    const text_he =
      count > 0
        ? `עודכנתי הערכות זמן ל-${count} משימות שחסרו הערכה.`
        : "כל המשימות כבר כוללות הערכת זמן.";
    const block = ensureNextStepsBlock(buildNextStepSuggestionBlock(stage), stage);
    await ctx.runMutation(internal.agent.finalizeMessage, {
      messageId: agentMessageId,
      text_he,
      block,
    });
    return true;
  }

  if (actionId === "generate_quote" || actionId === "draft_quote") {
    const overview = await ctx.runQuery(api.projects.getOverview, { id: projectId });
    const description = overview?.project?.description ?? "";
    const quoteId = await ctx.runMutation(api.quotes.createDraftFromUi, {
      projectId,
      inputs: {
        projectDescription: description || undefined,
        includeFlags: {
          includeElements: true,
          elementsMode: "byElement",
          includeTerms: true,
          includeDates: true,
          includeAgreements: true,
          includeOptions: false,
        },
      },
    });

    await ctx.runAction(api.quotes.generateQuoteV2, { projectId, quoteId });

    const text_he = `נוצרה גרסת הצעת מחיר חדשה (מזהה: ${quoteId}). אפשר לבדוק בלשונית Quote.`;
    const block = ensureNextStepsBlock(buildNextStepSuggestionBlock(stage), stage);
    await ctx.runMutation(internal.agent.finalizeMessage, {
      messageId: agentMessageId,
      text_he,
      block,
    });
    return true;
  }

  return false;
}

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

// ---------------------------------------------------------
// Internal Mutations for Streaming
// ---------------------------------------------------------

export const cancelRunningAgent = mutation({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, args) => {
    const lastMsg = await ctx.db
      .query("conversationMessages")
      .withIndex("by_conversation", (q) => q.eq("conversationId", args.conversationId))
      .order("desc")
      .first();

    if (lastMsg && lastMsg.role === "assistant") {
      await ctx.db.patch(lastMsg._id, {
        metadata: { ...(lastMsg.metadata ?? {}), cancelled: true },
      });
    }
  },
});

export const createPlaceholderMessage = internalMutation({
  args: {
    conversationId: v.id("conversations"),
    projectId: v.id("projects"),
  },
  handler: async (ctx, args) => {
    const messageId = await ctx.db.insert("conversationMessages", {
      conversationId: args.conversationId,
      projectId: args.projectId,
      role: "assistant",
      text_he: "", // Empty initially
      createdAt: Date.now(),
    });
    return messageId;
  },
});

export const updateMessageContent = internalMutation({
  args: {
    messageId: v.id("conversationMessages"),
    text_he: v.string(),
  },
  handler: async (ctx, args) => {
    const msg = await ctx.db.get(args.messageId);
    if (msg?.metadata?.cancelled) {
      return { cancelled: true };
    }
    await ctx.db.patch(args.messageId, {
      text_he: args.text_he,
    });
    return { cancelled: false };
  },
});

export const finalizeMessage = internalMutation({
  args: {
    messageId: v.id("conversationMessages"),
    text_he: v.string(),
    block: v.optional(v.any()),
    changeSetId: v.optional(v.id("changeSets")),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.messageId, {
      text_he: args.text_he,
      block: args.block,
      changeSetId: args.changeSetId,
    });
  },
});

export const preProcessMessage = internalMutation({
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

    // 2. Load Context
    const conversation = await ctx.db.get(args.conversationId);
    if (!conversation) throw new Error("Conversation not found");
    const projectId = conversation.projectId;
    const stage = conversation.stage;

    const fileContextDocs = projectId
      ? await ctx.db
        .query("projectFiles")
        .withIndex("by_project", (q) => q.eq("projectId", projectId))
        .order("desc")
        .take(5)
      : [];

    const fileContext = fileContextDocs.map((file) => ({
      fileName: file.fileName,
      summary: file.summary ?? "",
    }));

    // 3. Check for Structured / Logic Handling
    let responseContent: string | null = null;
    let responseType: "text" | "questions" | "changeSet" = "text";
    let skillUsed = "general_chat";
    let metadata: any = undefined;

    const inputLower = args.content.toLowerCase();
    const structuredFields =
      args.channel === "structured" ? parseStructuredFields(args.content) : {};

    const stageSkillMap: Record<string, { free: string; structured: string }> = {
      ideation: { free: "ideation_chat", structured: "ideation_questions" },
      planning: { free: "planning_chat", structured: "planning_questions" },
      solutioning: { free: "solutioning_chat", structured: "solutioning_questions" },
    };

    const patchOpsCandidate = extractPatchOps(args.content);

    // Rule 1: ChangeSet/PatchOps
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
          fileContext,
        };
      } else {
        responseContent = "No open draft found to apply this ChangeSet.";
        responseType = "text";
        skillUsed = "change_set_builder";
      }
    }
    // Rule 2: Structured Intake
    else if (args.channel === "structured") {
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
          fileContext,
        };
      }
    }
    // Rule 3: Fast Logical Replies (No LLM needed)
    else if (!process.env.OPENAI_API_KEY) {
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
      // If no process.env.OPENAI_API_KEY and no local rule matches, we fall through to "handled: false"
      // But wait, the original code had fallback logic in "else if (!metadata)".
      // Here, if !OPENAI_KEY, we might want to just handle it here.
      else {
        responseContent = "I'm here to help. (OpenAI Key missing, running on local logic)";
      }
    }



    // If we have a response content, we handled it.
    if (responseContent !== null) {
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
        handled: true,
        userMessageId,
        agentMessageId,
        projectId,
        stage,
      };
    }

    // Not handled, return context for LLM
    return {
      handled: false,
      userMessageId,
      projectId,
      stage,
      fileContext,
    };
  },
});

export const saveAgentMessage = internalMutation({
  args: {
    conversationId: v.id("conversations"),
    content: v.string(),
    channel: v.union(v.literal("free"), v.literal("structured")),
    skillUsed: v.string(),
    model: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const agentMessageId = await ctx.db.insert("messages", {
      conversationId: args.conversationId,
      role: "agent",
      content: args.content,
      type: "text",
      channel: args.channel,
      skillUsed: args.skillUsed,
      createdAt: Date.now(),
    });
    await ctx.db.patch(args.conversationId, { updatedAt: Date.now() });
    return agentMessageId;
  },
});

export const sendMessage = action({
  args: {
    conversationId: v.id("conversations"),
    content: v.string(),
    channel: v.union(v.literal("free"), v.literal("structured")),
    model: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // 1. Pre-process (save user msg, check logic)
    const result = await ctx.runMutation(internal.agent.preProcessMessage, args);

    if (result.handled) {
      return {
        userMessageId: result.userMessageId,
        agentMessageId: result.agentMessageId!,
        projectId: result.projectId,
        stage: result.stage,
      };
    }

    // 2. LLM Call
    let responseContent = "I couldn't generate a response.";
    let skillUsed = `llm_${args.model?.replace(/[^a-zA-Z0-9]/g, "_") ?? "default"}`;

    try {
      if (process.env.OPENAI_API_KEY) {
        const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

        let targetModel = "gpt-4o";
        if (args.model === "gpt-5-mini" || args.model === "gpt-5-nano") {
          targetModel = "gpt-4o-mini";
        } else if (args.model === "gpt-5.2-thinking" || args.model === "gpt-5.2") {
          targetModel = "gpt-4o";
        }

        const systemInstructions = `You are AgenticEshet, a studio assistant for project management.
Current Stage: ${result.stage}
Context:
${result.fileContext?.map((f) => `- ${f.fileName}: ${f.summary ?? "no summary"}`).join("\n")}

You help with ideation, planning, and task management. Be concise and helpful.
If you suggest new elements, list them as bullet items with clear titles and optional types.`;

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
        }
      } else {
        responseContent = "OpenAI API Key is missing. Cannot generate response.";
        skillUsed = "system_error";
      }
    } catch (err: any) {
      console.error("OpenAI Error:", err);
      responseContent = `I encountered an issue connecting to the AI brain: ${err.message}`;
      skillUsed = "system_error";
    }

    // 3. Save Agent Response
    const agentMessageId = await ctx.runMutation(internal.agent.saveAgentMessage, {
      conversationId: args.conversationId,
      content: responseContent,
      channel: args.channel,
      skillUsed,
      model: args.model,
    });



    return {
      userMessageId: result.userMessageId,
      agentMessageId,
      projectId: result.projectId,
      stage: result.stage,
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

    const draftDoc = await ctx.db.get(draft.draftId) as any;
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


