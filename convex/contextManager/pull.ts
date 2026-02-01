import { internalQuery } from '../_generated/server'
import { v } from 'convex/values'
import { buildProjectCorePacks } from './views/projectCore'
import { getRecipeForSkill } from './recipes'
import type { ContextPack, ContextPackEnvelope } from './types'

function bytesOf(text: string) {
  try {
    return new TextEncoder().encode(text).length
  } catch {
    return text.length
  }
}

export const ctxPull = internalQuery({
  args: {
    projectId: v.id('projects'),
    skillId: v.optional(v.string()),
    params: v.optional(v.any()),
    allowedTools: v.optional(
      v.object({
        webSearch: v.optional(v.boolean()),
        ragSearch: v.optional(v.boolean()),
        fileInspect: v.optional(v.boolean()),
        runSkill: v.optional(v.boolean()),
        agentData: v.optional(v.boolean()),
      })
    ),
  },
  handler: async (ctx, args): Promise<ContextPackEnvelope> => {
    const recipe = getRecipeForSkill({ skillId: args.skillId, allowedTools: args.allowedTools })
    const data = await buildProjectCorePacks(ctx, {
      projectId: args.projectId,
      params: args.params,
      packIds: recipe.packIds,
    })

    const packMap: Record<string, { title: string; payload: any }> = {
      v3RunMeta: { title: 'V3 Run Meta', payload: (data as any).v3RunMeta },
      project: { title: 'Project', payload: data.project },
      elements: { title: 'Elements', payload: data.elements },
      tasks: { title: 'Tasks', payload: data.tasks },
      qaPairs: { title: 'QA Pairs', payload: data.qaPairs },
      userInput: { title: 'User Input', payload: data.userInput },
      memories: { title: 'Memories', payload: data.memories },
      files: { title: 'Files', payload: data.files },
      accounting: { title: 'Accounting', payload: data.accounting },
      quote: { title: 'Quote', payload: data.quote },
      catalog: { title: 'Catalog', payload: data.catalog },
    }

    const packs: ContextPack[] = recipe.packIds
      .filter((id) => packMap[id])
      .filter((id) => packMap[id].payload !== null && packMap[id].payload !== undefined)
      .map((id) => {
        const pack = packMap[id]
        const content = JSON.stringify(pack.payload, null, 2)
        return {
          id,
          title: pack.title,
          content,
          bytes: bytesOf(content),
        }
      })

    const manifest = {
      view: recipe.view,
      version: recipe.version,
      toolBundleId: recipe.toolBundleId,
      skillId: args.skillId,
      params: args.params,
      packs: packs.map((p) => ({ id: p.id, title: p.title, bytes: p.bytes })),
    }

    const totalBytes = packs.reduce((sum, pack) => sum + pack.bytes, 0)

    return {
      view: recipe.view,
      version: recipe.version,
      pulledAt: Date.now(),
      manifest,
      packs,
      stats: {
        packCount: packs.length,
        totalBytes,
      },
    }
  },
})
