import { mutation, query } from './_generated/server'
import { v } from 'convex/values'
import { normalizeName, newBusinessId } from './lib/normalize'

export const findOrCreateByName = mutation({
  args: { name: v.string() },
  handler: async (ctx, { name }) => {
    const trimmed = name.trim()
    if (!trimmed) throw new Error('Customer name is required')
    const normalized = normalizeName(trimmed)

    const existing = await ctx.db
      .query('customers')
      .withIndex('by_nameNormalized', (q) => q.eq('nameNormalized', normalized))
      .first()

    if (existing) return existing._id

    for (let i = 0; i < 5; i += 1) {
      const customerId = newBusinessId('CUST')
      const clash = await ctx.db
        .query('customers')
        .withIndex('by_customerId', (q) => q.eq('customerId', customerId))
        .first()
      if (clash) continue

      return await ctx.db.insert('customers', {
        customerId,
        name: trimmed,
        nameNormalized: normalized,
        status: 'active',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    }

    throw new Error('Failed to generate unique customerId')
  },
})

export const listActive = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query('customers')
      .withIndex('by_status', (q) => q.eq('status', 'active'))
      .collect()
  },
})

export const listWithContacts = query({
  args: {
    status: v.optional(v.union(v.literal('active'), v.literal('archived'))),
  },
  handler: async (ctx, { status }) => {
    const customers = status
      ? await ctx.db
          .query('customers')
          .withIndex('by_status', (q) => q.eq('status', status))
          .collect()
      : await ctx.db.query('customers').collect()

    const contacts = await ctx.db.query('customerContacts').collect()
    const contactsByCustomer = new Map<string, typeof contacts>()
    for (const contact of contacts) {
      const list = contactsByCustomer.get(contact.customerId) ?? []
      list.push(contact)
      contactsByCustomer.set(contact.customerId, list)
    }

    return customers.map((customer) => ({
      customer,
      contacts: contactsByCustomer.get(customer._id) ?? [],
    }))
  },
})

export const addContact = mutation({
  args: {
    customerId: v.id('customers'),
    name: v.string(),
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
    role: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert('customerContacts', {
      ...args,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
  },
})
