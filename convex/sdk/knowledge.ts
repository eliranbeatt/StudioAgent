"use node";

import { action } from '../_generated/server';
import { v } from 'convex/values';
import { api, internal } from '../_generated/api';
import { FULL_PROMPTS } from './prompts';
import { completionWithTracing } from '../lib/llm';

const MAX_FILE_TEXT_SNIPPET_CHARS = 3500
const MAX_TOTAL_FILE_TEXT_CHARS = 70000
const MAX_FILES_IN_PROMPT = 80
const MAX_FACTS_PER_FILE = 16
const MAX_ENTITIES_PER_FILE = 20

function clipText(value: unknown, maxChars: number) {
  const text = String(value ?? '').trim()
  if (!text) return ''
  return text.length <= maxChars ? text : `${text.slice(0, maxChars)}...`
}

function buildUploadedFilesGrounding(files: any[]) {
  if (!Array.isArray(files) || files.length === 0) {
    return {
      section: '--- UPLOADED FILES (grounding) ---\n(No uploaded files)',
      fileCount: 0,
      filesWithExtractedText: 0,
      filesWithStructuredInfo: 0,
      usedTextChars: 0,
    }
  }

  let usedTextChars = 0
  let filesWithExtractedText = 0
  let filesWithStructuredInfo = 0

  const lines: string[] = ['--- UPLOADED FILES (grounding) ---']
  const selected = files.slice(0, MAX_FILES_IN_PROMPT)
  for (const file of selected) {
    const fileName = String(file?.fileName ?? '').trim() || 'unknown_file'
    const summary = String(file?.summary ?? '').trim()
    const topics = Array.isArray(file?.topics)
      ? file.topics.slice(0, 12).map((item: any) => String(item ?? '').trim()).filter(Boolean)
      : []
    const facts = Array.isArray(file?.facts)
      ? file.facts.slice(0, MAX_FACTS_PER_FILE).map((item: any) => String(item ?? '').trim()).filter(Boolean)
      : []
    const entities = Array.isArray(file?.entities)
      ? file.entities
          .slice(0, MAX_ENTITIES_PER_FILE)
          .map((item: any) => String(item?.name ?? item ?? '').trim())
          .filter(Boolean)
      : []
    const extractedTextRaw = String(file?.extractedText ?? '').trim()

    if (summary || topics.length > 0 || facts.length > 0 || entities.length > 0) {
      filesWithStructuredInfo += 1
    }
    if (extractedTextRaw) {
      filesWithExtractedText += 1
    }

    lines.push(`FILE: ${fileName}`)
    if (summary) lines.push(`Summary: ${summary}`)
    if (topics.length > 0) lines.push(`Topics: ${topics.join(', ')}`)
    if (facts.length > 0) lines.push(`Facts: ${facts.join(' | ')}`)
    if (entities.length > 0) lines.push(`Entities: ${entities.join(', ')}`)

    if (extractedTextRaw && usedTextChars < MAX_TOTAL_FILE_TEXT_CHARS) {
      const remaining = MAX_TOTAL_FILE_TEXT_CHARS - usedTextChars
      const snippet = clipText(
        extractedTextRaw,
        Math.max(500, Math.min(MAX_FILE_TEXT_SNIPPET_CHARS, remaining))
      )
      if (snippet) {
        lines.push(`Text snippet:\n${snippet}`)
        usedTextChars += snippet.length
      }
    }
    lines.push('')
  }

  if (files.length > selected.length) {
    lines.push(`(Additional files omitted from prompt: ${files.length - selected.length})`)
  }

  return {
    section: lines.join('\n').trim(),
    fileCount: files.length,
    filesWithExtractedText,
    filesWithStructuredInfo,
    usedTextChars,
  }
}

/**
 * Single source of truth knowledge updater.
 * Produces a Hebrew markdown document stored as memoryDocs(kind='PROJECT_CONTEXT').
 * All other knowledge/memory update paths are disabled. This is the only writer.
 */
export const summarizeOrUpdate = action({
  args: {
    projectId: v.id('projects'),
    currentDoc: v.optional(v.any()),
    newFacts: v.array(v.string()),
    userText: v.optional(v.string()),
    runId: v.optional(v.id('sdkRuns')),
    conversationId: v.optional(v.id('agentConversations')),
  },
  handler: async (ctx, args) => {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('Missing OPENAI_API_KEY')
    }

    const existingDoc = await ctx.runQuery(api.memory.getProjectContextDoc, {
      projectId: args.projectId,
    })
    const currentMarkdown = existingDoc?.contentMd_he ?? ''

    const projectCtx = await ctx.runQuery(api.sdk.api.contextGet, {
      projectId: args.projectId,
      packs: ['project', 'elements', 'tasks', 'qa'],
    })
    const uploadedFiles = await ctx.runQuery(api.files.listProjectFiles, {
      projectId: args.projectId,
    })

    const filesGrounding = buildUploadedFilesGrounding(Array.isArray(uploadedFiles) ? uploadedFiles : [])

    const userPayload = [
      '--- CURRENT KNOWLEDGE DOCUMENT ---',
      currentMarkdown || '(No existing document)',
      '',
      '--- NEW FACTS ---',
      ...(args.newFacts.length > 0 ? args.newFacts : ['(No new facts)']),
      '',
      args.userText ? `--- USER TEXT ---\n${args.userText}` : '',
      '',
      '--- PROJECT SNAPSHOT (grounding) ---',
      `Project: ${projectCtx?.project?.name ?? ''}`,
      `Elements: ${Array.isArray(projectCtx?.elements) ? projectCtx.elements.length : 0}`,
      `Tasks: ${Array.isArray(projectCtx?.tasks) ? projectCtx.tasks.length : 0}`,
      Array.isArray(projectCtx?.elements) && projectCtx.elements.length > 0
        ? `Element titles: ${projectCtx.elements.map((e: any) => e.title).join(', ')}`
        : '',
      Array.isArray(projectCtx?.recentQA) && projectCtx.recentQA.length > 0
        ? `Recent QA:\n${projectCtx.recentQA
            .slice(0, 10)
            .map((qa: any) => `Q: ${qa.questionHe ?? qa.questionText}\nA: ${qa.answerHe ?? qa.answerText}`)
            .join('\n')}`
        : '',
      '',
      filesGrounding.section,
    ].filter(Boolean).join('\n')

    const response = await completionWithTracing(
      ctx,
      {
        model: 'gpt-5-mini',
        messages: [
          { role: 'system', content: FULL_PROMPTS.KNOWLEDGE_UPDATE_SYSTEM },
          { role: 'user', content: userPayload },
        ],
        traceMeta: {
          source: 'sdk',
          toolId: 'knowledge.summarize_or_update',
        },
      },
      {
        projectId: args.projectId as any,
        conversationId: args.conversationId as any,
        runId: args.runId,
      }
    ) as any

    const content = response?.choices?.[0]?.message?.content ?? ''
    if (!content.trim()) {
      throw new Error('Empty response from LLM for knowledge update')
    }

    await ctx.runMutation(internal.sdk.knowledgeMutations.saveKnowledgeDoc, {
      projectId: args.projectId,
      doc: content.trim(),
    })

    return {
      doc: content.trim(),
      meta: {
        didUpdate: true,
        fileGrounding: {
          fileCount: filesGrounding.fileCount,
          filesWithExtractedText: filesGrounding.filesWithExtractedText,
          filesWithStructuredInfo: filesGrounding.filesWithStructuredInfo,
          usedTextChars: filesGrounding.usedTextChars,
        },
      },
    }
  },
});
