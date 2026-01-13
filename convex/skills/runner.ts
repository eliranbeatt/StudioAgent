import { searchWeb } from "../lib/webSearch";
import { SHARED_HEADER } from "./prompts";
import { mutation, internalMutation, query, internalQuery, action } from "../_generated/server";
import { v } from "convex/values";
import OpenAI from "openai";
import { api, internal } from "../_generated/api";

const OPENAI_MODEL = "gpt-4o";

// --- Public API (Action) ---

export const runSkill = action({
  args: {
    projectId: v.id("projects"),
    conversationId: v.id("agentConversations"),
    skillId: v.string(),
    params: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const { projectId, conversationId, skillId, params } = args;

    // 1. Load Skill & Gate Check
    const skillData = await ctx.runQuery(internal.skills.runner.getSkillAndGateStatus, {
      projectId, conversationId, skillId
    });

    if (!skillData.skill) throw new Error(`Skill ${skillId} not found`);

    if (skillData.isGateBlocked) {
      // Run Gate Logic
      return await runGateLogic(ctx, { projectId, conversationId, targetSkillId: skillId, targetSkillLabel: skillData.skill.labelHe });
    }

    // 2. Create Run (Mutation)
    const runId = await ctx.runMutation(internal.skills.runner.createRun, {
      projectId,
      conversationId,
      skillId,
      params,
    });

    // 3. Build Context (Query)
    const context = await ctx.runQuery(internal.skills.runner.buildContext, { projectId, params, skillId });
    const clarification = await ctx.runQuery(internal.skills.runner.getLatestClarifications, {
      projectId,
      targetSkillId: skillId,
    });

    // 4. LLM Call
    try {
      const systemPrompt = buildSystemPrompt(skillData.skill, {
        ...context,
        clarifications: clarification,
      });
      const blocks = await callLLM(ctx, systemPrompt, {
        webSearch: !!(skillData.skill.config.allowedTools?.webSearch && params?.toggles?.useWebSearch),
        ragSearch: !!skillData.skill.config.allowedTools?.ragSearch,
        fileInspect: !!skillData.skill.config.allowedTools?.fileInspect,
        runSkill: !!skillData.skill.config.allowedTools?.runSkill,
      }, skillData.skill.model, { projectId, conversationId });

      // 5. Save Result (Mutation)
      await ctx.runMutation(internal.skills.runner.saveRunResult, {
        runId,
        conversationId,
        blocks,
        projectId, // needed for ChangeSet creation inside
      });

      return blocks;

    } catch (error: any) {
      console.error("Skill execution failed:", error);
      await ctx.runMutation(internal.skills.runner.failRun, {
        runId,
        error: error.message,
      });
      throw error;
    }
  },
});

export const sendMessageAndRun = action({
  args: {
    projectId: v.id("projects"),
    conversationId: v.id("agentConversations"),
    text: v.string(),
  },
  handler: async (ctx, args) => {
    // 1. Save User Message
    await ctx.runMutation(api.skills.runner.sendUserMessage, {
      conversationId: args.conversationId,
      text: args.text,
    });

    // 2. Trigger Consultant Chat
    // We don't await the result blocks here necessarily, unless we want to optimistic update?
    // But the runSkill updates the DB with blocks.
    await ctx.runAction(api.skills.runner.runSkill, {
      projectId: args.projectId,
      conversationId: args.conversationId,
      skillId: "CONSULTANT_CHAT",
      params: { source: "user_chat" },
    });
  }
});

// --- Mutations & Queries (Internal) ---

export const listAgentConversations = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("agentConversations")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .order("desc")
      .collect();
  }
});

