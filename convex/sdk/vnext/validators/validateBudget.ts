import { GateIssue, GateResult } from '../contracts'

export function validateBudget(args: { tasksArtifact?: any; budgetArtifact?: any }): GateResult {
  const issues: GateIssue[] = []
  const tasks = Array.isArray(args.tasksArtifact?.tasks) ? args.tasksArtifact.tasks : []
  const materialLines = Array.isArray(args.budgetArtifact?.materialLines)
    ? args.budgetArtifact.materialLines
    : Array.isArray(args.budgetArtifact?.budgetSkeleton?.materialLines)
      ? args.budgetArtifact.budgetSkeleton.materialLines
      : []
  const workLines = Array.isArray(args.budgetArtifact?.workLines)
    ? args.budgetArtifact.workLines
    : Array.isArray(args.budgetArtifact?.budgetSkeleton?.workLines)
      ? args.budgetArtifact.budgetSkeleton.workLines
      : []

  const coveredTasks = new Set<string>()
  for (const line of [...materialLines, ...workLines]) {
    const taskRef = String(line?.taskKey ?? line?.taskId ?? line?.taskTempOrId ?? '').trim()
    if (taskRef) coveredTasks.add(taskRef)
  }

  if (tasks.length > 0 && materialLines.length + workLines.length === 0) {
    issues.push({
      code: 'budget.empty_lines',
      messageHe: 'אין כלל שורות תקציב למרות שקיימות משימות',
      severity: 'high',
      question: {
        id: 'budget_generate',
        textHe: 'לא נוצרו שורות תקציב. להפיק תקציב מחדש?',
        type: 'select',
        optionsHe: ['כן', 'לא'],
      },
    })
  }

  for (const task of tasks) {
    const taskKey = String(task?.taskKey ?? task?.titleHe ?? '').trim()
    if (!taskKey) continue
    if (!coveredTasks.has(taskKey)) {
      issues.push({
        code: 'budget.task_unbound',
        messageHe: `למשימה "${task.titleHe ?? taskKey}" אין קישור תקציבי`,
        severity: 'medium',
      })
    }
  }

  return {
    status: issues.length > 0 ? 'fail' : 'pass',
    issues,
    blockingQuestions: issues.map((issue) => issue.question).filter(Boolean) as any[],
  }
}
