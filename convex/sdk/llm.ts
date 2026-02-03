"use node";

import { OpenAIAgent } from 'openai-agents';

export async function runJsonCompletion(args: {
  systemPrompt: string;
  userContent: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
}) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('Missing OPENAI_API_KEY');
  }
  const agent = new OpenAIAgent({
    model: args.model,
    temperature: args.temperature ?? 0.2,
    max_tokens: args.maxTokens,
    system_instruction: args.systemPrompt,
  });

  const response = await agent.chat.completions.create({
    model: args.model,
    temperature: args.temperature ?? 0.2,
    max_tokens: args.maxTokens,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: args.systemPrompt },
      { role: 'user', content: args.userContent },
    ],
  });

  const content = response.choices?.[0]?.message?.content;
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