export const createAgentConversation = mutation({
  args: { projectId: v.id("projects"), title: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db.insert("agentConversations", {
      projectId: args.projectId,
      title: args.title,
      mode: "chat",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  }
});

export const listAgentMessages = query({
  args: { conversationId: v.id("agentConversations") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("agentMessages")
      .withIndex("by_conversation", (q) => q.eq("conversationId", args.conversationId))
      .order("asc")
      .collect();
  }
});

export const getSkillAndGateStatus = internalQuery({
  args: { projectId: v.id("projects"), conversationId: v.id("agentConversations"), skillId: v.string() },
  handler: async (ctx, args) => {
    const skill = await ctx.db.query("skills").withIndex("by_skillId", q => q.eq("skillId", args.skillId)).first();
    if (!skill) return { skill: null, isGateBlocked: false };

    let isGateBlocked = false;
    if (skill.config.requiresClarifications) {
      const session = await ctx.db
        .query("clarificationSessions")
        .withIndex("by_project_target", (q) =>
          q.eq("projectId", args.projectId).eq("targetSkillId", args.skillId)
        )
        .order("desc")
        .first(); // In real app, check conversationId too or assume project-wide satisfaction?
      // Plan said: "if no satisfied session -> run gate". 
      // Let's assume project-wide satisfaction for now to avoid repeating questions.

      if (!session || !session.isSatisfied) {
        isGateBlocked = true;
      }
    }
    return { skill, isGateBlocked };
  }
});

export const createRun = internalMutation({
  args: { projectId: v.id("projects"), conversationId: v.id("agentConversations"), skillId: v.string(), params: v.any() },
  handler: async (ctx, args) => {
    return await ctx.db.insert("skillRuns", {
      projectId: args.projectId,
      conversationId: args.conversationId,
      skillId: args.skillId,
      status: "running",
      inputParams: args.params,
      createdAt: Date.now(),
    });
  }
});

export const buildContext = internalQuery({
  args: { projectId: v.id("projects"), params: v.any(), skillId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    const elements = await ctx.db
      .query("elements")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .take(120);
    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .take(200);
    const materialLines = await ctx.db
      .query("materialLines")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .take(200);
    const workLines = await ctx.db
      .query("workLines")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .take(200);
    const quoteVersions = await ctx.db
      .query("quoteVersions")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .order("desc")
      .take(1);
    const latestQuote = quoteVersions[0];

    const scopeElementIds = args.params?.scope?.elementIds;
    const scopedElements = Array.isArray(scopeElementIds)
      ? elements.filter((e: any) => scopeElementIds.includes(e._id))
      : elements;

    return {
      projectContext: {
        summaryHe: project?.overviewSummary ?? project?.description ?? "",
        clientHe: project?.clientName ?? undefined,
        eventDate: project?.details?.eventDate ?? project?.eventDate ?? undefined,
        locationHe: project?.details?.location ?? undefined,
      },
      elements: {
        approved: scopedElements
          .filter((e: any) => e.status !== "drafting" && e.status !== "archived")
          .map((e: any) => ({ id: e._id, title: e.title, status: e.status, type: e.type })),
        draft: scopedElements
          .filter((e: any) => e.status === "drafting")
          .map((e: any) => ({ id: e._id, title: e.title, status: e.status, type: e.type })),
      },
      tasks: tasks.map((t: any) => ({
        id: t._id,
        title: t.title,
        status: t.status,
        stage: t.stage,
        workType: t.workType,
        workTypeLabelHe: t.workTypeLabelHe,
        estimatedMinutes: t.estimatedMinutes,
        elementId: t.elementId,
      })),
      accounting: {
        materialLines: materialLines.map((line: any) => ({
          id: line._id,
          title: line.title ?? line.itemName,
          itemName: line.itemName,
          spec: line.spec,
          quantity: line.quantity,
          unitCode: line.unitCode,
          unitLabelHe: line.unitLabelHe,
          plannedUnitCost: line.plannedUnitCost,
          plannedTotalCost: line.plannedTotalCost,
          vendorName: line.vendorName,
          taskId: line.taskId,
          elementId: line.elementId,
        })),
        workLines: workLines.map((line: any) => ({
          id: line._id,
          title: line.title ?? line.roleHe,
          roleHe: line.roleHe,
          plannedQuantity: line.plannedQuantity,
          plannedUnitCost: line.plannedUnitCost,
          plannedTotalCost: line.plannedTotalCost,
          taskId: line.taskId,
          elementId: line.elementId,
        })),
      },
      quote: latestQuote
        ? {
          status: latestQuote.status,
          version: latestQuote.version,
          createdAt: latestQuote.createdAt,
        }
        : { status: "none" },
      params: args.params,
    };
  }
});

export const getLatestClarifications = internalQuery({
  args: { projectId: v.id("projects"), targetSkillId: v.string() },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("clarificationSessions")
      .withIndex("by_project_target", (q) =>
        q.eq("projectId", args.projectId).eq("targetSkillId", args.targetSkillId)
      )
      .order("desc")
      .first();
    if (!session) return null;
    return {
      targetSkillId: session.targetSkillId,
      questions: session.questions,
      answers: session.answers ?? null,
      isSatisfied: session.isSatisfied,
    };
  },
});

export const saveRunResult = internalMutation({
  args: {
    runId: v.id("skillRuns"),
    conversationId: v.id("agentConversations"),
    blocks: v.any(),
    projectId: v.id("projects")
  },
  handler: async (ctx, args) => {
    const blocks = args.blocks;


    // Post-process ChangeSets
    for (const block of blocks) {
      if (block.type === "ChangeSetBlock" && block.changeSet) {
        const titleHe = block.titleHe ?? block.title_he;
        const summaryHe = block.summaryHe ?? block.summary_he;

        // Normalize ops to match schema { kind, payload }
        const rawOps = Array.isArray(block.changeSet.ops) ? block.changeSet.ops : [];
        const normalizedOps = rawOps.map((op: any) => {
          if (op.kind && op.payload) return op; // Already correct

          const kind = op.kind ?? op.op ?? "unknown";
          // Payload is everything else
          const payload = { ...op };
          delete payload.kind;
          delete payload.op;

          return { kind, payload };
        });

        const changeSetId = await ctx.db.insert("changeSets", {
          projectId: args.projectId,
          stage: "IDEATION",
          status: "PROPOSED",
          ops: normalizedOps,
          reason_he: titleHe,
          preview_he: summaryHe ? { summary: summaryHe } : undefined,
          sourceSkillRunId: args.runId,
          createdAt: Date.now(),
        });
        block.changeSetId = changeSetId;
      }
    }

    await ctx.db.patch(args.runId, {
      status: "succeeded",
      blocks: blocks,
    });

    await ctx.db.insert("agentMessages", {
      conversationId: args.conversationId,
      role: "assistant",
      blocks: blocks,
      runId: args.runId,
      createdAt: Date.now(),
    });
  }
});

export const failRun = internalMutation({
  args: { runId: v.id("skillRuns"), error: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.runId, {
      status: "failed",
      rawModelResponse: args.error,
    });
  }
});

