"use node";

import { action } from '../_generated/server';
import { v } from 'convex/values';
import { REGISTRY } from './registry';
import { runJsonCompletion } from './llm';
import { assertAsciiKeys, validateSdkOutput } from './schemas';
import { api, internal } from '../_generated/api';
import { completionWithTracing } from '../lib/llm';
import { searchWeb } from '../lib/webSearch';
import { buildMessageStats, summarizeToolResultCompact } from './messageCompression';
import { postProcessToolOutput } from './postprocess';

const MAX_TOOL_LOOPS = 6;

function resolveContextCompatMode() {
  const raw = process.env.SDK_CONTEXT_COMPAT_MODE;
  if (raw == null) return true;
  return !['0', 'false', 'off', 'no'].includes(String(raw).trim().toLowerCase());
}

type ToolHandler = (args: any) => Promise<any>;

function toOpenAIToolName(name: string) {
  return name.replace(/[^a-zA-Z0-9_-]/g, '_');
}

function buildToolDefinitions(allowedTools: string[], nameMap: Map<string, string>) {
  const usedNames = new Set<string>();
  const makeUniqueName = (base: string) => {
    let candidate = base || 'tool';
    let counter = 1;
    while (usedNames.has(candidate)) {
      candidate = `${base || 'tool'}_${counter}`;
      counter += 1;
    }
    usedNames.add(candidate);
    return candidate;
  };

  return allowedTools.map((name, index) => {
    const baseName = toOpenAIToolName(name);
    const safeBase = /^[a-zA-Z0-9_-]+$/.test(baseName) ? baseName : `tool_${index}`;
    const openAiName = makeUniqueName(safeBase);
    nameMap.set(openAiName, name);
    if (name === 'context.get') {
      return {
        type: 'function',
        function: {
          name: openAiName,
          description: 'Fetch minimal project context by packs.',
          parameters: {
            type: 'object',
            properties: {
              packs: { type: 'array', items: { type: 'string' } },
              filters: { type: 'object' },
            },
            required: ['packs'],
          },
        },
      };
    }
    if (name === 'knowledge.summarize_or_update') {
      return {
        type: 'function',
        function: {
          name: openAiName,
          description: 'Update working knowledge doc with new facts.',
          parameters: {
            type: 'object',
            properties: {
              currentDoc: { type: 'object' },
              newFacts: { type: 'array', items: { type: 'string' } },
              userText: { type: 'string' },
            },
            required: ['newFacts'],
          },
        },
      };
    }
    if (name === 'changeset.compile') {
      return {
        type: 'function',
        function: {
          name: openAiName,
          description: 'Compile intents into a ChangeSet draft.',
          parameters: {
            type: 'object',
            properties: {
              intents: { type: 'array', items: { type: 'object' } },
              context: { type: 'object' },
            },
            required: ['intents'],
          },
        },
      };
    }
    if (name === 'changeset.review') {
      return {
        type: 'function',
        function: {
          name: openAiName,
          description: 'Review a ChangeSet draft.',
          parameters: {
            type: 'object',
            properties: {
              changeSetId: { type: 'string' },
              changeSet: { type: 'object' },
            },
          },
        },
      };
    }
    if (name === 'changeset.apply') {
      return {
        type: 'function',
        function: {
          name: openAiName,
          description: 'Apply ChangeSet after approval.',
          parameters: {
            type: 'object',
            properties: {
              approvalToken: { type: 'string' },
            },
            required: ['approvalToken'],
          },
        },
      };
    }
    if (name === 'web_search') {
      return {
        type: 'function',
        function: {
          name: openAiName,
          description: 'Search the web for real-time information.',
          parameters: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'Search query' },
              templateId: { type: 'string', description: 'materialTemplates id for logging' },
              variantId: { type: 'string', description: 'materialVariants id for logging' },
              uomCode: { type: 'string', description: 'UOM code for pricing context' },
            },
            required: ['query'],
          },
        },
      };
    }
    return {
      type: 'function',
      function: {
        name: openAiName,
        description: `Run tool ${name}`,
        parameters: {
          type: 'object',
          properties: {
            input: { type: 'object' },
          },
        },
      },
    };
  });
}

function coerceToJson(input: any) {
  if (typeof input === 'string') return input;
  return JSON.stringify(input ?? {}, null, 2);
}

function formatSchemaErrors(errors: any): string {
  if (!Array.isArray(errors) || errors.length === 0) {
    // Never swallow errors — stringify whatever we got as a last resort
    if (errors && typeof errors === 'object') {
      return `schema_error: ${JSON.stringify(errors).substring(0, 500)}`
    }
    return `schema_error: ${String(errors ?? 'no error details available')}`
  }
  return errors
    .slice(0, 6)
    .map((err: any) => {
      const path = Array.isArray(err?.path) ? err.path.join('.') : 'root'
      const message = String(err?.message ?? 'invalid')
      return `${path}: ${message}`
    })
    .join(' | ')
}

