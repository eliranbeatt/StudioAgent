import { GateResult } from '../contracts'

export function validateCompile(args: {
  opCount: number
  hasElements?: boolean
  hasTasks?: boolean
  hasAccounting?: boolean
}): GateResult {
  if (args.opCount <= 0) {
    return {
      status: 'fail',
      issues: [
        {
          code: 'compile.empty_ops',
          messageHe: 'חבילת האישור ריקה ואין פעולות לשינוי',
          severity: 'high',
        },
      ],
      blockingQuestions: [
        {
          id: 'compile_retry',
          textHe: 'לא נוצרו פעולות שינוי. האם להפיק מחדש?',
          type: 'select',
          optionsHe: ['כן', 'לא'],
          allowDontKnow: false,
        },
      ],
    }
  }
  if (!args.hasElements || !args.hasTasks || !args.hasAccounting) {
    // Build suggestedAnswers listing which coverage items are missing
    const missingSuggestions: Array<{ value: string; labelHe: string }> = []
    if (!args.hasElements) missingSuggestions.push({ value: 'elements', labelHe: 'אלמנטים חסרים' })
    if (!args.hasTasks) missingSuggestions.push({ value: 'tasks', labelHe: 'משימות חסרות' })
    if (!args.hasAccounting) missingSuggestions.push({ value: 'accounting', labelHe: 'חשבונאות חסרה' })
    return {
      status: 'fail',
      issues: [
        {
          code: 'compile.coverage_missing',
          messageHe: 'חסרה כיסוי פעולה מלא (אלמנטים/משימות/חשבונאות)',
          severity: 'high',
        },
      ],
      blockingQuestions: [
        {
          id: 'compile_coverage',
          textHe: 'חסר כיסוי מלא בחבילת השינויים. להשלים שלבים קודמים?',
          type: 'select',
          optionsHe: ['כן', 'לא'],
          suggestedAnswers: missingSuggestions,
          allowDontKnow: false,
        },
      ],
    }
  }
  return { status: 'pass', issues: [], blockingQuestions: [] }
}
