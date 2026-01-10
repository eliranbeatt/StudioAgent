import { mutation } from './_generated/server'
import { v } from 'convex/values'

export const attachPrintFile = mutation({
  args: {
    printPartId: v.id('printParts'),
    fileId: v.id('projectFiles'),
    kind: v.union(
      v.literal('source'),
      v.literal('printReady'),
      v.literal('mockup')
    ),
    originalFilename: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const printPart = await ctx.db.get(args.printPartId)
    if (!printPart) throw new Error('Print part not found')

    return await ctx.db.insert('printFiles', {
      printPartId: args.printPartId,
      projectId: printPart.projectId,
      fileId: args.fileId,
      kind: args.kind,
      originalFilename: args.originalFilename,
      uploadedAt: Date.now(),
    })
  },
})

export const writePrintFileAnalysis = mutation({
  args: {
    printFileId: v.id('printFiles'),
    widthPx: v.optional(v.number()),
    heightPx: v.optional(v.number()),
    dpiX: v.optional(v.number()),
    dpiY: v.optional(v.number()),
    pageCount: v.optional(v.number()),
    pageWidthMm: v.optional(v.number()),
    pageHeightMm: v.optional(v.number()),
    warnings: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert('printFileAnalyses', {
      ...args,
      createdAt: Date.now(),
    })
  },
})
