"use node";

import { completionWithTracing } from '../lib/llm';

export async function runJsonCompletion(args: {
  ctx: any;
  systemPrompt: string;
  userContent: string;
  model: string;
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

  const response = await completionWithTracing(
    args.ctx,
    {
      model: args.model,
      temperature: args.temperature,
      max_tokens: args.maxTokens,
      max_completion_tokens: args.maxCompletionTokens,
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
    throw new Error('Invalid JSON from LLM');
  }
  return { parsed, raw: content };
}
