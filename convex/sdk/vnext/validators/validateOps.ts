import { GateIssue, GateResult } from '../contracts'

function collectOpsItems(opsArtifact: any): any[] {
  if (Array.isArray(opsArtifact?.steps)) return opsArtifact.steps
  if (Array.isArray(opsArtifact?.opsPlan?.steps)) return opsArtifact.opsPlan.steps
  if (Array.isArray(opsArtifact?.dailyPlan)) return opsArtifact.dailyPlan
  return []
}

export function validateOps(args: { opsArtifact?: any; coverageRules?: any }): GateResult {
  const issues: GateIssue[] = []
  const items = collectOpsItems(args.opsArtifact)
  const text = JSON.stringify(items).toLowerCase()

  if (items.length === 0) {
    issues.push({
      code: 'ops.empty',
      messageHe: 'לא נבנתה תוכנית ביצוע ולוגיסטיקה',
      severity: 'high',
      question: {
        id: 'ops_rebuild',
        textHe: 'לא נמצאה תוכנית ביצוע. להפיק מחדש?',
        type: 'select',
        optionsHe: ['כן', 'לא'],
        allowDontKnow: false,
      },
    })
  }

  if (args.coverageRules?.requireOpsLogistics && !text.includes('transport') && !text.includes('הובלה')) {
    issues.push({
      code: 'ops.transport_missing',
      messageHe: 'חסרה התייחסות להובלה/לוגיסטיקה',
      severity: 'medium',
    })
  }
  if (args.coverageRules?.requireTeardown && !text.includes('teardown') && !text.includes('פירוק')) {
    issues.push({
      code: 'ops.teardown_missing',
      messageHe: 'חסרה תוכנית פירוק',
      severity: 'medium',
    })
  }

  return {
    status: issues.length > 0 ? 'fail' : 'pass',
    issues,
    blockingQuestions: issues.map((issue) => issue.question).filter(Boolean) as any[],
  }
}
