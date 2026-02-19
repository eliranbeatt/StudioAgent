"use node";
import { v } from "convex/values";
import { action } from "../_generated/server";
import { api, internal } from "../_generated/api";
import { OpenAIAgent } from "openai-agents";
import { searchWeb } from "../lib/webSearch";
import { completionWithTracing } from "../lib/llm";
import { SHARED_HEADER } from "./prompts";
import { DEFAULT_FLAGS, isEnabled, normalizeFlags } from "../featureFlags";
import { buildContextPackPrompt } from "../contextManager/promptBuilder";

const OPENAI_MODEL = "gpt-4o";
const SMALL_MODEL = "gpt-5-nano";
const SETTINGS_KEY = "featureFlags";

// --- Helpers ---

async function loadFlags(ctx: any): Promise<Record<string, boolean>> {
    if (ctx.db) {
        const existing = await ctx.db
            .query("appSettings")
            .withIndex("by_key", (q: any) => q.eq("key", SETTINGS_KEY))
            .first();

        const stored = normalizeFlags(existing?.value);
        return { ...DEFAULT_FLAGS, ...stored };
    } else {
        return await ctx.runQuery(api.featureFlags.getAll);
    }
}

function buildPromptCacheOptions(args: {
    flags: Record<string, boolean>
    model?: string
    skillId: string
    allowedTools?: { webSearch?: boolean; ragSearch?: boolean; fileInspect?: boolean; runSkill?: boolean; generateQuote?: boolean; estimateTasks?: boolean; agentData?: boolean }
    viewId?: string
}) {
    if (!isEnabled(args.flags, "ff_prompt_cache", false)) return {};

    const toolBundleId = [
        args.allowedTools?.webSearch ? "web" : null,
        args.allowedTools?.ragSearch ? "rag" : null,
        args.allowedTools?.fileInspect ? "files" : null,
        args.allowedTools?.runSkill ? "skill" : null,
        args.allowedTools?.generateQuote ? "quote" : null,
        args.allowedTools?.estimateTasks ? "estimate" : null,
        args.allowedTools?.agentData ? "data" : null,
    ]
        .filter(Boolean)
        .join("+") || "none";

    const viewId = args.viewId ?? "legacy";
    const cacheKey = `studioops::${args.skillId}::${viewId}::${toolBundleId}`;

    const model = String(args.model ?? "");
    const use24h = isEnabled(args.flags, "ff_prompt_cache_24h", false) && model.includes("gpt-5.2");

    return {
        promptCacheKey: cacheKey,
        promptCacheRetention: use24h ? "24h" : undefined,
    };
}

function getSkillPhaseDetail(skillId: string, skillLabel?: string) {
    const map: Record<string, string> = {
        ELEMENTS_BUILDER_FULL: "Building elements",
        TASKS_BUILDER_FULL: "Breaking down tasks",
        CONTEXT_GENERATION: "Building context and clarifications",
        CONSULTANT_CHAT: "Drafting response",
        RESEARCH_PRICING_ESTIMATES_WEB: "Collecting web pricing data",
    };
    return map[skillId] ?? `Running ${skillLabel ?? skillId}`;
}

function hashString(input: string): string {
    let hash = 0;
    for (let i = 0; i < input.length; i += 1) {
        hash = (hash << 5) - hash + input.charCodeAt(i);
        hash |= 0;
    }
    return Math.abs(hash).toString(36);
}

function bytesOf(value: any): number {
    try {
        return JSON.stringify(value ?? {}).length;
    } catch {
        return 0;
    }
}

async function logToolCallHelper(ctx: any, args: {
    contextInfo?: { projectId?: any; conversationId?: any; skillId?: string; runId?: string }
    toolName: string
    toolArgs: any
    status: "success" | "error"
    latencyMs: number
    result?: any
    error?: string
}) {
    if (!args.contextInfo?.projectId) return;
    const argsText = JSON.stringify(args.toolArgs ?? {});
    await ctx.runMutation(internal.skills.runner.logToolCall, {
        projectId: args.contextInfo.projectId,
        conversationId: args.contextInfo.conversationId,
        skillRunId: args.contextInfo.runId,
        skillId: args.contextInfo.skillId,
        toolName: args.toolName,
        argsHash: hashString(argsText),
        argsBytes: argsText.length,
        resultBytes: args.result ? bytesOf(args.result) : undefined,
        latencyMs: args.latencyMs,
        status: args.status,
        error: args.error,
    });
}

function normalizeQuestionKey(text?: string) {
    if (!text) return "";
    return String(text).trim().toLowerCase();
}

function filterUnansweredQuestions(
    questions: any[],
    context: { qaPairs?: Array<{ questionHe?: string; questionKey?: string; answerHe?: string }>; priorClarifications?: any }
) {
    const normalizedAnswered = new Set<string>();
    const qaPairs = Array.isArray(context.qaPairs) ? context.qaPairs : [];
    for (const qa of qaPairs) {
        const key = normalizeQuestionKey(qa?.questionKey || qa?.questionHe);
        if (key) normalizedAnswered.add(key);
    }

    const priorQuestions = context.priorClarifications?.questions ?? [];
    const priorAnswers = context.priorClarifications?.answers ?? {};
    const answeredIds = new Set<string>();
    for (let i = 0; i < priorQuestions.length; i++) {
        const q = priorQuestions[i] ?? {};
        const qid = q.id ?? `q${i}`;
        const answer = priorAnswers?.[qid];
        if (answer && String(answer).trim()) answeredIds.add(String(qid));

        const key = normalizeQuestionKey(
            q.topicKey ?? q.textHe ?? q.text_he ?? q.question_he ?? q.question ?? q.labelHe ?? q.label ?? q.text
        );
        if (key && answer && String(answer).trim()) normalizedAnswered.add(key);
    }

    return (questions ?? []).filter((question: any, index: number) => {
        if (!question) return false;
        const questionId = String(question.id ?? `q${index}`);
        if (answeredIds.has(questionId)) return false;

        const key = normalizeQuestionKey(
            question.topicKey ??
            question.textHe ??
            question.text_he ??
            question.question_he ??
            question.question ??
            question.labelHe ??
            question.label ??
            question.text
        );
        if (key && normalizedAnswered.has(key)) return false;
        return true;
    });
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
        try {
            const parsed = JSON.parse(cleaned);
            if (parsed && typeof parsed === "object") return parsed;
        } catch (e) {
            // Failed to parse cleaned text. Try to find the first '{' and last '}'
            const firstBrace = text.indexOf('{');
            const lastBrace = text.lastIndexOf('}');
            if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
                const jsonCandidate = text.substring(firstBrace, lastBrace + 1);
                try {
                    const parsed = JSON.parse(jsonCandidate);
                    if (parsed && typeof parsed === "object") return parsed;
                } catch (e2) {
                    // Still failed
                }
            }
        }
        return null;
    } catch (e) {
        return null;
    }
    return null;
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

