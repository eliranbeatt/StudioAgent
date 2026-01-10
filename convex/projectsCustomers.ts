import { mutation } from './_generated/server'
import { v } from 'convex/values'
import { normalizeName, newBusinessId } from './lib/normalize'

export const setProjectCustomerByName = mutation({
  args: { projectId: v.id('projects'), customerName: v.string() },
  handler: async (ctx, { projectId, customerName }) => {
    const name = customerName.trim()
    if (!name) throw new Error('customerName is required')

    const normalized = normalizeName(name)

    let customer = await ctx.db
      .query('customers')
      .withIndex('by_nameNormalized', (q) => q.eq('nameNormalized', normalized))
      .first()

    if (!customer) {
      let businessId = ''
      for (let i = 0; i < 5; i += 1) {
        const candidate = newBusinessId('CUST')
        const clash = await ctx.db
          .query('customers')
          .withIndex('by_customerId', (q) => q.eq('customerId', candidate))
          .first()
        if (!clash) {
          businessId = candidate
          break
        }
      }
      if (!businessId) throw new Error('Failed to generate customerId')

      const customerId = await ctx.db.insert('customers', {
        customerId: businessId,
        name,
        nameNormalized: normalized,
        status: 'active',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
      customer = { _id: customerId } as typeof customer
    }

    await ctx.db.patch(projectId, {
      customerId: customer._id,
      customerName: name,
      clientName: name,
      updatedAt: Date.now(),
    })

    return customer._id
  },
})