function resolveRuntimeLlm(input: any, toolDef: any) {
  const llm = input && typeof input === 'object' ? (input as any).llm : undefined
  const model = typeof llm?.model === 'string' && llm.model.trim() ? llm.model.trim() : toolDef.model
  const reasoningEffort =
    typeof llm?.reasoningEffort === 'string' && llm.reasoningEffort.trim()
      ? llm.reasoningEffort.trim()
      : undefined
  return { model, reasoningEffort }
}

async function buildToolHandlers(args: {
  ctx: any;
  projectId: string;
  runId?: string;
  conversationId?: string;
}) {
  const sdkApi = (api as any)['sdk/api'] ?? (api as any).sdk?.api;
  const sdkKnowledge = (api as any)['sdk/knowledge'] ?? (api as any).sdk?.knowledge;
  const sdkChangeset = (api as any)['sdk/changeset'] ?? (api as any).sdk?.changeset;
  const sdkFinalize = (api as any)['sdk/finalize'] ?? (api as any).sdk?.finalize;
  if (!sdkApi || !sdkKnowledge || !sdkChangeset || !sdkFinalize) {
    throw new Error('SDK API modules not available. Run Convex codegen and restart the server.');
  }

  const toolHandlers: Record<string, ToolHandler> = {
    'context.get': async (input: any) =>
      args.ctx.runQuery(sdkApi.contextGet, {
        projectId: args.projectId,
        packs: input?.packs ?? ['project', 'knowledge'],
        filters: input?.filters,
        compatMode: input?.compatMode ?? resolveContextCompatMode(),
      }),
    'knowledge.summarize_or_update': async (input: any) =>
      args.ctx.runAction(sdkKnowledge.summarizeOrUpdate, {
        projectId: args.projectId,
        currentDoc: input?.currentDoc,
        newFacts: input?.newFacts ?? [],
        userText: input?.userText,
        runId: args.runId,
        conversationId: args.conversationId,
      }),
    'changeset.compile': async (input: any) =>
      args.ctx.runAction(sdkChangeset.compile, {
        projectId: args.projectId,
        intents: input?.intents ?? [],
        context: input?.context,
        runId: args.runId,
        conversationId: args.conversationId,
      }),
    'changeset.review': async (input: any) =>
      args.ctx.runAction(sdkChangeset.review, {
        projectId: args.projectId,
        changeSetId: input?.changeSetId,
        changeSet: input?.changeSet,
        runId: args.runId,
        conversationId: args.conversationId,
      }),
    'changeset.apply': async (input: any) =>
      args.ctx.runAction(sdkChangeset.apply, {
        runId: args.runId,
        approvalToken: input?.approvalToken ?? '',
      }),
    'finalize.build_structured_package': async (input: any) =>
      args.ctx.runAction(sdkFinalize.buildStructuredPackage, {
        projectId: args.projectId,
        runId: args.runId,
        includeAssumptions: input?.includeAssumptions,
      }),
    web_search: async (input: any) => {
      const q = String(input?.query ?? '');
      if (!q) return { error: 'Missing query' };
      return await searchWeb(q);
    },
  };

  for (const toolId of Object.keys(REGISTRY)) {
    if (!toolHandlers[toolId]) {
      toolHandlers[toolId] = async (input: any) =>
        runToolInternal({
          ctx: args.ctx,
          projectId: args.projectId,
          toolId,
          input: input?.input ?? input ?? {},
          runId: args.runId,
          conversationId: args.conversationId,
        });
    }
  }

  return toolHandlers;
}

