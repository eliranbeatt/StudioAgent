import { mutation } from './_generated/server'
import { v } from 'convex/values'

const receiptItemArgs = v.object({
  nameRaw: v.string(),
  qty: v.optional(v.number()),
  unit: v.optional(v.string()),
  unitPrice: v.optional(v.number()),
  total: v.optional(v.number()),
  vendorId: v.optional(v.id('vendors')),
  mappedMaterialLineId: v.optional(v.id('materialLines')),
  mappedWorkLineId: v.optional(v.id('workLines')),
  mappedTaskId: v.optional(v.id('tasks')),
  mappedElementId: v.optional(v.id('elements')),
})

export const createReceipt = mutation({
  args: {
    projectId: v.id('projects'),
    fileId: v.id('projectFiles'),
    vendorId: v.optional(v.id('vendors')),
    purchaseId: v.optional(v.id('purchases')),
    fileIds: v.optional(v.array(v.id('projectFiles'))),
  },
  handler: async (ctx, args) => {
    const now = Date.now()
    const receiptId = await ctx.db.insert('receipts', {
      projectId: args.projectId,
      purchaseId: args.purchaseId,
      fileId: args.fileId,
      fileIds: args.fileIds,
      vendorId: args.vendorId,
      status: 'uploaded',
      createdAt: now,
      updatedAt: now,
    })
    return receiptId
  },
})

export const upsertReceiptItems = mutation({
  args: {
    receiptId: v.id('receipts'),
    items: v.array(receiptItemArgs),
  },
  handler: async (ctx, { receiptId, items }) => {
    const existing = await ctx.db
      .query('receiptItems')
      .withIndex('by_receipt', (q) => q.eq('receiptId', receiptId))
      .collect()

    for (const item of existing) {
      await ctx.db.delete(item._id)
    }

    const now = Date.now()
    for (const item of items) {
      await ctx.db.insert('receiptItems', {
        receiptId,
        ...item,
        createdAt: now,
        updatedAt: now,
      })
    }

    await ctx.db.patch(receiptId, { updatedAt: now })
    return { ok: true, count: items.length }
  },
})

export const approveReceipt = mutation({
  args: { receiptId: v.id('receipts') },
  handler: async (ctx, { receiptId }) => {
    const receipt = await ctx.db.get(receiptId)
    if (!receipt) throw new Error('Receipt not found')

    const items = await ctx.db
      .query('receiptItems')
      .withIndex('by_receipt', (q) => q.eq('receiptId', receiptId))
      .collect()

    const materialMap = new Map<
      string,
      { total: number; qty: number; receiptItemIds: string[] }
    >()
    const workMap = new Map<
      string,
      { total: number; qty: number; receiptItemIds: string[] }
    >()

    for (const item of items) {
      const qty = item.qty ?? 0
      const total = item.total ?? (item.unitPrice ?? 0) * qty

      if (item.mappedMaterialLineId) {
        const key = item.mappedMaterialLineId
        const entry = materialMap.get(key) ?? {
          total: 0,
          qty: 0,
          receiptItemIds: [],
        }
        entry.total += total
        entry.qty += qty
        entry.receiptItemIds.push(item._id)
        materialMap.set(key, entry)
      }

      if (item.mappedWorkLineId) {
        const key = item.mappedWorkLineId
        const entry = workMap.get(key) ?? {
          total: 0,
          qty: 0,
          receiptItemIds: [],
        }
        entry.total += total
        entry.qty += qty
        entry.receiptItemIds.push(item._id)
        workMap.set(key, entry)
      }
    }

    for (const [lineId, entry] of materialMap) {
      const actualUnitCost = entry.qty > 0 ? entry.total / entry.qty : undefined
      await ctx.db.patch(lineId as any, {
        actualUnitCost,
        actualTotalCost: entry.total,
        receiptItemIds: entry.receiptItemIds,
      })
    }

    for (const [lineId, entry] of workMap) {
      await ctx.db.patch(lineId as any, {
        actualTotalCost: entry.total,
        receiptItemIds: entry.receiptItemIds,
      })
    }

    await ctx.db.patch(receiptId, {
      status: 'approved',
      updatedAt: Date.now(),
    })

    return {
      ok: true,
      materialLinesUpdated: materialMap.size,
      workLinesUpdated: workMap.size,
    }
  },
})
