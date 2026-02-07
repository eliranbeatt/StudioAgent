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
        },
      ],
    }
  }
  if (!args.hasElements || !args.hasTasks || !args.hasAccounting) {
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
        },
      ],
    }
  }
  return { status: 'pass', issues: [], blockingQuestions: [] }
}
