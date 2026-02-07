import { GateIssue, GateResult } from '../contracts'

export function validateQuote(args: { quoteArtifact?: any; scopeArtifact?: any; pricingArtifact?: any }): GateResult {
  const issues: GateIssue[] = []
  const quote = args.quoteArtifact?.quoteDraft ?? args.quoteArtifact?.quote ?? args.quoteArtifact ?? {}
  const sections = Array.isArray(quote?.sections) ? quote.sections : []
  const scopeElements = Array.isArray(args.scopeArtifact?.proposedElements) ? args.scopeArtifact.proposedElements : []
  const sectionText = JSON.stringify(sections)
  const hasAssumptions = sectionText.includes('הנחות') || sectionText.toLowerCase().includes('assumption')

  if (sections.length === 0 && !quote?.quoteTextHe && !quote?.titleHe) {
    issues.push({
      code: 'quote.empty',
      messageHe: 'טיוטת ההצעה ריקה',
      severity: 'high',
      question: {
        id: 'quote_rebuild',
        textHe: 'לא נוצרה טיוטת הצעת מחיר. להפיק מחדש?',
        type: 'select',
        optionsHe: ['כן', 'לא'],
      },
    })
  }

  if (!hasAssumptions) {
    issues.push({
      code: 'quote.assumptions_missing',
      messageHe: 'חסרה פסקת הנחות/אי הכללות',
      severity: 'medium',
    })
  }

  if (scopeElements.length > 0 && sections.length > 0) {
    for (const element of scopeElements) {
      const label = String(element?.nameHe ?? '').trim()
      if (!label) continue
      if (!sectionText.includes(label)) {
        issues.push({
          code: 'quote.scope_mismatch',
          messageHe: `אלמנט חסר בהצעה: ${label}`,
          severity: 'medium',
        })
      }
    }
  }

  return {
    status: issues.length > 0 ? 'fail' : 'pass',
    issues,
    blockingQuestions: issues.map((issue) => issue.question).filter(Boolean) as any[],
  }
}
