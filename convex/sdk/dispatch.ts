"use node";

import { action } from '../_generated/server';
import { v } from 'convex/values';
import { OpenAIAgent } from 'openai-agents';
import { randomUUID } from 'crypto';
import { api, internal } from '../_generated/api';
import { REGISTRY } from './registry';
import { runToolInternal } from './runner';
import { assertAsciiKeys } from './schemas';
import { searchWeb } from '../lib/webSearch';

const MAX_TOOL_LOOPS = 6;

type ToolHandler = (args: any) => Promise<any>;

function buildToolDefinitions(allowedTools: string[]) {
  return allowedTools.map((name) => {
    if (name === 'context.get') {
      return {
        type: 'function',
        function: {
          name,
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
          name,
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
          name,
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
          name,
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
          name,
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
          name,
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
        name,
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

export const runNext = action({
  args: {
    projectId: v.id('projects'),
    conversationId: v.id('agentConversations'),
    runId: v.id('sdkRuns'),
    userMessage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run) throw new Error('Run not found');

    if (run.status === 'paused' || run.status === 'cancelled' || run.status === 'completed') {
      return { status: run.status };
    }

    if (args.userMessage) {
      await ctx.runMutation(internal.sdk.telemetry.appendMessage, {
        conversationId: args.conversationId,
        role: 'user',
        text: args.userMessage,
        runId: args.runId,
      });
    }

    if (run.status === 'awaiting_approval') {
      return { status: 'awaiting_approval', pendingChangeSetId: run.pendingChangeSetId };
    }

    const orchestrator = REGISTRY.orchestrator;
    if (!orchestrator) throw new Error('Agent orchestrator not found in registry');

    await ctx.runMutation(internal.sdk.telemetry.updateRunState, {
      runId: args.runId,
      status: 'running',
      currentAgentName: 'orchestrator',
    });

    const history = await ctx.runQuery(api['sdk/api'].listMessages, {
      conversationId: args.conversationId,
      limit: 50,
    });

    const messages: any[] = [
      { role: 'system', content: orchestrator.systemPrompt },
      ...history.map((m: any) => ({
        role: m.role,
        content: m.text ?? (m.blocks ? JSON.stringify(m.blocks) : ''),
      })),
    ];

    const toolHandlers: Record<string, ToolHandler> = {
      'context.get': async (input: any) =>
        ctx.runQuery(api['sdk/context'].get, {
          projectId: args.projectId,
          packs: input?.packs ?? ['project', 'knowledge'],
          filters: input?.filters,
        }),
      'knowledge.summarize_or_update': async (input: any) =>
        ctx.runAction(api['sdk/knowledge'].summarizeOrUpdate, {
          projectId: args.projectId,
          currentDoc: input?.currentDoc,
          newFacts: input?.newFacts ?? [],
          userText: input?.userText,
        }),
      'changeset.compile': async (input: any) =>
        ctx.runAction(api['sdk/changeset'].compile, {
          projectId: args.projectId,
          intents: input?.intents ?? [],
          context: input?.context,
        }).then(async (result: any) => {
          if (result?.changeSetId && !run.shadowMode) {
            const approvalToken = randomUUID();
            await ctx.runMutation(internal.sdk.telemetry.updateRunState, {
              runId: args.runId,
              status: 'awaiting_approval',
              pendingChangeSetId: result.changeSetId,
              approvalToken,
            });
            await ctx.runMutation(internal.sdk.telemetry.appendMessage, {
              conversationId: args.conversationId,
              role: 'assistant',
              text: 'יש שינויים מוצעים לאישור.',
              blocks: [
                {
                  type: 'ChangeSetBlock',
                  titleHe: 'שינויים מוצעים',
                  summaryHe: 'נדרש אישור לפני ביצוע.',
                  changeSetId: result.changeSetId,
                },
              ],
              runId: args.runId,
            });
          }
          return result;
        }),
      'changeset.review': async (input: any) =>
        ctx.runAction(api['sdk/changeset'].review, {
          projectId: args.projectId,
          changeSetId: input?.changeSetId,
          changeSet: input?.changeSet,
        }),
      'changeset.apply': async (input: any) =>
        ctx.runAction(api['sdk/changeset'].apply, {
          runId: args.runId,
          approvalToken: input?.approvalToken ?? '',
        }),
      web_search: async (input: any) => {
        const q = String(input?.query ?? '');
        if (!q) {
          return { error: 'Missing query' };
        }
        const result = await searchWeb(q);
        return result;
      },
    };

    for (const toolId of Object.keys(REGISTRY)) {
      if (!toolHandlers[toolId]) {
        toolHandlers[toolId] = async (input: any) =>
          runToolInternal({
            ctx,
            projectId: args.projectId,
            toolId,
            input: input?.input ?? input ?? {},
            runId: args.runId,
            conversationId: args.conversationId,
          });
      }
    }

    const tools = buildToolDefinitions(orchestrator.allowedTools ?? []);

    let finalContent: string | null = null;
    const agent = new OpenAIAgent({
      model: orchestrator.model,
      temperature: orchestrator.temperature,
      max_tokens: orchestrator.maxTokens,
      system_instruction: orchestrator.systemPrompt,
    });

    for (let i = 0; i < MAX_TOOL_LOOPS; i++) {
      const response = await agent.chat.completions.create({
        model: orchestrator.model,
        temperature: orchestrator.temperature,
        max_tokens: orchestrator.maxTokens,
        messages,
        tools,
        tool_choice: 'auto',
      });
      const message = response.choices?.[0]?.message;
      if (!message) throw new Error('Empty LLM response');

      if (message.tool_calls && message.tool_calls.length > 0) {
        messages.push({
          role: 'assistant',
          content: message.content ?? '',
          tool_calls: message.tool_calls,
        });

        for (const call of message.tool_calls) {
          const toolName = call.function.name;
          let toolArgs: any = {};
          try {
            toolArgs = call.function.arguments ? JSON.parse(call.function.arguments) : {};
          } catch (err) {
            toolArgs = {};
          }

          await ctx.runMutation(internal.sdk.telemetry.logEvent, {
            runId: args.runId,
            type: 'tool_call',
            payload: { toolName, toolArgs },
          });

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
            content: JSON.stringify(result),
          });
        }

        continue;
      }

      finalContent = message.content ?? '';
      break;
    }

    if (!finalContent) {
      finalContent = 'לא התקבלה תשובה. נסה שוב.';
    }

    let parsed: any;
    try {
      parsed = JSON.parse(finalContent);
      assertAsciiKeys(parsed);
    } catch (error) {
      parsed = { blocks: [{ type: 'ChatBlock', contentHe: finalContent }] };
    }

    const summaryHe = parsed.summaryHe ?? parsed.contentHe ?? 'תשובה מהסוכן';
    const blocks = parsed.blocks ?? [];

    await ctx.runMutation(internal.sdk.telemetry.appendMessage, {
      conversationId: args.conversationId,
      role: 'assistant',
      text: summaryHe,
      blocks,
      runId: args.runId,
    });

    await ctx.runMutation(internal.sdk.telemetry.logEvent, {
      runId: args.runId,
      type: 'block_emit',
      payload: { blocks },
    });

    const nextStage = parsed?.meta?.nextStageKey ?? parsed?.meta?.stageKey ?? parsed?.meta?.stageKeyHint;
    if (nextStage) {
      await ctx.runMutation(internal.sdk.telemetry.updateRunState, {
        runId: args.runId,
        stageKey: nextStage,
      });
    }

    return {
      status: 'success',
      output: parsed,
    };
  },
});
