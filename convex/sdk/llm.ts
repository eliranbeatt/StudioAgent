"use node";

import { completionWithTracing } from '../lib/llm';

export async function runJsonCompletion(args: {
  ctx: any;
  systemPrompt: string;
  userContent: string;
  model: string;
  reasoningEffort?: string;
  temperature?: number;
  maxTokens?: number;
  maxCompletionTokens?: number;
  projectId?: string;
  conversationId?: string;
  runId?: string;
  traceMeta?: any;
}) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('Missing OPENAI_API_KEY');
  }

  const tokenLimitArgs: Record<string, number> = {}
  if (typeof args.maxCompletionTokens === 'number') {
    tokenLimitArgs.max_completion_tokens = args.maxCompletionTokens
  } else if (typeof args.maxTokens === 'number') {
    tokenLimitArgs.max_tokens = args.maxTokens
  }

  const response = await completionWithTracing(
    args.ctx,
    {
      model: args.model,
      reasoning_effort: args.reasoningEffort,
      temperature: args.temperature,
      ...tokenLimitArgs,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: args.systemPrompt },
        { role: 'user', content: args.userContent },
      ],
      traceMeta: args.traceMeta,
    },
    {
      projectId: args.projectId as any,
      conversationId: args.conversationId as any,
      runId: args.runId,
    }
  ) as any;

  const content = response?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('Empty response from LLM');
  }
  let parsed: any;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    console.error('Failed to parse LLM response as JSON:', content?.substring(0, 500));
    const parseError = new Error(`Invalid JSON from LLM: ${error instanceof Error ? error.message : String(error)}. Response preview: ${content?.substring(0, 200)}`) as Error & { rawContent?: string };
    parseError.rawContent = content;
    throw parseError;
  }
  return { parsed, raw: content };
}