function normalizeBlocks(rawBlocks: any[]): any[] {
    return rawBlocks.flatMap(block => {
        let processed = { ...block };

        // 1. Handle blocks wrapped in a key named after the type (e.g. { "QuestionsBlock": [...] })
        if (!processed.type) {
            if (processed.QuestionsBlock && Array.isArray(processed.QuestionsBlock)) {
                processed = {
                    type: "QuestionsBlock",
                    questions: processed.QuestionsBlock.map((q: any, i: number) => {
                        if (typeof q === "string") return { id: `q${i}`, textHe: q };
                        return q;
                    })
                };
            }
            else if (processed.ChatBlock) processed = { type: "ChatBlock", markdownHe: processed.ChatBlock };
            else if (processed.SuggestionBlock) processed = { type: "SuggestionsBlock", ...processed.SuggestionBlock };
            else if (processed.SuggestionsBlock) processed = { type: "SuggestionsBlock", ...processed.SuggestionsBlock };
            else if (processed.ChangeSetBlock) processed = { type: "ChangeSetBlock", ...processed.ChangeSetBlock };
            else if (processed.ReviewBlock) processed = { type: "ReviewBlock", ...processed.ReviewBlock };
            else if (processed.ShoppingPlanBlock) processed = { type: "ShoppingPlanBlock", ...processed.ShoppingPlanBlock };
            else if (processed.PrintQaBlock) processed = { type: "PrintQaBlock", ...processed.PrintQaBlock };
            else if (processed.ReceiptBlock) processed = { type: "ReceiptBlock", ...processed.ReceiptBlock };
            else if (processed.RunbookBlock) processed = { type: "RunbookBlock", ...processed.RunbookBlock };
            else if (processed.DailyPlanBlock) processed = { type: "DailyPlanBlock", ...processed.DailyPlanBlock };
        }

        // 2. If it's a QuestionsBlock but questions are just strings, wrap them
        if (processed.type === "QuestionsBlock" && Array.isArray(processed.questions)) {
            processed.questions = processed.questions.map((q: any, i: number) => {
                if (typeof q === "string") return { id: `q${i}`, textHe: q };
                return q;
            });
        }

        // 3. Normalize fields (snake_case -> camelCase)
        processed = normalizeBlockFields(processed);

        // 4. Split mixed content (Markdown + Other)
        // If a block has markdownHe/text but is NOT ChatBlock, split it.
        if (processed.type !== "ChatBlock") {
            const text = processed.markdownHe || (processed.text !== processed.titleHe ? processed.text : undefined);
            if (text && typeof text === "string" && text.length > 0) {
                const chatBlock = { type: "ChatBlock", markdownHe: text };
                const mainBlock = { ...processed };
                // Optional: delete mainBlock.markdownHe to clean up
                return [chatBlock, mainBlock];
            }
        }

        return [processed];
    });
}

function buildSystemPrompt(skill: any, context: any) {
    let toolInstructions = "";
    if (skill.config.allowedTools?.webSearch) {
        toolInstructions += `\nYou have access to a 'web_search' tool. Use it to find real-time info. When using it, output a tool call, not a block.`;
    }
    if (skill.config.allowedTools?.agentData) {
        toolInstructions += `\nYou have access to an 'agent.data' tool. Use it to pull project data (memoryDocs, qaPairs, elements, tasks, lines, files). Always pass projectId as args.projectId.`;
    }
    if (skill.config.allowedTools?.runSkill) {
        toolInstructions += `\nYou have access to a 'run_skill' tool. Use it to invoke other skills (builders, research, etc) when you are confident they are needed. Do not ask for permission if the user intent is clear.`;
    }
    if (skill.config.allowedTools?.generateQuote) {
        toolInstructions += `\nYou have access to a 'generate_quote' tool. Use it to generate a draft quote and compute totals when needed.`;
    }
    if (skill.config.allowedTools?.estimateTasks) {
        toolInstructions += `\nYou have access to an 'estimate_tasks' tool. Use it to auto-estimate task durations when needed.`;
    }

    const addon = skill.prompts?.promptAddon ?? "";
    const skillId = String(skill?.skillId ?? "");
    const isV3Skill = skillId.startsWith("V3_");

    if (context?.ctxPacks) {
        if (isV3Skill) {
            const envelope = context.ctxPacks;
            const manifest = JSON.stringify(envelope.manifest, null, 2);
            const packsText = envelope.packs
                .map((pack: any) => `## ${pack.id} — ${pack.title}\n${pack.content}`)
                .join("\n\n");
            const clarifications = context.clarifications
                ? `\n\nCLARIFICATIONS:\n${JSON.stringify(context.clarifications, null, 2)}`
                : "";
            const extra = context.extraContext ? `\n\nEXTRA_CONTEXT:\n${JSON.stringify(context.extraContext, null, 2)}` : "";
            return `${SHARED_HEADER}${toolInstructions}\n\nCONTEXT_MANIFEST:\n${manifest}\n\nCONTEXT_PACKS:\n${packsText}${clarifications}${extra}\n\n${addon}`;
        }

        return buildContextPackPrompt({
            header: SHARED_HEADER,
            toolInstructions,
            addon,
            envelope: context.ctxPacks,
            clarifications: context.clarifications,
            extraContext: context.extraContext,
        });
    }

    if (isV3Skill) {
        return `${SHARED_HEADER}${toolInstructions}\n\nCONTEXT:\n${JSON.stringify(context, null, 2)}\n\n${addon}`;
    }

    return `${SHARED_HEADER}${toolInstructions}\n\n${addon}\n\nCONTEXT:\n${JSON.stringify(context, null, 2)}`;
}

