import { GateResult } from '../contracts'

export function validateAudit(args?: { findings?: any[]; acceptedRiskNote?: string }): GateResult {
  const findings = Array.isArray(args?.findings) ? args?.findings : []
  const blockers = findings.filter((item) => {
    const severity = String(item?.severity ?? '').toLowerCase()
    return severity === 'critical' || severity === 'high' || severity === 'blocker'
  })
  const acceptedRiskNote = String(args?.acceptedRiskNote ?? '').trim()
  if (blockers.length > 0 && acceptedRiskNote) {
    return { status: 'pass', issues: [], blockingQuestions: [] }
  }
  if (blockers.length > 0) {
    return {
      status: 'fail',
      issues: blockers.map((item: any, index: number) => ({
        code: `audit.blocker_${index + 1}`,
        messageHe: String(item?.messageHe ?? item?.message ?? 'ממצא חוסם בביקורת'),
        severity: 'high',
      })),
      blockingQuestions: [
        {
          id: 'audit_fixes',
          textHe: 'נמצאו ממצאים חוסמים בביקורת. לעדכן תיקונים לפני המשך.',
          type: 'text',
          allowDontKnow: false,
          suggestedAnswers: blockers.slice(0, 4).map((item: any, index: number) => ({
            value: `fix_${index + 1}`,
            labelHe: String(item?.messageHe ?? item?.message ?? `ממצא ${index + 1}`).slice(0, 60),
          })),
        },
      ],
    }
  }
  return { status: 'pass', issues: [], blockingQuestions: [] }
}
