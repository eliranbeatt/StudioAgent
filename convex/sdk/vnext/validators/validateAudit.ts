import { GateResult } from '../contracts'

export function validateAudit(args?: { findings?: any[] }): GateResult {
  const findings = Array.isArray(args?.findings) ? args?.findings : []
  const blockers = findings.filter((item) => {
    const severity = String(item?.severity ?? '').toLowerCase()
    return severity === 'critical' || severity === 'high' || severity === 'blocker'
  })
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
        },
      ],
    }
  }
  return { status: 'pass', issues: [], blockingQuestions: [] }
}

