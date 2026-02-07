"use node"

export async function runSemanticAudit(args: { findings: any[] }) {
  const findings = Array.isArray(args.findings) ? args.findings : []
  const blockers = findings.filter((item) => {
    const severity = String(item?.severity ?? '').toLowerCase()
    return severity === 'critical' || severity === 'high' || severity === 'blocker'
  })

  return {
    findings,
    blockers,
    hasBlockingFindings: blockers.length > 0,
  }
}