export const createClarificationSession = internalMutation({
  args: { projectId: v.id("projects"), conversationId: v.id("agentConversations"), targetSkillId: v.string(), questions: v.any() },
  handler: async (ctx, args) => {
    await ctx.db.insert("clarificationSessions", {
      projectId: args.projectId,
      conversationId: args.conversationId,
      targetSkillId: args.targetSkillId,
      questions: args.questions,
      isSatisfied: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  }
});

export const sendUserMessage = mutation({
  args: { conversationId: v.id("agentConversations"), text: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.insert("agentMessages", {
      conversationId: args.conversationId,
      role: "user",
      text: args.text,
      createdAt: Date.now(),
    });
  },
});

export const submitClarifications = mutation({
  args: {
    conversationId: v.id("agentConversations"),
    answersById: v.any()
  },
  handler: async (ctx, args) => {
    // 1. Find the session (using filter fallback for robustness)
    const session = await ctx.db
      .query("clarificationSessions")
      .withIndex("by_conversation", (q) => q.eq("conversationId", args.conversationId))
      .order("desc")
      .first();

    if (!session) {
      // Fallback check with filter (in case index is lagging or misnamed)
      const fallback = await ctx.db
        .query("clarificationSessions")
        .filter(q => q.eq(q.field("conversationId"), args.conversationId))
        .order("desc")
        .first();

      if (!fallback) {
        console.error(`[submitClarifications] No session found for conv ${args.conversationId}`);
        throw new Error("No active clarification session found (DB empty for this conv)");
      }
      // Use fallback
      await ctx.db.patch(fallback._id, {
        answers: args.answersById,
        isSatisfied: true,
        updatedAt: Date.now(),
      });

      await ctx.db.insert("agentMessages", {
        conversationId: args.conversationId,
        role: "user",
        text: "Submitted answers for clarifications.",
        createdAt: Date.now(),
      });

      return { success: true, targetSkillId: fallback.targetSkillId };
    }

    // 2. Update session
    await ctx.db.patch(session._id, {
      answers: args.answersById,
      isSatisfied: true,
      updatedAt: Date.now(),
    });

    // 3. Add User Message to chat
    await ctx.db.insert("agentMessages", {
      conversationId: args.conversationId,
      role: "user",
      text: "Submitted answers for clarifications.",
      createdAt: Date.now(),
    });

    return {
      success: true,
      targetSkillId: session.targetSkillId
    };
  }
});
export const saveAgentMessage = internalMutation({
  args: { conversationId: v.id("agentConversations"), blocks: v.any() },
  handler: async (ctx, args) => {
    await ctx.db.insert("agentMessages", {
      conversationId: args.conversationId,
      role: "assistant",
      blocks: args.blocks,
      createdAt: Date.now(),
    });
  }
});

export const getGateSkill = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("skills")
      .withIndex("by_skillId", (q) => q.eq("skillId", "CLARIFICATIONS_GATE"))
      .first();
  }
});

