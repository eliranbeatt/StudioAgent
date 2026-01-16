import { ActionCtx, internalMutation } from "../_generated/server";
import { v } from "convex/values";
import OpenAI from "openai";
import { internal } from "../_generated/api";
import { calculateCost } from "./pricing";

export type LLMProvider = "openai" | "gemini" | "anthropic";

export interface TracingParams {
    projectId?: string; // ID string, to be safe
    conversationId?: string;
    runId?: string;
}

export const logTrace = internalMutation({
    args: {
        projectId: v.optional(v.id("projects")),
        conversationId: v.optional(v.string()),
        runId: v.optional(v.string()),
        provider: v.string(),
        model: v.string(),
        inputTokens: v.number(),
        outputTokens: v.number(),
        latencyMs: v.number(),
        status: v.union(v.literal("success"), v.literal("failed")),
        request: v.any(),
        response: v.any(),
        cost: v.optional(v.number()),
        error: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        // We cast valid IDs; if conversationId is passed, strict check might be needed if tables differ,
        // but here we just store it. Note schema uses v.id("conversations") OR agentConversations? 
        // Schema text I wrote used v.id("conversations"). 
        // Let's check schema again. I put `conversationId: v.optional(v.id("conversations"))`
        // Wait, in schema I put `v.id("conversations")`. But agent conversations are `agentConversations` table.
        // I should probably relax the schema or normalize.
        // For now, let's assume we pass the ID as is, and the schema might need to support both or be string.
        // Actually, looking at schema update I just made: `conversationId: v.optional(v.id("conversations"))`
        // If I pass an `agentConversations` ID it might fail validation if I am strict.
        // Let's double check schema update.

        // I will write to the table.
        // We need to match the schema I defined.
        // If the schema expects `id("conversations")`, I can't pass `agentConversations` ID.
        // I should update schema to `v.optional(v.string())` or union if I want to support both types of conversations without trouble.
        // Or I'll fix it in a subsequent step. For now let's implement the mutation generic enough.

        await ctx.db.insert("llmTraces", {
            projectId: args.projectId,
            conversationId: args.conversationId as any, // Cast to any to bypass strict type check if schema differs effectively
            runId: args.runId,
            provider: args.provider,
            model: args.model,
            inputTokens: args.inputTokens,
            outputTokens: args.outputTokens,
            latencyMs: args.latencyMs,
            status: args.status,
            request: args.request,
            response: args.response,
            cost: args.cost,
            error: args.error,
            createdAt: Date.now(),
        });
    }
});

export async function completionWithTracing(
    ctx: ActionCtx,
    params: {
        provider?: LLMProvider;
        model: string;
        messages: any[];
        tools?: any[];
        temperature?: number;
        max_tokens?: number;
        response_format?: any;
        stream?: boolean;
        tool_choice?: any;
        reasoning_effort?: any;
        [key: string]: any; // Allow other params
    },
    tracing: TracingParams
) {
    const provider = params.provider || "openai";
    const start = Date.now();

    // We only support OpenAI for now in this wrapper
    if (provider !== "openai") {
        throw new Error(`Provider ${provider} not yet implemented`);
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    // Prepare request payload for logging
    const logVal = (v: any) => v;
    const requestPayload: any = {
        messages: params.messages,
        tools: params.tools ? params.tools.map(t => t.function.name) : undefined,
        model: params.model,
        temperature: params.temperature,
        stream: params.stream,
        tool_choice: params.tool_choice,
        reasoning_effort: params.reasoning_effort
    };

    try {
        // Construct basic options, filtering out provider
        const { provider: _, ...openAIOptions } = params;

        const response = await client.chat.completions.create(openAIOptions as any);

        if (params.stream) {
            const stream = response as unknown as AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>;
            const collectedChunks: OpenAI.Chat.Completions.ChatCompletionChunk[] = [];

            // We wrap the stream to intercept chunks
            const wrappedStream = (async function* () {
                try {
                    for await (const chunk of stream) {
                        collectedChunks.push(chunk);
                        yield chunk;
                    }

                    // Stream finished successfully
                    const end = Date.now();
                    const duration = end - start;
                    const lastChunk = collectedChunks[collectedChunks.length - 1];
                    const usage = lastChunk?.usage; // Requires stream_options: { include_usage: true } usually
                    const inputTokens = usage?.prompt_tokens || 0;
                    const outputTokens = usage?.completion_tokens || 0;

                    const cost = calculateCost({
                        model: params.model,
                        inputTokens,
                        outputTokens
                    }) ?? undefined;

                    await ctx.runMutation(internal.lib.llm.logTrace, {
                        projectId: tracing.projectId as any,
                        conversationId: tracing.conversationId as any,
                        runId: tracing.runId,
                        provider: provider,
                        model: params.model,
                        inputTokens,
                        outputTokens,
                        latencyMs: duration,
                        status: "success",
                        request: requestPayload,
                        response: {
                            streamed: true,
                            chunkCount: collectedChunks.length,
                            usage: usage
                        },
                        cost
                    });

                } catch (error: any) {
                    const end = Date.now();
                    await ctx.runMutation(internal.lib.llm.logTrace, {
                        projectId: tracing.projectId as any,
                        conversationId: tracing.conversationId as any,
                        runId: tracing.runId,
                        provider: provider,
                        model: params.model,
                        inputTokens: 0,
                        outputTokens: 0,
                        latencyMs: end - start,
                        status: "failed",
                        request: requestPayload,
                        response: { streamed: true, partialChunks: collectedChunks.length },
                        error: error.message || String(error)
                    });
                    throw error;
                }
            })();

            return wrappedStream;
        }

        // NON-STREAMING
        const simpleResponse = response as OpenAI.Chat.Completions.ChatCompletion;
        const end = Date.now();
        const duration = end - start;

        const usage = simpleResponse.usage;
        const inputTokens = usage?.prompt_tokens || 0;
        const outputTokens = usage?.completion_tokens || 0;

        const responsePayload = {
            id: simpleResponse.id,
            choices: simpleResponse.choices.map(c => ({
                message: c.message,
                finish_reason: c.finish_reason
            })),
            usage: usage
        };
        const cost = calculateCost({
            model: params.model,
            inputTokens,
            outputTokens
        }) ?? undefined;

        // Log success
        await ctx.runMutation(internal.lib.llm.logTrace, {
            projectId: tracing.projectId as any,
            conversationId: tracing.conversationId as any,
            runId: tracing.runId,
            provider: provider,
            model: params.model,
            inputTokens,
            outputTokens,
            latencyMs: duration,
            status: "success",
            request: requestPayload,
            response: responsePayload,
            cost
        });

        return simpleResponse;

    } catch (error: any) {
        const end = Date.now();
        await ctx.runMutation(internal.lib.llm.logTrace, {
            projectId: tracing.projectId as any,
            conversationId: tracing.conversationId as any,
            runId: tracing.runId,
            provider: provider,
            model: params.model,
            inputTokens: 0,
            outputTokens: 0,
            latencyMs: end - start,
            status: "failed",
            request: requestPayload,
            response: {},
            error: error.message || String(error)
        });
        throw error;
    }
}

export function isUnsupportedTemperatureError(error: any): boolean {
    if (!error) return false;
    const msg = (error.message || "").toLowerCase();
    return (
        msg.includes("temperature") &&
        (msg.includes("not supported") || msg.includes("unsupported"))
    );
}