async function callHelloWorldAgent(
    systemPrompt: string,
    model?: string,
    llmParams?: any
) {
    if (!process.env.OPENAI_API_KEY) {
        throw new Error("Missing OPENAI_API_KEY");
    }

    const agent = new OpenAIAgent({
        model: model ?? OPENAI_MODEL,
        system_instruction: systemPrompt,
        temperature: llmParams?.temperature,
        max_tokens: llmParams?.max_tokens,
    });

    const result = await agent.createChatCompletion("Hello World test");
    const content = Array.isArray((result as any)?.choices) ? (result as any).choices[0] : "";
    if (!content) throw new Error("Empty response from agent");

    const parsed = tryParseJson(content);
    if (!parsed) return [{ type: "ChatBlock", markdownHe: content }];

    const blocks = (parsed as any).blocks || parsed;
    return Array.isArray(blocks) ? blocks : [{ type: "ChatBlock", markdownHe: content }];
}

async function callLLM(
    ctx: any,
    systemPrompt: string,
    allowedTools: any,
    model?: string,
    llmParams?: any,
    contextInfo?: { projectId: any, conversationId: any, skillId?: string, runId?: string },
    options?: { promptCacheKey?: string; promptCacheRetention?: string; traceMeta?: any }
) {
    if (!process.env.OPENAI_API_KEY) {
        throw new Error("Missing OPENAI_API_KEY");
    }

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
                        query: { type: "string", description: "Search query" },
                        templateId: { type: "string", description: "materialTemplates id for logging" },
                        variantId: { type: "string", description: "materialVariants id for logging" },
                        uomCode: { type: "string", description: "UOM code for pricing context" }
                    },
                    required: ["query"]
                }
            }
        });
    }

    if (allowedTools?.agentData) {
        tools.push({
            type: "function",
            function: {
                name: "agent.data",
                description: "Fetch project data (memoryDocs, qaPairs, elements, tasks, lines, files).",
                parameters: {
                    type: "object",
                    properties: {
                        resource: { type: "string" },
                        projectId: { type: "string" },
                        filters: { type: "object" },
                        fields: { type: "array", items: { type: "string" } },
                        limit: { type: "number" },
                        cursor: { type: ["string", "null"] },
                    },
                    required: ["resource"]
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

    if (allowedTools?.generateQuote) {
        tools.push({
            type: "function",
            function: {
                name: "generate_quote",
                description: "Create a draft quote and generate quote totals.",
                parameters: {
                    type: "object",
                    properties: {
                        inputs: {
                            type: "object",
                            properties: {
                                projectDescription: { type: "string" },
                                specs: { type: "string" },
                                manualPriceNis: { type: "number" },
                                includeFlags: {
                                    type: "object",
                                    properties: {
                                        includeElements: { type: "boolean" },
                                        elementsMode: { type: "string", enum: ["bySection", "byElement"] },
                                        includeTerms: { type: "boolean" },
                                        includeDates: { type: "boolean" },
                                        includeAgreements: { type: "boolean" },
                                        includeOptions: { type: "boolean" },
                                    }
                                },
                                validUntil: { type: "string" },
                                logoFileId: { type: "string" }
                            }
                        }
                    }
                }
            }
        });
    }

    if (allowedTools?.estimateTasks) {
        tools.push({
            type: "function",
            function: {
                name: "estimate_tasks",
                description: "Estimate missing task durations for the project.",
                parameters: {
                    type: "object",
                    properties: {}
                }
            }
        });
    }

    const messages: any[] = [{ role: "system", content: systemPrompt }];

    let loopCount = 0;
    while (loopCount < 8) {
        loopCount++;
        loopCount++;
        const response = await completionWithTracing(ctx, {
            model: model ?? OPENAI_MODEL,
            messages: messages,
            tools: tools.length > 0 ? tools : undefined,
            response_format: tools.length > 0 ? undefined : { type: "json_object" },
            prompt_cache_key: options?.promptCacheKey,
            prompt_cache_retention: options?.promptCacheRetention,
            traceMeta: options?.traceMeta,
            ...llmParams,
        }, {
            projectId: contextInfo?.projectId,
            conversationId: contextInfo?.conversationId,
        });
        const message = (response as any).choices[0].message;
        messages.push(message);

        if (message.tool_calls && message.tool_calls.length > 0) {
            for (const toolCall of message.tool_calls) {
                const tc = toolCall as any;
                const toolStart = Date.now();
                if (tc.function.name === "web_search") {
                    const args = JSON.parse(tc.function.arguments);

                    // SAFETY: Enforce commercial intent
                    const q = args.query.toLowerCase();
                    if (!q.includes("price") && !q.includes("buy") && !q.includes("מחיר") && !q.includes("₪") && !q.includes("cost") && !q.includes("store")) {
                        args.query += " price";
                    }

                    try {
                        const result = await searchWeb(args.query);
                        // Removed auto-save of web results. The LLM must process them.
                        messages.push({
                            role: "tool",
                            tool_call_id: toolCall.id,
                            content: JSON.stringify(result)
                        });
                        await logToolCallHelper(ctx, {
                            contextInfo,
                            toolName: "web_search",
                            toolArgs: args,
                            status: "success",
                            latencyMs: Date.now() - toolStart,
                            result,
                        });
                    } catch (e: any) {
                        await logToolCallHelper(ctx, {
                            contextInfo,
                            toolName: "web_search",
                            toolArgs: args,
                            status: "error",
                            latencyMs: Date.now() - toolStart,
                            error: e?.message ?? String(e),
                        });
                        throw e;
                    }
                }
                if (tc.function.name === "agent.data") {
                    const args = JSON.parse(tc.function.arguments);
                    const toolArgs = {
                        ...args,
                        projectId: args?.projectId ?? contextInfo?.projectId,
                    };
                    try {
                        const result = await ctx.runAction(api.agentData.fetch, toolArgs);
                        messages.push({
                            role: "tool",
                            tool_call_id: toolCall.id,
                            content: JSON.stringify(result)
                        });
                        await logToolCallHelper(ctx, {
                            contextInfo,
                            toolName: "agent.data",
                            toolArgs,
                            status: "success",
                            latencyMs: Date.now() - toolStart,
                            result,
                        });
                    } catch (e: any) {
                        await logToolCallHelper(ctx, {
                            contextInfo,
                            toolName: "agent.data",
                            toolArgs,
                            status: "error",
                            latencyMs: Date.now() - toolStart,
                            error: e?.message ?? String(e),
                        });
                        throw e;
                    }
                }
                if (tc.function.name === "run_skill") {
                    const args = JSON.parse(tc.function.arguments);
                    if (contextInfo) {
                        try {
                            const resultBlocks = await ctx.runAction(api.skills.actions.runSkill, {
                                projectId: contextInfo.projectId,
                                conversationId: contextInfo.conversationId,
                                skillId: args.skillId,
                                params: { source: "orchestrator" }
                            });
                            messages.push({
                                role: "tool",
                                tool_call_id: toolCall.id,
                                content: JSON.stringify({ status: "success", resultSummary: "Skill executed successfully. Results added to chat." })
                            });
                            await logToolCallHelper(ctx, {
                                contextInfo,
                                toolName: "run_skill",
                                toolArgs: args,
                                status: "success",
                                latencyMs: Date.now() - toolStart,
                                result: { ok: true },
                            });
                        } catch (e: any) {
                            messages.push({
                                role: "tool",
                                tool_call_id: toolCall.id,
                                content: JSON.stringify({ status: "error", error: e.message })
                            });
                            await logToolCallHelper(ctx, {
                                contextInfo,
                                toolName: "run_skill",
                                toolArgs: args,
                                status: "error",
                                latencyMs: Date.now() - toolStart,
                                error: e?.message ?? String(e),
                            });
                        }
                    } else {
                        messages.push({
                            role: "tool",
                            tool_call_id: toolCall.id,
                            content: JSON.stringify({ status: "error", error: "Context missing" })
                        });
                        await logToolCallHelper(ctx, {
                            contextInfo,
                            toolName: "run_skill",
                            toolArgs: args,
                            status: "error",
                            latencyMs: Date.now() - toolStart,
                            error: "Context missing",
                        });
                    }
                }
                if (tc.function.name === "generate_quote") {
                    const args = JSON.parse(tc.function.arguments);
                    if (contextInfo) {
                        try {
                            const inputs = args?.inputs ?? {};
                            const quoteId = await ctx.runMutation(api.quotes.createDraftFromUi, {
                                projectId: contextInfo.projectId,
                                inputs,
                            });
                            await ctx.runAction(api.quotes.generateQuoteV2, {
                                projectId: contextInfo.projectId,
                                quoteId,
                            });
                            messages.push({
                                role: "tool",
                                tool_call_id: toolCall.id,
                                content: JSON.stringify({ status: "success", quoteId })
                            });
                            await logToolCallHelper(ctx, {
                                contextInfo,
                                toolName: "generate_quote",
                                toolArgs: args,
                                status: "success",
                                latencyMs: Date.now() - toolStart,
                                result: { quoteId },
                            });
                        } catch (e: any) {
                            messages.push({
                                role: "tool",
                                tool_call_id: toolCall.id,
                                content: JSON.stringify({ status: "error", error: e.message })
                            });
                            await logToolCallHelper(ctx, {
                                contextInfo,
                                toolName: "generate_quote",
                                toolArgs: args,
                                status: "error",
                                latencyMs: Date.now() - toolStart,
                                error: e?.message ?? String(e),
                            });
                        }
                    } else {
                        messages.push({
                            role: "tool",
                            tool_call_id: toolCall.id,
                            content: JSON.stringify({ status: "error", error: "Context missing" })
                        });
                        await logToolCallHelper(ctx, {
                            contextInfo,
                            toolName: "generate_quote",
                            toolArgs: args,
                            status: "error",
                            latencyMs: Date.now() - toolStart,
                            error: "Context missing",
                        });
                    }
                }
                if (tc.function.name === "estimate_tasks") {
                    if (contextInfo) {
                        try {
                            const result = await ctx.runMutation(api.agent_tasks.runEstimator, {
                                projectId: contextInfo.projectId,
                            });
                            messages.push({
                                role: "tool",
                                tool_call_id: toolCall.id,
                                content: JSON.stringify({ status: "success", result })
                            });
                            await logToolCallHelper(ctx, {
                                contextInfo,
                                toolName: "estimate_tasks",
                                toolArgs: {},
                                status: "success",
                                latencyMs: Date.now() - toolStart,
                                result,
                            });
                        } catch (e: any) {
                            messages.push({
                                role: "tool",
                                tool_call_id: toolCall.id,
                                content: JSON.stringify({ status: "error", error: e.message })
                            });
                            await logToolCallHelper(ctx, {
                                contextInfo,
                                toolName: "estimate_tasks",
                                toolArgs: {},
                                status: "error",
                                latencyMs: Date.now() - toolStart,
                                error: e?.message ?? String(e),
                            });
                        }
                    } else {
                        messages.push({
                            role: "tool",
                            tool_call_id: toolCall.id,
                            content: JSON.stringify({ status: "error", error: "Context missing" })
                        });
                        await logToolCallHelper(ctx, {
                            contextInfo,
                            toolName: "estimate_tasks",
                            toolArgs: {},
                            status: "error",
                            latencyMs: Date.now() - toolStart,
                            error: "Context missing",
                        });
                    }
                }
            }
            continue; // Loop again to let LLM process tool results
        }

        // FALLBACK: Check for text-embedded tool calls (e.g. {"tool_call": ...})
        // This handles models that output tool calls as JSON objects in content instead of native calls.
        const contentText = message.content || "";
        const embeddedToolCalls: any[] = [];
        // Regex to match {"tool_call": ... } objects. 
        // Captures the full JSON object. Note: nested braces might break simple regex, but this covers common cases.
        const rawToolRegex = /\{"tool_call":\s*\{(?:[^{}]|{[^{}]*})*\}\}/g;
        let match;
        while ((match = rawToolRegex.exec(contentText)) !== null) {
            try {
                const parsed = JSON.parse(match[0]);
                if (parsed.tool_call) embeddedToolCalls.push(parsed.tool_call);
            } catch (e) {
                // Ignore parse errors, likely not a valid tool call
            }
        }

        if (embeddedToolCalls.length > 0) {
            console.log("Found embedded tool calls:", embeddedToolCalls.length);
            // We must synthesize a tool response conversation turn.
            // Since these didn't come from a real "assistant" with tool_calls, we have to be careful.
            // We'll treat them as if the assistant asked for them.
            // But we can't easily modify the previous 'assistant' message object structure retrospectively without native tool_calls.
            // So instead, we will just APPEND a 'user' or 'system' role message with the results, or inject them into the context.

            // Better strategy: Execute them, and append a "system" message with the results.
            const results = [];
            for (const tc of embeddedToolCalls) {
                const toolStart = Date.now();
                if (tc.name === "web_search") {
                    const args = tc.arguments;

                    // SAFETY: Enforce commercial intent
                    const q = (args.query || "").toLowerCase();
                    if (!q.includes("price") && !q.includes("buy") && !q.includes("מחיר") && !q.includes("₪") && !q.includes("cost") && !q.includes("store")) {
                        args.query = (args.query || "") + " price";
                    }

                    const result = await searchWeb(args.query);
                    // Removed auto-save of web results.
                    results.push(`Tool 'web_search' (${args.query}) result: ${JSON.stringify(result)}`);
                    await logToolCallHelper(ctx, {
                        contextInfo,
                        toolName: "web_search",
                        toolArgs: args,
                        status: "success",
                        latencyMs: Date.now() - toolStart,
                        result,
                    });
                }
                if (tc.name === "agent.data") {
                    const args = typeof tc.arguments === "string" ? JSON.parse(tc.arguments) : (tc.arguments ?? {});
                    const toolArgs = {
                        ...args,
                        projectId: args?.projectId ?? contextInfo?.projectId,
                    };
                    const result = await ctx.runAction(api.agentData.fetch, toolArgs);
                    results.push(`Tool 'agent.data' result: ${JSON.stringify(result)}`);
                    await logToolCallHelper(ctx, {
                        contextInfo,
                        toolName: "agent.data",
                        toolArgs,
                        status: "success",
                        latencyMs: Date.now() - toolStart,
                        result,
                    });
                }
                if (tc.name === "generate_quote") {
                    if (!contextInfo) continue;
                    const args = typeof tc.arguments === "string" ? JSON.parse(tc.arguments) : (tc.arguments ?? {});
                    const inputs = args?.inputs ?? {};
                    const quoteId = await ctx.runMutation(api.quotes.createDraftFromUi, {
                        projectId: contextInfo.projectId,
                        inputs,
                    });
                    await ctx.runAction(api.quotes.generateQuoteV2, {
                        projectId: contextInfo.projectId,
                        quoteId,
                    });
                    results.push(`Tool 'generate_quote' result: ${JSON.stringify({ quoteId })}`);
                    await logToolCallHelper(ctx, {
                        contextInfo,
                        toolName: "generate_quote",
                        toolArgs: args,
                        status: "success",
                        latencyMs: Date.now() - toolStart,
                        result: { quoteId },
                    });
                }
                if (tc.name === "estimate_tasks") {
                    if (!contextInfo) continue;
                    const result = await ctx.runMutation(api.agent_tasks.runEstimator, {
                        projectId: contextInfo.projectId,
                    });
                    results.push(`Tool 'estimate_tasks' result: ${JSON.stringify(result)}`);
                    await logToolCallHelper(ctx, {
                        contextInfo,
                        toolName: "estimate_tasks",
                        toolArgs: {},
                        status: "success",
                        latencyMs: Date.now() - toolStart,
                        result,
                    });
                }
            }

            if (results.length > 0) {
                messages.push({
                    role: "system",
                    content: `Tool Execution Results:\n${results.join("\n\n")}\n\nUse these results to formulate your response.`
                });
                continue; // Loop again
            }
        }

        // Final response
        const content = message.content;
        if (!content) throw new Error("Empty response from LLM");

        const parsed = tryParseJson(content);
        if (!parsed) {
            console.warn("JSON parse failed, returning text block", content);
            return [{ type: "ChatBlock", markdownHe: content }];
        }

        // Removed legacy fallback for RESEARCH_PRICING_ESTIMATES_WEB that bypassed reasoning.


        let blocks = parsed.blocks || parsed;
        if (!Array.isArray(blocks)) blocks = [blocks];

        // Handle sibling changeSet (new pattern)
        if (parsed.changeSet && typeof parsed.changeSet === "object" && Array.isArray(parsed.changeSet.ops)) {
            blocks.push({
                type: "ChangeSetBlock",
                titleHe: parsed.changeSet.titleHe || parsed.summaryHe || "שינויים מוצעים",
                summaryHe: parsed.changeSet.summaryHe,
                changeSet: parsed.changeSet
            });
        }

        // Preserve summaryHe if it exists on the parent object
        if (parsed.summaryHe && typeof parsed.summaryHe === "string") {
            blocks.unshift({
                type: "ChatBlock",
                markdownHe: parsed.summaryHe
            });
        }

        return normalizeBlocks(blocks);
    }

    throw new Error("Max turns reached");
}

async function runGateLogic(ctx: any, args: { projectId: any; conversationId: any; targetSkillId: string; targetSkillLabel: string }) {
    const gateSkill = await ctx.runQuery(internal.skills.runner.getGateSkill);
    if (!gateSkill) throw new Error("Clarifications Gate skill not found");

    const context = await ctx.runQuery(internal.skills.runner.buildContext, { projectId: args.projectId, params: {} });
    const flags = await loadFlags(ctx);
    const useCtxPacks = isEnabled(flags, "ff_ctx_packs_v1", false);
    const ctxEnvelope = useCtxPacks
        ? await ctx.runQuery(internal.contextManager.pull.ctxPull, {
            projectId: args.projectId,
            skillId: "CLARIFICATIONS_GATE",
            params: {},
            allowedTools: {},
        })
        : null;
    const clarification = await ctx.runQuery(internal.skills.runner.getLatestClarifications, {
        projectId: args.projectId,
        targetSkillId: args.targetSkillId,
    });
    const gateContext = {
        targetSkillId: args.targetSkillId,
        projectContext: context.projectContext,
        files: context.files,
        memories: context.memories,
        qaPairs: context.qaPairs,
        priorClarifications: clarification,
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

    const gatePromptContext = useCtxPacks
        ? {
            ctxPacks: ctxEnvelope,
            clarifications: clarification,
            extraContext: {
                targetSkillId: args.targetSkillId,
                targetSkillLabel: args.targetSkillLabel,
            },
        }
        : gateContext;

    const promptCache = buildPromptCacheOptions({
        flags,
        model: gateSkill.model,
        skillId: "CLARIFICATIONS_GATE",
        allowedTools: {},
        viewId: ctxEnvelope?.view,
    });

    const traceMeta = ctxEnvelope
        ? {
            ctxPacks: {
                view: ctxEnvelope.view,
                packCount: ctxEnvelope.stats.packCount,
                totalBytes: ctxEnvelope.stats.totalBytes,
                packIds: ctxEnvelope.manifest.packs.map((p) => p.id),
            },
        }
        : undefined;

    const blocks = await callLLM(
        ctx,
        buildSystemPrompt({ ...gateSkill, prompts: { ...gateSkill.prompts, promptAddon: prompt } }, gatePromptContext),
        {},
        gateSkill.model,
        gateSkill.llmParams,
        { projectId: args.projectId, conversationId: args.conversationId },
        {
            ...promptCache,
            traceMeta,
        }
    );

    // Store Session
    const questionsBlock = blocks.find((b: any) => b.type === "QuestionsBlock");
    if (questionsBlock && questionsBlock.questions) {
        const filteredQuestions = filterUnansweredQuestions(questionsBlock.questions, {
            qaPairs: context.qaPairs,
            priorClarifications: clarification
        });

        if (filteredQuestions.length === 0) {
            await ctx.runMutation(internal.skills.runner.createClarificationSession, {
                projectId: args.projectId,
                conversationId: args.conversationId,
                targetSkillId: args.targetSkillId,
                questions: [],
                answers: {}, // Corrected: pass object not array
            });

            return await ctx.runAction(api.skills.actions.runSkill, {
                projectId: args.projectId,
                conversationId: args.conversationId,
                skillId: args.targetSkillId,
                params: { source: "gate_auto_skip" }
            });
        }

        questionsBlock.questions = filteredQuestions;
        questionsBlock.continueAction = {
            labelHe: questionsBlock.continueAction?.labelHe ?? "המשך",
            payload: { targetSkillId: args.targetSkillId }
        };
        if (!questionsBlock.followupAction) {
            questionsBlock.followupAction = { labelHe: "שאלו עוד שאלות" };
        }
        questionsBlock.targetSkillId = args.targetSkillId;
        await ctx.runMutation(internal.skills.runner.createClarificationSession, {
            projectId: args.projectId,
            conversationId: args.conversationId,
            targetSkillId: args.targetSkillId,
            questions: filteredQuestions
        });
    }

    // Save Message
    await ctx.runMutation(internal.skills.runner.saveAgentMessage, {
        conversationId: args.conversationId,
        blocks
    });

    return blocks;
}

// --- Actions ---

export const runSkill = action({
    args: {
        projectId: v.id("projects"),
        conversationId: v.id("agentConversations"),
        skillId: v.string(),
        params: v.optional(v.any()),
    },
    handler: async (ctx, args) => {
        const { projectId, conversationId, skillId, params } = args;

        console.log('[skills.runSkill] start', {
            projectId,
            conversationId,
            skillId,
            source: params?.source,
            draftOnly: !!params?.draftOnly,
        });

        // 1. Load Skill & Gate Check
        const skillData = await ctx.runQuery(internal.skills.runner.getSkillAndGateStatus, {
            projectId, conversationId, skillId
        });

        if (!skillData.skill) throw new Error(`Skill ${skillId} not found`);

        const flags = await loadFlags(ctx);
        const useCtxPacks = isEnabled(flags, "ff_ctx_packs_v1", false);

        if (params?.forceClarifications) {
            return await runGateLogic(ctx, { projectId, conversationId, targetSkillId: skillId, targetSkillLabel: skillData.skill.labelHe });
        }

        if (skillData.isGateBlocked && !params?.skipClarifications) {
            console.log('[skills.runSkill] gate blocked', { projectId, skillId });
            // Run Gate Logic
            return await runGateLogic(ctx, { projectId, conversationId, targetSkillId: skillId, targetSkillLabel: skillData.skill.labelHe });
        }

        if (skillId === "CONTEXT_GENERATION" && params?.freeText) {
            await ctx.runMutation(internal.memory.appendUserInput, {
                projectId,
                text: String(params.freeText),
            });
        }

        // 2. Create Run (Mutation)
        const runId = await ctx.runMutation(internal.skills.runner.createRun, {
            projectId,
            conversationId,
            skillId,
            params,
        });
        console.log('[skills.runSkill] created run', { runId, projectId, skillId });

        const forceWebSearch = skillId === "RESEARCH_PRICING_ESTIMATES_WEB";
        const allowedTools = {
            webSearch: forceWebSearch || !!(skillData.skill.config.allowedTools?.webSearch && params?.toggles?.useWebSearch),
            ragSearch: !!skillData.skill.config.allowedTools?.ragSearch,
            fileInspect: !!skillData.skill.config.allowedTools?.fileInspect,
            runSkill: !!skillData.skill.config.allowedTools?.runSkill,
            generateQuote: !!skillData.skill.config.allowedTools?.generateQuote,
            estimateTasks: !!skillData.skill.config.allowedTools?.estimateTasks,
            agentData: !!skillData.skill.config.allowedTools?.agentData,
        };

        await ctx.runMutation(internal.skills.runner.setRunProgress, {
            runId,
            phase: "loading_context",
            phaseLabel: "Loading project context",
            phaseDetail: "Collecting relevant data for this skill",
        });

        // 3. Build Context (Query)
        const context = !useCtxPacks
            ? await ctx.runQuery(internal.skills.runner.buildContext, { projectId, params, skillId })
            : null;

        const ctxEnvelope = useCtxPacks
            ? await ctx.runQuery(internal.contextManager.pull.ctxPull, {
                projectId,
                skillId,
                params,
                allowedTools,
            })
            : null;
        const clarification = await ctx.runQuery(internal.skills.runner.getLatestClarifications, {
            projectId,
            targetSkillId: skillId,
        });

        // 4. LLM Call
        try {
            const promptContext = useCtxPacks
                ? { ctxPacks: ctxEnvelope, clarifications: clarification }
                : { ...context, clarifications: clarification };

            const systemPrompt = buildSystemPrompt(skillData.skill, promptContext);

            if (skillId === "HELLO_WORLD_TEST") {
                await ctx.runMutation(internal.skills.runner.setRunProgress, {
                    runId,
                    phase: "running_model",
                    phaseLabel: "Running skill model",
                    phaseDetail: getSkillPhaseDetail(skillId, skillData.skill.labelHe),
                });
                const blocks = await callHelloWorldAgent(systemPrompt, skillData.skill.model, skillData.skill.llmParams);
                await ctx.runMutation(internal.skills.runner.setRunProgress, {
                    runId,
                    phase: "building_output",
                    phaseLabel: "Building response",
                    phaseDetail: "Formatting output blocks",
                });
                const savedBlocks = await ctx.runMutation(internal.skills.runner.saveRunResult, {
                    runId,
                    conversationId,
                    blocks,
                    projectId,
                });
                console.log("[skills.runSkill] hello world saved", { runId, projectId, skillId, blocks: blocks.length });
                return savedBlocks;
            }

            const promptCache = buildPromptCacheOptions({
                flags,
                model: skillData.skill.model,
                skillId,
                allowedTools,
                viewId: ctxEnvelope?.view,
            });

            const traceMeta = ctxEnvelope
                ? {
                    ctxPacks: {
                        view: ctxEnvelope.view,
                        packCount: ctxEnvelope.stats.packCount,
                        totalBytes: ctxEnvelope.stats.totalBytes,
                        packIds: ctxEnvelope.manifest.packs.map((p) => p.id),
                    },
                }
                : undefined;

            if (skillId === "CONTEXT_GENERATION") {
                await ctx.runMutation(internal.skills.runner.setRunProgress, {
                    runId,
                    phase: "running_model",
                    phaseLabel: "Running skill model",
                    phaseDetail: "Generating context document",
                });
                const docPrompt = `${systemPrompt}\n\nOUTPUT MODE: DOC_ONLY. Return JSON with blocks array containing ONLY ChatBlock.`;
                const docBlocks = await callLLM(
                    ctx,
                    docPrompt,
                    allowedTools,
                    skillData.skill.model,
                    skillData.skill.llmParams,
                    {
                        projectId,
                        conversationId,
                        skillId,
                        runId,
                    },
                    {
                        ...promptCache,
                        traceMeta,
                    }
                );
                const docBlock = docBlocks.find((b: any) => b.type === "ChatBlock" && typeof b.markdownHe === "string");
                if (docBlock?.markdownHe?.trim()) {
                    await ctx.runMutation(api.memory.updateRunningMemory, {
                        projectId,
                        contentMd_he: docBlock.markdownHe,
                    });
                }

                const updatedContext = useCtxPacks
                    ? {
                        ctxPacks: ctxEnvelope,
                        clarifications: clarification,
                        extraContext: {
                            currentKnowledge: docBlock?.markdownHe ?? "",
                        },
                    }
                    : {
                        ...context,
                        currentKnowledge: docBlock?.markdownHe ?? context.currentKnowledge,
                        clarifications: clarification,
                    };
                const questionsPrompt = `${buildSystemPrompt(skillData.skill, updatedContext)}\n\nOUTPUT MODE: QUESTIONS_ONLY. Return JSON with blocks array containing ONLY QuestionsBlock. Base questions on updated currentKnowledge + qaPairs + userInput.`;
                await ctx.runMutation(internal.skills.runner.setRunProgress, {
                    runId,
                    phase: "running_model",
                    phaseLabel: "Running skill model",
                    phaseDetail: "Generating clarification questions",
                });
                const questionBlocks = await callLLM(
                    ctx,
                    questionsPrompt,
                    allowedTools,
                    skillData.skill.model,
                    skillData.skill.llmParams,
                    {
                        projectId,
                        conversationId,
                        skillId,
                        runId,
                    },
                    {
                        ...promptCache,
                        traceMeta,
                    }
                );

                const combinedBlocks = [
                    ...docBlocks.filter((b: any) => b.type === "ChatBlock"),
                    ...questionBlocks.filter((b: any) => b.type === "QuestionsBlock")
                ];

                await ctx.runMutation(internal.skills.runner.setRunProgress, {
                    runId,
                    phase: "building_output",
                    phaseLabel: "Building response",
                    phaseDetail: "Combining context and questions",
                });

                const savedBlocks = await ctx.runMutation(internal.skills.runner.saveRunResult, {
                    runId,
                    conversationId,
                    blocks: combinedBlocks,
                    projectId,
                });

                console.log('[skills.runSkill] context generation saved', {
                    runId,
                    projectId,
                    skillId,
                    blocks: combinedBlocks.length,
                });

                return savedBlocks;
            }

            await ctx.runMutation(internal.skills.runner.setRunProgress, {
                runId,
                phase: "running_model",
                phaseLabel: "Running skill model",
                phaseDetail: getSkillPhaseDetail(skillId, skillData.skill.labelHe),
            });
            const blocks = await callLLM(
                ctx,
                systemPrompt,
                allowedTools,
                skillData.skill.model,
                skillData.skill.llmParams,
                {
                    projectId,
                    conversationId,
                    skillId,
                    runId,
                },
                {
                    ...promptCache,
                    traceMeta,
                }
            );

            await ctx.runMutation(internal.skills.runner.setRunProgress, {
                runId,
                phase: "building_output",
                phaseLabel: "Building response",
                phaseDetail: "Formatting output blocks",
            });

            // 5. Save Result (Mutation)
            const savedBlocks = await ctx.runMutation(internal.skills.runner.saveRunResult, {
                runId,
                conversationId,
                blocks,
                projectId, // needed for ChangeSet creation inside
            });

            console.log('[skills.runSkill] saved', { runId, projectId, skillId, blocks: blocks.length });
            return savedBlocks;

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
        skillId: v.optional(v.string()),
        params: v.optional(v.any())
    },
    handler: async (ctx, args) => {
        // 1. Save User Message
        await ctx.runMutation(api.skills.runner.sendUserMessage, {
            conversationId: args.conversationId,
            text: args.text,
        });

        // 2. Trigger Chat or Specific Skill
        let targetSkillId = args.skillId ?? "CONSULTANT_CHAT";

        // HALLUCINATION FIX: Remap common invented skill IDs to real ones
        if (targetSkillId.startsWith("prepareChangeSet_") || targetSkillId === "updateElement" || targetSkillId === "updateElementDescription") {
            console.log(`[skills.runner] Remapping hallucinated skill "${targetSkillId}" to "ELEMENTS_BUILDER_FULL"`);
            targetSkillId = "ELEMENTS_BUILDER_FULL";
        }

        await ctx.runAction(api.skills.actions.runSkill, {
            projectId: args.projectId,
            conversationId: args.conversationId,
            skillId: targetSkillId,
            params: args.params ? { ...args.params, source: "user_chat" } : { source: "user_chat" },
        });

        // 3. Auto-Rename Check
        const conversation = await ctx.runQuery(internal.skills.runner.getConversation, { conversationId: args.conversationId });
        if (conversation && conversation.title === "New Session") {
            const messages = await ctx.runQuery(api.skills.runner.listAgentMessages, { conversationId: args.conversationId });
            if (messages.length >= 2) {
                await ctx.runAction(api.skills.actions.generateConversationTitle, {
                    conversationId: args.conversationId,
                    projectId: args.projectId
                });
            }
        }
    }
});

export const generateConversationTitle = action({
    args: {
        conversationId: v.id("agentConversations"),
        projectId: v.id("projects")
    },
    handler: async (ctx, args) => {
        const messages = await ctx.runQuery(api.skills.runner.listAgentMessages, { conversationId: args.conversationId });
        if (messages.length === 0) return;

        // Prepare history text
        const history = messages.slice(0, 4).map((m: any) => {
            let content = m.text ?? "";
            if (m.blocks) {
                content = m.blocks.map((b: any) => b.markdownHe || b.titleHe || "").join(" ");
            }
            return `${m.role}: ${content}`;
        }).join("\n\n");

        const prompt = `Suggest a very short title (max 5 words) for this conversation. If the language is Hebrew, use Hebrew. Output ONLY the title, no quotes. \n\nConversation:\n${history}`;

        try {
            const response = await completionWithTracing(ctx, {
                model: SMALL_MODEL,
                messages: [{ role: "user", content: prompt }]
            }, {
                projectId: args.projectId,
                conversationId: args.conversationId
            });

            const title = (response as any).choices[0].message.content?.trim().replace(/^["']|["']$/g, "");
            if (title) {
                await ctx.runMutation(internal.skills.runner.renameConversation, {
                    conversationId: args.conversationId,
                    title
                });
            }
        } catch (e) {
            console.error("Failed to generate title", e);
        }
    }
});
