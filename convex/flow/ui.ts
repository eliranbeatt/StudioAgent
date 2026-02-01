import { query } from '../_generated/server'
import { v } from 'convex/values'

const GATE_TITLES: Record<string, string> = {
  G0: 'איסוף בריף',
  G0C: 'הבהרות',
  G1: 'אלמנטים',
  G2: 'משימות',
  G3: 'תקציב',
  G4: 'תמחור',
  G5: 'השלמות משימות',
  G6: 'לוגיסטיקה',
  G7: 'בדיקת תמחור',
  G8: 'הצעת מחיר',
  G9: 'אודיט',
  G10: 'קונטקסט',
}

const FLOW_GATES = ['G0', 'G0C', 'G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7', 'G8', 'G9', 'G10']

function sumNumbers(items: Array<number | undefined | null>) {
  return items.reduce((acc, val) => acc + (typeof val === 'number' && !Number.isNaN(val) ? val : 0), 0)
}

export const getElementsHealth = query({
  args: { projectId: v.id('projects') },
  handler: async (ctx, args) => {
    const [elements, tasks, materialLines, workLines] = await Promise.all([
      ctx.db.query('elements').withIndex('by_project', (q) => q.eq('projectId', args.projectId)).collect(),
      ctx.db.query('tasks').withIndex('by_project', (q) => q.eq('projectId', args.projectId)).collect(),
      ctx.db.query('materialLines').withIndex('by_project', (q) => q.eq('projectId', args.projectId)).collect(),
      ctx.db.query('workLines').withIndex('by_project', (q) => q.eq('projectId', args.projectId)).collect(),
    ])

    const tasksByElement = new Map<string, number>()
    for (const task of tasks) {
      if (!task.elementId) continue
      tasksByElement.set(task.elementId, (tasksByElement.get(task.elementId) ?? 0) + 1)
    }

    const materialsByElement = new Map<string, any[]>()
    for (const line of materialLines) {
      if (!line.elementId) continue
      const list = materialsByElement.get(line.elementId) ?? []
      list.push(line)
      materialsByElement.set(line.elementId, list)
    }

    const laborByElement = new Map<string, any[]>()
    for (const line of workLines) {
      if (!line.elementId) continue
      const list = laborByElement.get(line.elementId) ?? []
      list.push(line)
      laborByElement.set(line.elementId, list)
    }

    const summaries = elements.map((el) => {
      const mats = materialsByElement.get(el._id) ?? []
      const labs = laborByElement.get(el._id) ?? []
      const materialCost = sumNumbers(mats.map((l: any) => l.plannedTotalCost))
      const laborCost = sumNumbers(labs.map((l: any) => l.plannedTotalCost))
      const materialMissingCost = mats.some((l: any) => !l.plannedTotalCost || Number.isNaN(l.plannedTotalCost))
      const laborMissingCost = labs.some((l: any) => !l.plannedTotalCost || Number.isNaN(l.plannedTotalCost))

      const flags: Array<string> = []
      if ((tasksByElement.get(el._id) ?? 0) === 0) flags.push('missing_tasks')
      if (materialMissingCost && mats.length > 0) flags.push('missing_material_cost')
      if (laborMissingCost && labs.length > 0) flags.push('missing_labor_cost')

      return {
        elementId: el._id,
        nameHe: el.title ?? 'ללא שם',
        status: el.status ?? 'draft',
        tasksCount: tasksByElement.get(el._id) ?? 0,
        materialLinesCount: mats.length,
        materialCost,
        workLinesCount: labs.length,
        laborCost,
        flags,
      }
    })

    const totals = {
      tasksCount: sumNumbers(summaries.map((s) => s.tasksCount)),
      materialLinesCount: sumNumbers(summaries.map((s) => s.materialLinesCount)),
      workLinesCount: sumNumbers(summaries.map((s) => s.workLinesCount)),
      materialCost: sumNumbers(summaries.map((s) => s.materialCost)),
      laborCost: sumNumbers(summaries.map((s) => s.laborCost)),
    }

    return {
      totals,
      elements: summaries,
    }
  },
})

export const getWorkflowGps = query({
  args: { flowRunId: v.id('flowRuns') },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.flowRunId)
    if (!run) return { stages: [] }

    const steps = await ctx.db
      .query('flowSteps')
      .withIndex('by_run', (q) => q.eq('flowRunId', args.flowRunId))
      .collect()

    const nodeRuns = await ctx.db
      .query('flowNodeRuns')
      .withIndex('by_run', (q: any) => q.eq('runId', args.flowRunId))
      .collect()

    const completed = new Set<string>()
    for (const step of steps) {
      if (step.status === 'passed') completed.add(step.gateId)
    }
    for (const node of nodeRuns) {
      if (node.status === 'done') completed.add(node.nodeId)
    }

    const blockedGate =
      steps.find((s: any) => s.status === 'blocked')?.gateId ?? null

    const stages = FLOW_GATES.map((gate) => {
      const titleHe = GATE_TITLES[gate] ?? gate
      let state: 'done' | 'current' | 'pending' | 'blocked' | 'running' = 'pending'
      let badgeHe: string | undefined

      if (completed.has(gate)) {
        state = 'done'
      } else if (run.currentGateId === gate) {
        if (run.status === 'blocked' || blockedGate === gate) {
          state = 'blocked'
          badgeHe = 'ממתין להבהרות'
        } else if (run.status === 'awaiting_approval') {
          state = 'blocked'
          badgeHe = 'ממתין לאישור'
        } else if (run.status === 'paused') {
          state = 'blocked'
          badgeHe = 'מושהה'
        } else {
          state = 'running'
          badgeHe = 'רץ'
        }
      }

      return {
        key: gate,
        titleHe,
        state,
        updatedAt: run.updatedAt ?? run.createdAt ?? Date.now(),
        badgeHe,
      }
    })

    return { stages }
  },
})
