import { NextRequest } from 'next/server'
import OpenAI from 'openai'
import { ConvexHttpClient } from 'convex/browser'
import { api } from '../../../../../convex/_generated/api'
import type { Id } from '../../../../../convex/_generated/dataModel'
import { ensureSuggestionFooter, extractSuggestionFooter } from '../../../../lib/sdkFooter'

type StreamRequestBody = {
  projectId: Id<'projects'>
  conversationId: Id<'agentConversations'>
  runId: Id<'sdkRuns'>
  userMessage: string
}

function sseEvent(event: 'token' | 'done' | 'error', data: Record<string, unknown>) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}

function detectIntent(text: string) {
  const value = String(text ?? '').toLowerCase()
  const wantsPreview =
    value.includes('plan everything') ||
    value.includes('show all missing questions') ||
    value.includes('full project plan') ||
    value.includes('תכנית מלאה') ||
    value.includes('תוכנית מלאה') ||
    value.includes('כל השאלות החסרות')
  if (wantsPreview) return 'preview'

  const wantsClarify =
    value.includes('clarify') ||
    value.includes('ask me what you need') ||
    value.includes('שאל אותי מה צריך') ||
    value.includes('תשאל מה צריך') ||
    value.includes('הבהר') ||
    value.includes('הבהרות')
  if (wantsClarify) return 'clarify'

  const wantsDeep =
    value.includes('deep research') ||
    value.includes('deep dive') ||
    value.includes('strategy') ||
    value.includes('מחקר עמוק') ||
    value.includes('אסטרטגיה')
  if (wantsDeep) return 'deep'

  return 'free'
}

function toPromptHistory(messages: any[]) {
  return (Array.isArray(messages) ? messages : [])
    .filter((msg) => msg?.role === 'user' || msg?.role === 'assistant')
    .slice(-20)
    .map((msg) => ({
      role: msg.role === 'assistant' ? 'assistant' : 'user',
      content: String(msg?.text ?? '').trim(),
    }))
    .filter((msg) => msg.content.length > 0)
}

function questionBlocksFromResult(result: any) {
  const blocks: any[] = []
  const questionGroups = Array.isArray(result?.questionGroups) ? result.questionGroups : []
  const questions = questionGroups.length > 0
    ? questionGroups.flatMap((group: any) => (Array.isArray(group?.questions) ? group.questions : []))
    : Array.isArray(result?.questions) ? result.questions : []

  const normalizedQuestions = questions
    .map((question: any, index: number) => ({
      id: String(question?.questionKey ?? `q_${index + 1}`),
      topicKey: String(question?.questionKey ?? `q_${index + 1}`),
      textHe: String(question?.questionHe ?? question?.textHe ?? '').trim(),
      type: String(question?.questionType ?? 'text'),
      optionsHe: Array.isArray(question?.options)
        ? question.options.map((item: any) => String(item?.labelHe ?? item?.value ?? '').trim()).filter(Boolean)
        : [],
    }))
    .filter((question: any) => question.textHe)
    .slice(0, 8)

  if (normalizedQuestions.length > 0) {
    blocks.push({
      type: 'QuestionsBlock',
      questions: normalizedQuestions,
    })
  }

  return blocks
}

