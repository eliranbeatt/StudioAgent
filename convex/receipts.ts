import { mutation, query } from './_generated/server'
import { v } from 'convex/values'
import { Id } from './_generated/dataModel'

const receiptItemArgs = v.object({
  nameRaw: v.string(),
  qty: v.optional(v.number()),
  unit: v.optional(v.string()),
  unitPrice: v.optional(v.number()),
  total: v.optional(v.number()),
  vendorId: v.optional(v.id('vendors')),
  mappedAccountingLineId: v.optional(v.id('accountingLines')),
  mappedMaterialLineId: v.optional(v.id('materialLines')),
  mappedDraftMaterialId: v.optional(v.string()),
  mappedWorkLineId: v.optional(v.id('workLines')),
  mappedDraftWorkId: v.optional(v.string()),
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
      { total: number; qty: number; receiptItemIds: Id<"receiptItems">[] }
    >()
    const workMap = new Map<
      string,
      { total: number; qty: number; receiptItemIds: Id<"receiptItems">[] }
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

    const accountingMap = new Map<
      string,
      { total: number; receiptItemIds: Id<"receiptItems">[] }
    >()
    for (const item of items) {
      if (!item.mappedAccountingLineId) continue
      const key = item.mappedAccountingLineId
      const total = item.total ?? (item.unitPrice ?? 0) * (item.qty ?? 0)
      const entry = accountingMap.get(key) ?? { total: 0, receiptItemIds: [] }
      entry.total += total
      entry.receiptItemIds.push(item._id)
      accountingMap.set(key, entry)
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

    for (const [lineId, entry] of accountingMap) {
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
      accountingLinesUpdated: accountingMap.size,
    }
  },
})

export const listByProject = query({
  args: { projectId: v.id('projects') },
  handler: async (ctx, { projectId }) => {
    const receipts = await ctx.db
      .query('receipts')
      .withIndex('by_project', (q) => q.eq('projectId', projectId))
      .collect()

    const vendorIds = new Set<string>()
    const fileIds = new Set<string>()
    receipts.forEach((receipt) => {
      if (receipt.vendorId) vendorIds.add(receipt.vendorId)
      if (receipt.fileId) fileIds.add(receipt.fileId)
    })

    const vendors = await Promise.all(
      Array.from(vendorIds).map((id) => ctx.db.get(id as any))
    )
    const files = await Promise.all(
      Array.from(fileIds).map((id) => ctx.db.get(id as any))
    )

    const vendorById = new Map(vendors.filter(Boolean).map((vendor) => [vendor!._id, vendor]))
    const fileById = new Map(files.filter(Boolean).map((file) => [file!._id, file]))

    return receipts.map((receipt) => ({
      receipt,
      vendor: receipt.vendorId ? vendorById.get(receipt.vendorId) ?? null : null,
      file: receipt.fileId ? fileById.get(receipt.fileId) ?? null : null,
    }))
  },
})

export const listItems = query({
  args: { receiptId: v.id('receipts') },
  handler: async (ctx, { receiptId }) => {
    return await ctx.db
      .query('receiptItems')
      .withIndex('by_receipt', (q) => q.eq('receiptId', receiptId))
      .collect()
  },
})

export const getReceiptWithFile = query({
  args: { receiptId: v.id('receipts') },
  handler: async (ctx, { receiptId }) => {
    const receipt = await ctx.db.get(receiptId)
    if (!receipt) return null
    const file = await ctx.db.get(receipt.fileId)
    return {
      receipt,
      file,
    }
  },
})

export const updateReceipt = mutation({
  args: {
    receiptId: v.id('receipts'),
    vendorId: v.optional(v.id('vendors')),
    status: v.optional(
      v.union(
        v.literal('uploaded'),
        v.literal('extracted'),
        v.literal('reviewed'),
        v.literal('approved')
      )
    ),
    date: v.optional(v.number()),
    total: v.optional(v.number()),
    currency: v.optional(v.string()),
    fileId: v.optional(v.id('projectFiles')),
    fileIds: v.optional(v.array(v.id('projectFiles'))),
    extraction: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const { receiptId, ...patch } = args
    await ctx.db.patch(receiptId, {
      ...patch,
      updatedAt: Date.now(),
    })
    return { ok: true }
  },
})

export const listLineOptions = query({
  args: { projectId: v.id('projects') },
  handler: async (ctx, { projectId }) => {
    const [materials, labor, accountingLines, elements] = await Promise.all([
      ctx.db
        .query('materialLines')
        .withIndex('by_project', (q) => q.eq('projectId', projectId))
        .collect(),
      ctx.db
        .query('workLines')
        .withIndex('by_project', (q) => q.eq('projectId', projectId))
        .collect(),
      ctx.db
        .query('accountingLines')
        .withIndex('by_project', (q) => q.eq('projectId', projectId))
        .collect(),
      ctx.db
        .query('elements')
        .withIndex('by_project', (q) => q.eq('projectId', projectId))
        .collect(),
    ])

    const elementById = new Map(elements.map((element) => [element._id, element]))

    const materialOptions = materials.map((line) => {
      const element = line.elementId ? elementById.get(line.elementId) : null
      const label = [
        line.itemName ?? 'Material',
        element?.title ?? null,
      ]
        .filter(Boolean)
        .join(' • ')
      return { id: line._id, label }
    })

    const workOptions = labor.map((line) => {
      const element = line.elementId ? elementById.get(line.elementId) : null
      const label = [
        line.roleHe ?? 'Labor',
        element?.title ?? null,
      ]
        .filter(Boolean)
        .join(' • ')
      return { id: line._id, label }
    })

    const accountingOptions = accountingLines.map((line) => {
      const element = line.elementId ? elementById.get(line.elementId) : null
      const label = [
        line.title ?? 'Accounting',
        line.type ?? null,
        element?.title ?? null,
      ]
        .filter(Boolean)
        .join(' • ')
      return { id: line._id, label }
    })

    return {
      accounting: accountingOptions,
      materials: materialOptions,
      labor: workOptions,
    }
  },
})
