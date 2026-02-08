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
      question: {
        id: 'event_date',
        textHe: 'מה תאריך האירוע?',
        type: 'date',
        allowDontKnow: true,
      },
    })
  }

  if (!location && !accepted.has('locationUnknown')) {
    issues.push({
      code: 'brief.missing_location',
      messageHe: 'חסר לוקיישן או אישור הנחה',
      severity: 'high',
      question: {
        id: 'location',
        textHe: 'איפה ההקמה/האירוע?',
        type: 'text',
        allowDontKnow: true,
      },
    })
  }

  if (!budget && !accepted.has('budgetUnknown')) {
    issues.push({
      code: 'brief.missing_budget',
      messageHe: 'חסרה מסגרת תקציבית',
      severity: 'medium',
      question: {
        id: 'budget',
        textHe: 'מה מסגרת התקציב המשוערת?',
        type: 'number',
        allowDontKnow: true,
        options: [
          { value: '5000', labelHe: 'עד 5,000 ₪' },
          { value: '10000', labelHe: '5,000-15,000 ₪' },
          { value: '22500', labelHe: '15,000-30,000 ₪' },
          { value: '40000', labelHe: 'מעל 30,000 ₪' },
        ],
      },
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
      question: {
        id: 'required_element_count',
        textHe: 'כמה אלמנטים בדיוק נדרשים?',
        type: 'number',
        options: [
          { value: '2', labelHe: '1-3' },
          { value: '5', labelHe: '4-6' },
          { value: '8', labelHe: '7-10' },
          { value: '12', labelHe: '10+' },
        ],
      },
    })
  }

  return {
    status: issues.length > 0 ? 'fail' : 'pass',
    issues,
    blockingQuestions: issues.map((issue) => issue.question).filter(Boolean) as any[],
  }
}

