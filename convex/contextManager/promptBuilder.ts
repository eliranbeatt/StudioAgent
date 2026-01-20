import type { ContextPackEnvelope } from './types'

export function buildContextPackPrompt(args: {
  header: string
  toolInstructions: string
  addon?: string
  envelope: ContextPackEnvelope
  clarifications?: any
  extraContext?: any
}) {
  const addon = args.addon ? `${args.addon}\n\n` : ''
  const manifest = JSON.stringify(args.envelope.manifest, null, 2)
  const packsText = args.envelope.packs
    .map((pack) => `## ${pack.id} — ${pack.title}\n${pack.content}`)
    .join('\n\n')

  const clarifications = args.clarifications
    ? `\n\nCLARIFICATIONS:\n${JSON.stringify(args.clarifications, null, 2)}`
    : ''

  const extra = args.extraContext ? `\n\nEXTRA_CONTEXT:\n${JSON.stringify(args.extraContext, null, 2)}` : ''

  return `${args.header}${args.toolInstructions}\n\n${addon}CONTEXT_MANIFEST:\n${manifest}\n\nCONTEXT_PACKS:\n${packsText}${clarifications}${extra}`
}
