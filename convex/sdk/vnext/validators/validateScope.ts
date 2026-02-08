import { GateIssue, GateResult, TargetPlanSpec } from '../contracts'

export function validateScope(args: { spec: TargetPlanSpec; artifact?: any }): GateResult {
  const issues: GateIssue[] = []
  const elements = args.artifact?.proposedElements ?? args.spec.scope.elements ?? []
  const dedup = new Set<string>()

  if (!args.spec.scope.locked) {
    issues.push({
      code: 'scope.not_locked',
      messageHe: 'רשימת האלמנטים לא נעולה',
      severity: 'high',
      question: {
        id: 'scope_lock',
        textHe: 'לאשר נעילת רשימת האלמנטים?',
        type: 'select',
        optionsHe: ['כן', 'לא'],
        allowDontKnow: false,
      },
    })
  }

  for (const element of elements) {
    const key = String(element?.elementKey ?? '').trim()
    if (!key) {
      issues.push({
        code: 'scope.missing_element_key',
        messageHe: 'נמצא אלמנט בלי מפתח יציב',
        severity: 'high',
      })
      continue
    }
    if (dedup.has(key)) {
      issues.push({
        code: 'scope.duplicate_element_key',
        messageHe: `מפתח אלמנט כפול: ${key}`,
        severity: 'high',
      })
    }
    dedup.add(key)
  }

  const required = args.spec.constraints.requiredElementCount
  if (required !== undefined && elements.length !== required) {
    // Generate suggestedAnswers from existing element names
    const elementSuggestions = elements.slice(0, 6).map((el: any) => ({
      value: String(el?.elementKey ?? el?.nameHe ?? ''),
      labelHe: String(el?.nameHe ?? el?.elementKey ?? ''),
    }))
    issues.push({
      code: 'scope.required_count_mismatch',
      messageHe: `נדרשים בדיוק ${required} אלמנטים, כרגע יש ${elements.length}`,
      severity: 'high',
      question: {
        id: 'scope_count',
        textHe: `נדרשים בדיוק ${required} אלמנטים. לעדכן את הרשימה?`,
        type: 'select',
        optionsHe: ['כן', 'לא'],
        suggestedAnswers: elementSuggestions,
        allowDontKnow: true,
      },
    })
  }

  return {
    status: issues.length > 0 ? 'fail' : 'pass',
    issues,
    blockingQuestions: issues.map((issue) => issue.question).filter(Boolean) as any[],
  }
}