// --- Helpers ---

async function runGateLogic(ctx: any, args: { projectId: any; conversationId: any; targetSkillId: string; targetSkillLabel: string }) {
  const gateSkill = await ctx.runQuery(internal.skills.runner.getGateSkill);
  if (!gateSkill) throw new Error("Clarifications Gate skill not found");

  const context = await ctx.runQuery(internal.skills.runner.buildContext, { projectId: args.projectId, params: {} });
  const gateContext = {
    targetSkillId: args.targetSkillId,
    projectContext: context.projectContext,
    currentState: {
      elements: context.elements,
      tasks: context.tasks,
      accounting: context.accounting,
      quote: context.quote,
    },
    toggles: {
      useOnlyApprovedElements: true,
    },
  };
  const prompt = `${gateSkill.prompts.promptAddon}\n\nTARGET SKILL: ${args.targetSkillLabel} (${args.targetSkillId}).\nAsk questions relevant to this target.`;

  const blocks = await callLLM(ctx, buildSystemPrompt({ ...gateSkill, prompts: { ...gateSkill.prompts, promptAddon: prompt } }, gateContext), {}, gateSkill.model, { projectId: args.projectId, conversationId: args.conversationId });

  // Store Session
  const questionsBlock = blocks.find((b: any) => b.type === "QuestionsBlock");
  if (questionsBlock && questionsBlock.questions) {
    await ctx.runMutation(internal.skills.runner.createClarificationSession, {
      projectId: args.projectId,
      conversationId: args.conversationId,
      targetSkillId: args.targetSkillId,
      questions: questionsBlock.questions
    });
  }

  // Save Message
  await ctx.runMutation(internal.skills.runner.saveAgentMessage, {
    conversationId: args.conversationId,
    blocks
  });

  return blocks;
}

function buildSystemPrompt(skill: any, context: any) {
  let toolInstructions = "";
  if (skill.config.allowedTools?.webSearch) {
    toolInstructions += `\nYou have access to a 'web_search' tool. Use it to find real-time info. When using it, output a tool call, not a block.`;
  }
  if (skill.config.allowedTools?.runSkill) {
    toolInstructions += `\nYou have access to a 'run_skill' tool. Use it to invoke other skills (builders, research, etc) when you are confident they are needed. Do not ask for permission if the user intent is clear.`;
  }

  const addon = skill.prompts?.promptAddon ?? "";

  return `${SHARED_HEADER}${toolInstructions}\n\n${addon}\n\nCONTEXT:\n${JSON.stringify(context, null, 2)}`;
}

