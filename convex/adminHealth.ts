import { query } from './_generated/server'

export const health = query({
  args: {},
  handler: async (ctx) => {
    const customers = await ctx.db.query('customers').take(10000)
    const ids = new Set<string>()
    const dupCustomerIds: string[] = []

    for (const customer of customers) {
      if (ids.has(customer.customerId)) dupCustomerIds.push(customer.customerId)
      ids.add(customer.customerId)
    }

    const projects = await ctx.db.query('projects').take(10000)
    const projectsWithCustomer = projects.filter((project) => project.customerId)
      .length

    const tasks = await ctx.db.query('tasks').take(10000)
    const tasksWithAssigneeText = tasks.filter((task) => task.assignee).length
    const tasksWithAssigneeIds = tasks.filter(
      (task) => Array.isArray(task.assigneeIds) && task.assigneeIds.length > 0
    ).length

    return {
      customersCount: customers.length,
      dupCustomerIds,
      projectsCount: projects.length,
      projectsWithCustomer,
      tasksCount: tasks.length,
      tasksWithAssigneeText,
      tasksWithAssigneeIds,
    }
  },
})
