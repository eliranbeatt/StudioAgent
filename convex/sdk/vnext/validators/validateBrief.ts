import { GateIssue, GateResult, TargetPlanSpec } from '../contracts'

export function validateBrief(args: { spec: TargetPlanSpec; artifact?: any }): GateResult {
  const issues: GateIssue[] = []
  const eventDate = args.spec.constraints.eventDate
  const location = args.spec.constraints.location
  const budget = args.spec.constraints.budgetCeilingNIS
  const accepted = new Set(args.spec.decisions.acceptedAssumptionsHe ?? [])

  if (!eventDate && !accepted.has('eventDateUnknown')) {
    issues.push({
      code: 'brief.missing_event_date',
      messageHe: 'חסר תאריך אירוע או אישור מפורש שהתאריך לא ידוע',
      severity: 'high',
      question: { id: 'event_date', textHe: 'מה תאריך האירוע?', type: 'date' },
    })
  }

  if (!location && !accepted.has('locationUnknown')) {
    issues.push({
      code: 'brief.missing_location',
      messageHe: 'חסר לוקיישן או אישור הנחה',
      severity: 'high',
      question: { id: 'location', textHe: 'איפה ההקמה/האירוע?', type: 'text' },
    })
  }

  if (!budget && !accepted.has('budgetUnknown')) {
    issues.push({
      code: 'brief.missing_budget',
      messageHe: 'חסרה מסגרת תקציבית',
      severity: 'medium',
      question: { id: 'budget', textHe: 'מה מסגרת התקציב המשוערת?', type: 'number' },
    })
  }

  if (
    args.spec.constraints.requiredElementCount !== undefined &&
    args.spec.constraints.requiredElementCount <= 0
  ) {
    issues.push({
      code: 'brief.invalid_required_count',
      messageHe: 'כמות האלמנטים שנדרשה אינה תקינה',
      severity: 'high',
      question: { id: 'required_element_count', textHe: 'כמה אלמנטים בדיוק נדרשים?', type: 'number' },
    })
  }

  return {
    status: issues.length > 0 ? 'fail' : 'pass',
    issues,
    blockingQuestions: issues.map((issue) => issue.question).filter(Boolean) as any[],
  }
}