async function callLLM(ctx: any, systemPrompt: string, allowedTools: any, model?: string, contextInfo?: { projectId: any, conversationId: any }) {
  if (!process.env.OPENAI_API_KEY) {
    console.warn("No OPENAI_API_KEY, using mock response");
    // Simulate delay
    await new Promise(r => setTimeout(r, 1000));
    return [
      {
        type: "ChatBlock",
        markdownHe: "אין מפתח OpenAI, אני במצב בדיקה. (Server Action)",
      },
      {
        type: "SuggestionsBlock",
        titleHe: "פעולות בדיקה",
        suggestions: [{ id: "test", labelHe: "בדיקה", whyHe: "כי אין מפתח" }]
      }
    ];
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const tools: any[] = [];

  if (allowedTools?.webSearch) {
    tools.push({
      type: "function",
      function: {
        name: "web_search",
        description: "Search the web for real-time information.",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "Search query" }
          },
          required: ["query"]
        }
      }
    });
  }

  if (allowedTools?.runSkill) {
    tools.push({
      type: "function",
      function: {
        name: "run_skill",
        description: "Invoke another skill (e.g. TASKS_BUILDER_FULL).",
        parameters: {
          type: "object",
          properties: {
            skillId: { type: "string", description: "The ID of the skill to run." },
            reason: { type: "string", description: "Why you are running this skill." }
          },
          required: ["skillId"]
        }
      }
    });
  }

  const messages: any[] = [{ role: "system", content: systemPrompt }];

  let loopCount = 0;
  while (loopCount < 5) {
    loopCount++;
    const response = await client.chat.completions.create({
      model: model ?? OPENAI_MODEL,
      messages: messages,
      tools: tools.length > 0 ? tools : undefined,
      // response_format: { type: "json_object" }, // Relaxed to allow tool calls
    });

    const message = response.choices[0].message;
    messages.push(message);

    if (message.tool_calls && message.tool_calls.length > 0) {
      for (const toolCall of message.tool_calls) {
        const tc = toolCall as any;
        if (tc.function.name === "web_search") {
          const args = JSON.parse(tc.function.arguments);
          const result = await searchWeb(args.query);
          messages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: JSON.stringify(result)
          });
        }
        if (tc.function.name === "run_skill") {
          const args = JSON.parse(tc.function.arguments);
          if (contextInfo) {
            // Call the skill action
            // Note: We don't await the full chain if we want to just trigger it, 
            // but here we want the result to feed back to the orchestrator?
            // The orchestrator just needs to know it ran.
            // Actually, runSkill returns `blocks`. We can feed that back.
            try {
              const resultBlocks = await ctx.runAction(api.skills.runner.runSkill, {
                projectId: contextInfo.projectId,
                conversationId: contextInfo.conversationId,
                skillId: args.skillId,
                params: { source: "orchestrator" }
              });
              messages.push({
                role: "tool",
                tool_call_id: toolCall.id,
                content: JSON.stringify({ status: "success", resultSummary: "Skill executed successfully. Results added to chat." }) // Simplified for token limits
              });
            } catch (e: any) {
              messages.push({
                role: "tool",
                tool_call_id: toolCall.id,
                content: JSON.stringify({ status: "error", error: e.message })
              });
            }
          } else {
            messages.push({
              role: "tool",
              tool_call_id: toolCall.id,
              content: JSON.stringify({ status: "error", error: "Context missing" })
            });
          }
        }
      }
      continue; // Loop again to let LLM process tool results
    }

    // Final response
    const content = message.content;
    if (!content) throw new Error("Empty response from LLM");

    const parsed = tryParseJson(content);
    if (!parsed) {
      console.warn("JSON parse failed, returning text block", content);
      return [{ type: "ChatBlock", markdownHe: content }];
    }

    let blocks = parsed.blocks || parsed;
    if (!Array.isArray(blocks)) blocks = [blocks];

    return normalizeBlocks(blocks);
  }

  throw new Error("Max turns reached");
}

function normalizeBlocks(rawBlocks: any[]): any[] {
  return rawBlocks.map(block => {
    // 1. Handle blocks wrapped in a key named after the type (e.g. { "QuestionsBlock": [...] })
    if (!block.type) {
      if (block.QuestionsBlock && Array.isArray(block.QuestionsBlock)) {
        return {
          type: "QuestionsBlock",
          questions: block.QuestionsBlock.map((q: any, i: number) => {
            if (typeof q === "string") return { id: `q${i}`, textHe: q };
            return q;
          })
        };
      }
      if (block.ChatBlock) return { type: "ChatBlock", markdownHe: block.ChatBlock };
      if (block.SuggestionBlock) return { type: "SuggestionsBlock", ...block.SuggestionBlock };
      if (block.SuggestionsBlock) return { type: "SuggestionsBlock", ...block.SuggestionsBlock };
      if (block.ChangeSetBlock) return { type: "ChangeSetBlock", ...block.ChangeSetBlock };
      if (block.ReviewBlock) return { type: "ReviewBlock", ...block.ReviewBlock };
      if (block.ShoppingPlanBlock) return { type: "ShoppingPlanBlock", ...block.ShoppingPlanBlock };
      if (block.PrintQaBlock) return { type: "PrintQaBlock", ...block.PrintQaBlock };
      if (block.ReceiptBlock) return { type: "ReceiptBlock", ...block.ReceiptBlock };
      if (block.RunbookBlock) return { type: "RunbookBlock", ...block.RunbookBlock };
      if (block.DailyPlanBlock) return { type: "DailyPlanBlock", ...block.DailyPlanBlock };
    }

    // 2. If it's a QuestionsBlock but questions are just strings, wrap them
    if (block.type === "QuestionsBlock" && Array.isArray(block.questions)) {
      block.questions = block.questions.map((q: any, i: number) => {
        if (typeof q === "string") return { id: `q${i}`, textHe: q };
        return q;
      });
    }

    return normalizeBlockFields(block);
  });
}

