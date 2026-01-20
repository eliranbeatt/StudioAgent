import { mutation, query } from './_generated/server'
import { v } from 'convex/values'
import { DEFAULT_FLAGS, isEnabled, normalizeFlags } from './featureFlags'
import { extractBrainDumpStructuredDraft } from './flow/brainDumpExtractor'
import { internal } from './_generated/api'

const SETTINGS_KEY = 'featureFlags'

async function assertBackendEnabled(ctx: any) {
  const existing = await ctx.db
    .query('appSettings')
    .withIndex('by_key', (q: any) => q.eq('key', SETTINGS_KEY))
    .first()

  const flags = { ...DEFAULT_FLAGS, ...normalizeFlags(existing?.value) }
  if (!isEnabled(flags, 'ff_flow_agent_backend', false)) {
    throw new Error('Flow Agent is disabled (ff_flow_agent_backend)')
  }
}

export const getProjectBrainDump = query({
  args: {
    projectId: v.id('projects'),
  },
  handler: async (ctx, args) => {
    await assertBackendEnabled(ctx)
    const project = await ctx.db.get(args.projectId)
    if (!project) return null
    return {
      brainDumpRaw: project.brainDumpRaw ?? null,
      brainDumpStructuredDraft: project.brainDumpStructuredDraft ?? null,
      updatedAt: project.updatedAt,
    }
  },
})

export const appendProjectBrainDump = mutation({
  args: {
    projectId: v.id('projects'),
    text: v.string(),
  },
  handler: async (ctx, args) => {
    await assertBackendEnabled(ctx)

    const project = await ctx.db.get(args.projectId)
    if (!project) throw new Error('Project not found')

    const nextChunk = args.text.trim()
    if (!nextChunk) return

    const current = (project.brainDumpRaw ?? '').trim()
    const next = current ? `${current}\n\n${nextChunk}` : nextChunk

    await ctx.db.patch(args.projectId, {
      brainDumpRaw: next,
      brainDumpStructuredDraft: extractBrainDumpStructuredDraft(next),
      updatedAt: Date.now(),
    })

    await ctx.scheduler.runAfter(0, internal.memory.appendUserInput, {
      projectId: args.projectId,
      text: `Brain dump (append)\n\n${nextChunk}`,
    })
  },
})

export const setProjectBrainDumpRaw = mutation({
  args: {
    projectId: v.id('projects'),
    text: v.string(),
  },
  handler: async (ctx, args) => {
    await assertBackendEnabled(ctx)

    const project = await ctx.db.get(args.projectId)
    if (!project) throw new Error('Project not found')

    const trimmed = String(args.text ?? '').trim()
    const snippet = trimmed.length > 4000 ? `${trimmed.slice(0, 4000)}\n\n[...truncated...]` : trimmed

    await ctx.db.patch(args.projectId, {
      brainDumpRaw: args.text,
      brainDumpStructuredDraft: extractBrainDumpStructuredDraft(args.text),
      updatedAt: Date.now(),
    })

    if (snippet) {
      await ctx.scheduler.runAfter(0, internal.memory.appendUserInput, {
        projectId: args.projectId,
        text: `Brain dump (replace)\n\n${snippet}`,
      })
    }
  },
})