async function runAgentInternal(args: {
  ctx: any;
  projectId: string;
  toolId: string;
  input: any;
  runId?: string;
  conversationId?: string;
}) {
  const toolDef = REGISTRY[args.toolId];
  if (!toolDef) throw new Error(`Tool ${args.toolId} not found in registry`);

  const toolHandlers = await buildToolHandlers(args);
  const toolNameMap = new Map<string, string>();
  const tools = buildToolDefinitions(toolDef.allowedTools ?? [], toolNameMap);

  const messages: any[] = [
    { role: 'system', content: toolDef.systemPrompt },
    { role: 'user', content: coerceToJson(args.input) },
  ];
  const runtimeLlm = resolveRuntimeLlm(args.input, toolDef);

  let finalContent: string | null = null;
  for (let i = 0; i < MAX_TOOL_LOOPS; i++) {
    if (args.runId) {
      await args.ctx.runMutation(internal.sdk.telemetry.logEvent, {
        runId: args.runId as any,
        type: 'llm_input_snapshot',
        payload: {
          scope: 'sdk.runner',
          loop: i + 1,
          ...buildMessageStats(messages),
        },
      });
    }

    const response = await completionWithTracing(
      args.ctx,
      {
        model: runtimeLlm.model,
        reasoning_effort: runtimeLlm.reasoningEffort,
        temperature: toolDef.temperature,
        messages,
        tools,
        tool_choice: 'auto',
        traceMeta: {
          source: 'sdk',
          runId: args.runId,
          toolId: args.toolId,
        },
      },
      {
        projectId: args.projectId,
        conversationId: args.conversationId,
        runId: args.runId,
      }
    ) as any;

    const message = response.choices?.[0]?.message;
    if (!message) throw new Error('Empty LLM response');

    if (message.tool_calls && message.tool_calls.length > 0) {
      messages.push({
        role: 'assistant',
        content: message.content ?? '',
        tool_calls: message.tool_calls,
      });

      for (const call of message.tool_calls) {
        const openAiToolName = call.function.name;
        const toolName = toolNameMap.get(openAiToolName) ?? openAiToolName;
        let toolArgs: any = {};
        try {
          toolArgs = call.function.arguments ? JSON.parse(call.function.arguments) : {};
        } catch {
          toolArgs = {};
        }

        if (args.runId) {
          await args.ctx.runMutation(internal.sdk.telemetry.logEvent, {
            runId: args.runId as any,
            type: 'tool_call',
            payload: { toolName, toolArgs, sourceTool: args.toolId },
          });
        }

        let result: any;
        try {
          const handler = toolHandlers[toolName];
          if (!handler) throw new Error(`Tool ${toolName} not available`);
          result = await handler(toolArgs);
        } catch (error: any) {
          result = { error: error?.message ?? String(error) };
        }

        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: summarizeToolResultCompact(toolName, result),
        });
      }

      continue;
    }

    finalContent = message.content ?? '';
    break;
  }

  if (!finalContent) {
    throw new Error('No final response from agent');
  }

  let parsed: any;
  try {
    parsed = JSON.parse(finalContent);
    assertAsciiKeys(parsed);
  } catch {
    parsed = { summaryHe: finalContent };
  }

  const normalizedParsed = postProcessToolOutput(args.toolId, parsed);
  assertAsciiKeys(normalizedParsed);
  const validated = validateSdkOutput(toolDef.schemaName, normalizedParsed);
  if (!validated.ok) {
    console.error(`[runAgentInternal] Tool ${args.toolId} schema validation failed. Raw output keys:`, parsed && typeof parsed === 'object' ? Object.keys(parsed) : typeof parsed);
    throw new Error(`Tool ${args.toolId} failed schema validation: ${formatSchemaErrors((validated as any).errors)}`);
  }

  return validated.data;
}

export async function runToolInternal(args: {
  projectId: string;
  toolId: string;
  input: any;
  runId?: string;
  conversationId?: string;
  ctx: any;
}) {
  const toolDef = REGISTRY[args.toolId];
  if (!toolDef) {
    throw new Error(`Tool ${args.toolId} not found in registry`);
  }

  let result: any;
  if (toolDef.kind === 'agent') {
    result = await runAgentInternal(args);
  } else {
    const userMessage = coerceToJson(args.input);
    const runtimeLlm = resolveRuntimeLlm(args.input, toolDef);
    const { parsed } = await runJsonCompletion({
      ctx: args.ctx,
      systemPrompt: toolDef.systemPrompt,
      userContent: userMessage,
      model: runtimeLlm.model,
      reasoningEffort: runtimeLlm.reasoningEffort,
      temperature: toolDef.temperature,
      projectId: args.projectId,
      conversationId: args.conversationId,
      runId: args.runId,
      traceMeta: {
        source: 'sdk',
        toolId: args.toolId,
      },
    });

    const normalizedParsed = postProcessToolOutput(args.toolId, parsed);
    assertAsciiKeys(normalizedParsed);
    const validated = validateSdkOutput(toolDef.schemaName, normalizedParsed);
    if (!validated.ok) {
      console.error(`[runToolInternal] Tool ${args.toolId} schema validation failed. Raw output keys:`, parsed && typeof parsed === 'object' ? Object.keys(parsed) : typeof parsed);
      throw new Error(`Tool ${args.toolId} failed schema validation: ${formatSchemaErrors((validated as any).errors)}`);
    }
    result = validated.data;
  }

  if (args.runId) {
    await args.ctx.runMutation(internal.sdk.telemetry.logEvent, {
      runId: args.runId as any,
      type: 'tool_result',
      payload: { toolId: args.toolId, output: result },
    });
  }

  return result;
}

export const runTool = action({
  args: {
    projectId: v.id('projects'),
    toolId: v.string(),
    input: v.any(),
    runId: v.optional(v.id('sdkRuns')),
    conversationId: v.optional(v.id('agentConversations')),
  },
  handler: async (ctx, args) => {
    return await runToolInternal({
      ctx,
      projectId: args.projectId,
      toolId: args.toolId,
      input: args.input,
      runId: args.runId,
      conversationId: args.conversationId,
    });
  },
});
