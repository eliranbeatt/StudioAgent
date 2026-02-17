import type { ContextPackEnvelope } from './types'

/**
 * Convert a manifest object to compact markdown instead of JSON.
 */
function manifestToMarkdown(manifest: any): string {
  if (!manifest || typeof manifest !== 'object') return ''
  const lines: string[] = ['### Manifest']
  for (const [key, value] of Object.entries(manifest)) {
    if (Array.isArray(value)) {
      lines.push(`- **${key}**: ${value.join(', ')}`)
    } else if (value && typeof value === 'object') {
      lines.push(`- **${key}**: ${JSON.stringify(value)}`)
    } else {
      lines.push(`- **${key}**: ${String(value ?? '')}`)
    }
  }
  return lines.join('\n')
}

/**
 * Convert clarifications/extraContext to compact markdown tables or bullet lists.
 */
function objectToMarkdown(label: string, data: any): string {
  if (!data) return ''
  if (Array.isArray(data)) {
    if (data.length === 0) return ''
    // Array of objects → markdown table
    if (typeof data[0] === 'object' && data[0] !== null) {
      const keys = Object.keys(data[0]).slice(0, 8)
      const header = '| ' + keys.join(' | ') + ' |'
      const sep = '| ' + keys.map(() => '---').join(' | ') + ' |'
      const rows = data.slice(0, 30).map((row: any) =>
        '| ' + keys.map(k => String(row?.[k] ?? '').slice(0, 80)).join(' | ') + ' |'
      )
      return `### ${label}\n${header}\n${sep}\n${rows.join('\n')}`
    }
    // Array of primitives
    return `### ${label}\n${data.map((item: any) => `- ${String(item)}`).join('\n')}`
  }
  if (typeof data === 'object') {
    const lines = Object.entries(data).map(([k, v]) =>
      `- **${k}**: ${typeof v === 'object' ? JSON.stringify(v).slice(0, 200) : String(v ?? '')}`
    )
    return `### ${label}\n${lines.join('\n')}`
  }
  return `### ${label}\n${String(data)}`
}

export function buildContextPackPrompt(args: {
  header: string
  toolInstructions: string
  addon?: string
  envelope: ContextPackEnvelope
  clarifications?: any
  extraContext?: any
}) {
  const addon = args.addon ? `${args.addon}\n\n` : ''
  const manifest = manifestToMarkdown(args.envelope.manifest)
  const packsText = args.envelope.packs
    .map((pack) => `## ${pack.id} — ${pack.title}\n${pack.content}`)
    .join('\n\n')

  const clarifications = args.clarifications
    ? `\n\n${objectToMarkdown('CLARIFICATIONS', args.clarifications)}`
    : ''

  const extra = args.extraContext
    ? `\n\n${objectToMarkdown('EXTRA_CONTEXT', args.extraContext)}`
    : ''

  return `${args.header}${args.toolInstructions}\n\n${addon}${manifest}\n\nCONTEXT_PACKS:\n${packsText}${clarifications}${extra}`
}
