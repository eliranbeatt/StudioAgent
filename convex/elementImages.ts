import { mutation, query } from './_generated/server'
import { v } from 'convex/values'

export const addElementImage = mutation({
  args: {
    projectId: v.id('projects'),
    elementId: v.id('elements'),
    fileId: v.id('projectFiles'),
    type: v.union(
      v.literal('engineering'),
      v.literal('illustration'),
      v.literal('reference')
    ),
    caption: v.optional(v.string()),
    createdFromChangeSetId: v.optional(v.id('changeSets')),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert('elementImages', {
      ...args,
      createdAt: Date.now(),
    })
  },
})

export const listByElement = query({
  args: { elementId: v.id('elements') },
  handler: async (ctx, { elementId }) => {
    return await ctx.db
      .query('elementImages')
      .withIndex('by_element', (q) => q.eq('elementId', elementId))
      .collect()
  },
})