function normalizeBlockFields(block: any) {
  if (!block || typeof block !== "object") return block;
  const normalized = { ...block };
  const mapKey = (from: string, to: string) => {
    if (normalized[from] !== undefined && normalized[to] === undefined) {
      normalized[to] = normalized[from];
    }
  };
  mapKey("title_he", "titleHe");
  mapKey("summary_he", "summaryHe");
  mapKey("markdown_he", "markdownHe");
  mapKey("free_text_prompt_he", "freeTextPromptHe");
  mapKey("submitLabel_he", "submitLabelHe");
  if (Array.isArray(normalized.suggestions)) {
    normalized.suggestions = normalized.suggestions.map((item: any) => {
      if (typeof item === "string") return { labelHe: item, id: item };
      if (!item || typeof item !== "object") return item;
      const next = { ...item };
      if (next.labelHe === undefined && next.label_he !== undefined) next.labelHe = next.label_he;
      if (!next.labelHe) next.labelHe = next.label || next.text || next.title || next.description || next.name;
      if (next.whyHe === undefined && next.why_he !== undefined) next.whyHe = next.why_he;
      if (next.detailsHe === undefined && next.details_he !== undefined) next.detailsHe = next.details_he;
      return next;
    });
  }
  if (Array.isArray(normalized.items) && !normalized.suggestions) {
    normalized.suggestions = normalized.items.map((item: any) => {
      if (typeof item === "string") return { labelHe: item, id: item };
      if (!item || typeof item !== "object") return item;
      const next = { ...item };
      if (next.labelHe === undefined && next.label_he !== undefined) next.labelHe = next.label_he;
      if (!next.labelHe) next.labelHe = next.label || next.text || next.title || next.description || next.name;
      if (next.whyHe === undefined && next.why_he !== undefined) next.whyHe = next.why_he;
      if (next.detailsHe === undefined && next.details_he !== undefined) next.detailsHe = next.details_he;
      return next;
    });
  }
  if (Array.isArray(normalized.questions)) {
    normalized.questions = normalized.questions.map((q: any) => {
      if (!q || typeof q !== "object") return q;
      const next = { ...q };
      if (next.textHe === undefined && next.text_he !== undefined) next.textHe = next.text_he;
      if (next.optionsHe === undefined && next.options_he !== undefined) next.optionsHe = next.options_he;
      return next;
    });
  }
  return normalized;
}

function tryParseJson(text: string) {
  try {
    const jsonBlockMatch = text.match(/```json\s*([\s\S]*?)\s*```/i) || text.match(/```json\s*([\s\S]*)$/i);
    if (jsonBlockMatch && jsonBlockMatch[1]) {
      const parsed = JSON.parse(jsonBlockMatch[1]);
      if (parsed && typeof parsed === "object") return parsed;
    }

    const codeBlockMatch = text.match(/```\s*([\s\S]*?)\s*```/) || text.match(/```\s*([\s\S]*)$/);
    if (codeBlockMatch && codeBlockMatch[1]) {
      const parsed = JSON.parse(codeBlockMatch[1]);
      if (parsed && typeof parsed === "object") return parsed;
    }

    const cleaned = text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/, "");
    const parsed = JSON.parse(cleaned);
    if (parsed && typeof parsed === "object") return parsed;
  } catch (e) {
    return null;
  }
  return null;
}
