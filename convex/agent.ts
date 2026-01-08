import { mutation, query, internalMutation, action } from "./_generated/server";
import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import OpenAI from "openai";

const AGENT_PROMPT_VERSION = "agentPromptsSchemaAlignedV1";

const SYSTEM_PROMPT = `You are Emlly Studio Producer - a practical set-design + fabrication + install assistant in Israel.
You behave as a flowing assistant in a single continuous chat:
- listen,
- ask only minimum blockers,
- suggest realistic options,
- propose ChangeSets the user can Apply/Discard,
- keep everything mapped to Elements + Tasks + Accounting + Quote + Production.

Hard rules:
1) Incremental: do NOT output a full master plan unless explicitly asked. Choose ONE next-best action.
2) Never write canonical data directly. Only propose ChangeSets.
3) Use Hebrew for all user-facing text. JSON keys must be English.
4) Never invent exact measurements/prices/vendors. State assumptions and ask minimal questions.
5) Safety: if load-bearing/climbable/child-facing/overhead - flag risk and require a check.`;

const DEVELOPER_PROMPT = `Return ONE JSON object:
{
  "assistantText_he": string,
  "block": null | ClarificationBlock | SuggestionBlock | ChangeSetBlock
}

Only ONE block per turn. Choose exactly one next-best action: ANSWER / ASK / SUGGEST / PROPOSE_CHANGESET.

ClarificationBlock:
{
  "type": "ClarificationBlock",
  "title_he": string,
  "questions": [
    {
      "id": string,
      "text_he": string,
      "inputType": "single"|"multi"|"number"|"date"|"text"|"toggle",
      "options_he"?: string[],
      "placeholder_he"?: string,
      "required": boolean
    }
  ],
  "submitLabel_he": string
}

SuggestionBlock:
{
  "type": "SuggestionBlock",
  "title_he": string,
  "subtitle_he"?: string,
  "selectionMode": "single"|"multi",
  "items": [
    {
      "id": string,
      "label_he": string,
      "why_he": string,
      "details_he": string,
      "tags_he": string[],
      "impact": "time"|"cost"|"quality"|"risk",
      "confidence": "high"|"medium"|"low",
      "payload": object
    }
  ],
  "freeTextPrompt_he": string,
  "submitLabel_he": string
}

ChangeSetBlock:
{
  "type": "ChangeSetBlock",
  "title_he": string,
  "summary_he": string,
  "changes": {
    "elementsCreate": number,
    "elementsPatch": number,
    "elementDraftsPatch": number,
    "tasksCreate": number,
    "accountingLinesCreate": number,
    "printPartsCreate": number,
    "purchasesCreate": number,
    "receiptsAttach": number,
    "vendorsCreate": number
  },
  "diffPreview_he": {
    "elements": string[],
    "drafts": string[],
    "tasks": string[],
    "accounting": string[],
    "printing": string[],
    "purchases": string[]
  },
  "proposedChangeSet": {
    "reason_he": string,
    "base": { "elements": [{ "elementId": string, "rev": number }] },
    "ops": [{ "kind": string, "payload": object }]
  },
  "actions": [
    { "id": "apply", "label_he": string },
    { "id": "discard", "label_he": string }
  ]
}

Allowed ChangeSet ops kinds:
- element.create
- element.patch
- task.create
- accountingLine.create
- printPart.create
- vendor.create
- purchase.create
- receipt.attach`;

const STAGE_MODULES: Record<string, string> = {
  IDEATION: `Stage = IDEATION. Objective: turn brief into 5-10 feasible element ideas, rough budget + lead time range, key risks. Avoid over-questioning.`,
  QUOTE: `Stage = QUOTE. Objective: convert chosen elements into a quote with tight assumptions/exclusions/options.`,
  BREAKDOWN: `Stage = BREAKDOWN. Objective: atomic tasks + dependencies + risks + shopping/print plan.`,
};

const MODE_NUDGES: Record<string, string> = {
  CHAT: "Mode = CHAT. Default to plain text unless a block is clearly better.",
  QUESTIONS: "Mode = QUESTIONS. Prefer a ClarificationBlock if blocked.",
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
  try {
    const cleaned = raw.replace(/^```json\s*/, "").replace(/^```\s*/, "").replace(/\s*```$/, "");
    const parsed = JSON.parse(cleaned);
    if (!parsed || typeof parsed !== "object") return null;
    if (typeof parsed.assistantText_he !== "string") return null;
    const block = parsed.block ?? null;
    if (block !== null && typeof block !== "object") return null;
    return { assistantText_he: parsed.assistantText_he, block };
  } catch {
    return null;
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
    await ctx.db.patch(args.id, { stage: args.stage, updatedAt: Date.now() });
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

export const agentRespond = action({
  args: {
    conversationId: v.id("conversations"),
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

    let responseText = "There was an error generating a response.";

    if (process.env.OPENAI_API_KEY) {
      const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const completion = await client.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "system", content: DEVELOPER_PROMPT },
          { role: "system", content: STAGE_MODULES[stage] ?? "" },
          { role: "system", content: MODE_NUDGES[mode] ?? "" },
          { role: "user", content: `Context JSON:\\n${JSON.stringify(contextPayload)}` },
        ],
        temperature: 0.2,
      });

      responseText = completion.choices[0]?.message?.content ?? responseText;
    } else {
      responseText = "{\"assistantText_he\":\"OpenAI API key missing.\",\"block\":null}";
    }

    const parsed = safeParseAgentResponse(responseText);
    if (!parsed) {
      await ctx.runMutation(api.agent.appendEventMessage, {
        conversationId: args.conversationId,
        eventType: "agent_response_invalid",
        eventPayload: { raw: responseText },
      });
      const fallbackId = await ctx.runMutation(api.agent.appendAssistantMessage, {
        conversationId: args.conversationId,
        text_he: responseText,
      });
      return { messageId: fallbackId };
    }

    let block = parsed.block;
    let changeSetId: any = undefined;
    if (block?.type === "ChangeSetBlock" && block.proposedChangeSet) {
      const proposed = block.proposedChangeSet;
      changeSetId = await ctx.runMutation(api.changeSets.createChangeSet, {
        projectId: conversation.projectId,
        stage,
        ops: proposed.ops ?? [],
        reason_he: proposed.reason_he,
        base: proposed.base,
      });
      const { proposedChangeSet, ...rest } = block;
      block = { ...rest };
    }

    const messageId = await ctx.runMutation(api.agent.appendAssistantMessage, {
      conversationId: args.conversationId,
      text_he: parsed.assistantText_he,
      block,
      changeSetId,
    });

    return { messageId, changeSetId };
  },
});

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
// Internal Mutations for Message Processing
// ---------------------------------------------------------

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


