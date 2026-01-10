import { mutation, query } from './_generated/server'
import { v } from 'convex/values'

function generateToken(len = 28) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let out = ''
  for (let i = 0; i < len; i += 1) {
    out += chars[Math.floor(Math.random() * chars.length)]
  }
  return out
}

export const create = mutation({
  args: {
    projectId: v.id('projects'),
    scope: v.union(
      v.literal('projectSummary'),
      v.literal('quote'),
      v.literal('gallery')
    ),
    quoteVersionId: v.optional(v.id('quoteVersions')),
    pdfFileId: v.optional(v.id('projectFiles')),
    expiresAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    for (let i = 0; i < 5; i += 1) {
      const token = generateToken()
      const exists = await ctx.db
        .query('shareLinks')
        .withIndex('by_token', (q) => q.eq('token', token))
        .first()
      if (exists) continue

      await ctx.db.insert('shareLinks', {
        token,
        ...args,
        createdBy: 'human',
        createdAt: Date.now(),
      })
      return { token }
    }
    throw new Error('Failed to generate unique share token')
  },
})

export const getByToken = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    return await ctx.db
      .query('shareLinks')
      .withIndex('by_token', (q) => q.eq('token', token))
      .first()
  },
})