export async function POST(req: NextRequest) {
  if (!process.env.NEXT_PUBLIC_CONVEX_URL) {
    return new Response('Missing NEXT_PUBLIC_CONVEX_URL', { status: 500 })
  }
  if (!process.env.OPENAI_API_KEY) {
    return new Response('Missing OPENAI_API_KEY', { status: 500 })
  }

  const body = (await req.json()) as StreamRequestBody
  const userMessage = String(body?.userMessage ?? '').trim()
  if (!body?.projectId || !body?.conversationId || !body?.runId || !userMessage) {
    return new Response('Invalid payload', { status: 400 })
  }

  const encoder = new TextEncoder()
  const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL)
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

  const stream = new ReadableStream({
    async start(controller) {
      const write = (chunk: string) => controller.enqueue(encoder.encode(chunk))

      try {
        const runs = await convex.query(api.sdk.api.listRuns, {
          conversationId: body.conversationId,
        })
        const run = (runs ?? []).find((item: any) => item?._id === body.runId)
        if (!run || run.runMode !== 'CHAT_EDIT') {
          write(sseEvent('error', { message: 'Run is not in CHAT_EDIT mode' }))
          controller.close()
          return
        }

        const route = detectIntent(userMessage)
        const delegatedAgents: string[] = []
        let assistantText = ''
        let blocks: any[] = []
        let model = 'gpt-5.2'
        let mode = 'chat.free'

        if (route === 'preview' || route === 'clarify' || route === 'deep') {
          if (route === 'preview') {
            delegatedAgents.push('draft.plan_and_questions')
            mode = 'draft.plan_and_questions'
            const result = await convex.action(api.sdk.runner.runTool, {
              projectId: body.projectId,
              toolId: 'draft.plan_and_questions',
              runId: body.runId,
              conversationId: body.conversationId,
              input: { userMessage },
            })
            assistantText = String(result?.summaryHe ?? 'נוצרה תכנית ראשונית עם שאלות פתוחות.')
            blocks = questionBlocksFromResult(result)
            model = 'gpt-5.2'
          } else if (route === 'clarify') {
            delegatedAgents.push('clarify.next_questions')
            mode = 'clarify.next_questions'
            const result = await convex.action(api.sdk.runner.runTool, {
              projectId: body.projectId,
              toolId: 'clarify.next_questions',
              runId: body.runId,
              conversationId: body.conversationId,
              input: { userMessage, stageKey: 'planning' },
            })
            assistantText = String(result?.summaryHe ?? 'נדרשות הבהרות ממוקדות לפני ההמשך.')
            blocks = Array.isArray(result?.blocks) ? result.blocks : questionBlocksFromResult(result)
          } else {
            delegatedAgents.push('think.deep')
            mode = 'think.deep'
            model = 'gpt-5.2'
            const result = await convex.action(api.sdk.runner.runTool, {
              projectId: body.projectId,
              toolId: 'think.deep',
              runId: body.runId,
              conversationId: body.conversationId,
              input: { userMessage },
            })
            assistantText = String(result?.summaryHe ?? result?.text ?? '').trim()
            assistantText = ensureSuggestionFooter(assistantText || 'ביצעתי ניתוח עומק ראשוני.')
          }

          if (route !== 'deep') {
            assistantText = String(assistantText ?? '').trim()
          }
        } else {
          const history = await convex.query(api.sdk.api.listMessages, {
            conversationId: body.conversationId,
            runId: body.runId,
            limit: 40,
          })

          const modelMessages = [
            { role: 'system', content: 'You are chat.free. Output plain Hebrew-first text only. Do not output JSON or blocks. Do not ask clarification questions directly. If missing details, suggest running clarify.next_questions or draft.plan_and_questions. Make the response easy to scan: short paragraphs (1-3 sentences), numbered sections for methods/options, and bullet points for lists; add blank lines between sections. End with exactly one final next-step line in natural Hebrew: if multiple paths exist, provide exactly 2 numbered options (1,2); if only one path exists, provide exactly 1 numbered option. Phrase it so the user can reply with a number. The final line must stand alone with no extra sentences after it. Do not force a fixed opening phrase.' },
            ...toPromptHistory(history),
            { role: 'user', content: userMessage },
          ] as Array<{ role: 'system' | 'user' | 'assistant'; content: string }>

          const completion = await openai.chat.completions.create({
            model,
            messages: modelMessages,
            stream: true,
          })

          for await (const chunk of completion) {
            const delta = String(chunk.choices?.[0]?.delta?.content ?? '')
            if (!delta) continue
            assistantText += delta
            write(sseEvent('token', { delta }))
          }

          assistantText = ensureSuggestionFooter(assistantText.trim())
        }

        const footerLine = extractSuggestionFooter(assistantText)
        await convex.mutation(api.sdk.api.persistStreamedChatTurn, {
          projectId: body.projectId,
          conversationId: body.conversationId,
          runId: body.runId,
          userText: userMessage,
          assistantText,
          mode,
          model,
          delegatedAgents,
          footerLine: footerLine ?? undefined,
          blocks: blocks.length > 0 ? blocks : undefined,
        })

        write(sseEvent('done', {
          text: assistantText,
          mode,
          model,
          delegatedAgents,
          blocks,
        }))

        if (mode === 'chat.free' || mode === 'think.deep') {
          void convex.mutation(api.sdk.api.enqueueKnowledgeUpdateFromStream, {
            projectId: body.projectId,
            conversationId: body.conversationId,
            runId: body.runId,
            userText: userMessage,
            assistantText,
            mode,
          }).catch(() => {})
        }

        controller.close()
      } catch (error: any) {
        write(sseEvent('error', { message: String(error?.message ?? 'Streaming failed') }))
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  })
}
