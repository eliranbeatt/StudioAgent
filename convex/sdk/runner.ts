import { action } from '../_generated/server';
import { v } from 'convex/values';
import { REGISTRY } from './registry';
import { runJsonCompletion } from './llm';
import { assertAsciiKeys, validateSdkOutput } from './schemas';
import { internal } from '../_generated/api';

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

  const userMessage =
    typeof args.input === 'string'
      ? args.input
      : JSON.stringify(args.input ?? {}, null, 2);

  const { parsed } = await runJsonCompletion({
    systemPrompt: toolDef.systemPrompt,
    userContent: userMessage,
    model: toolDef.model,
    temperature: toolDef.temperature,
    maxTokens: toolDef.maxTokens,
  });

  assertAsciiKeys(parsed);
  const validated = validateSdkOutput(toolDef.schemaName, parsed);
  if (!validated.ok) {
    throw new Error(`Tool ${args.toolId} failed schema validation`);
  }

  if (args.runId) {
    await args.ctx.runMutation(internal.sdk.telemetry.logEvent, {
      runId: args.runId as any,
      type: 'tool_result',
      payload: { toolId: args.toolId, output: validated.data },
    });
  }

  return validated.data;
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
