import type { GateIssue, GateResult, PlannedTask } from '../contracts'

function normalizeTitle(value: unknown) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

export function validateTasks(args: { artifact?: any }): GateResult {
  const issues: GateIssue[] = []
  const tasks: PlannedTask[] = Array.isArray(args.artifact?.tasks) ? args.artifact.tasks : []
  const dedup = new Set<string>()

  for (const task of tasks) {
    const title = normalizeTitle(task?.titleHe)
    const elementKey = String(task?.elementKey ?? '').trim()

    if (!title) {
      issues.push({
        code: 'tasks.missing_title',
        messageHe: 'נמצאה משימה ללא כותרת',
        severity: 'high',
      })
      continue
    }

    if (!elementKey) {
      issues.push({
        code: 'tasks.missing_element_link',
        messageHe: `משימה ללא קישור אלמנט: ${task?.titleHe ?? 'ללא כותרת'}`,
        severity: 'high',
      })
    }

    const dedupKey = `${elementKey}::${title}`
    if (dedup.has(dedupKey)) {
      issues.push({
        code: 'tasks.duplicate',
        messageHe: `משימה כפולה: ${task?.titleHe ?? title}`,
        severity: 'high',
      })
    }
    dedup.add(dedupKey)

    if (typeof task?.durationHours === 'number') {
      if (task.durationHours <= 0 || task.durationHours > 12) {
        issues.push({
          code: 'tasks.duration_out_of_range',
          messageHe: `משך לא תקין למשימה: ${task?.titleHe ?? title}`,
          severity: 'medium',
        })
      }
    }

    const checklistCount = Array.isArray((task as any)?.checklist)
      ? (task as any).checklist.filter((item: any) => String(item?.title ?? '').trim()).length
      : Array.isArray((task as any)?.checklistHe)
        ? (task as any).checklistHe.filter((item: any) => String(item ?? '').trim()).length
        : 0
    if (checklistCount === 0) {
      issues.push({
        code: 'tasks.missing_checklist',
        messageHe: `למשימה "${task?.titleHe ?? title}" חסרה רשימת בדיקה`,
        severity: 'high',
      })
    }

    const doneCriteria = String((task as any)?.doneCriteriaHe ?? '').trim()
    if (!doneCriteria) {
      issues.push({
        code: 'tasks.missing_done_criteria',
        messageHe: `למשימה "${task?.titleHe ?? title}" חסר קריטריון סיום`,
        severity: 'medium',
      })
    }
  }

  if (tasks.length === 0) {
    issues.push({
      code: 'tasks.empty',
      messageHe: 'אין משימות מאושרות בשלב פירוק המשימות',
      severity: 'high',
      question: {
        id: 'tasks_missing',
        textHe: 'להפיק עכשיו פירוק למשימות?',
        type: 'select',
        optionsHe: ['כן', 'לא'],
        allowDontKnow: false,
      },
    })
  }

  return {
    status: issues.length > 0 ? 'fail' : 'pass',
    issues,
    blockingQuestions: issues.map((issue) => issue.question).filter(Boolean) as any[],
  }
}

