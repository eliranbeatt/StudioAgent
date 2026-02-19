export function summarizeToolResultCompact(toolName: string, result: any): string {
  if (!result || typeof result !== 'object') return String(result ?? '')

  if (result.error) return JSON.stringify({ error: result.error })

  if (result.changeSetId || result.intents || result.intent || result.blocks) {
    return JSON.stringify(result)
  }

  if (toolName === 'context.get') {
    const parts: string[] = []
    if (result.project) parts.push(`Project: ${result.project.name ?? ''} (${result.project.stage ?? ''})`)
    if (Array.isArray(result.elements)) parts.push(`Elements: ${result.elements.length} items`)
    if (Array.isArray(result.tasks)) parts.push(`Tasks: ${result.tasks.length} items`)
    if (result.knowledgeDoc) parts.push(`KnowledgeDoc: loaded (${String(result.knowledgeDoc).length} chars)`)
    if (Array.isArray(result.recentQA)) parts.push(`QA pairs: ${result.recentQA.length}`)
    if (Array.isArray(result.elements) && result.elements.length > 0) {
      parts.push(`Element titles: ${result.elements.map((e: any) => `${e.title}`).join(', ')}`)
    }
    if (Array.isArray(result.tasks) && result.tasks.length > 0) {
      parts.push(`Task titles: ${result.tasks.slice(0, 20).map((t: any) => `${t.title}`).join(', ')}`)
    }
    return parts.join('\n') || JSON.stringify(result)
  }

  if (toolName === 'agent.data') {
    const parts: string[] = []
    for (const [key, val] of Object.entries(result)) {
      if (Array.isArray(val)) parts.push(`${key}: ${val.length} items`)
      else if (val && typeof val === 'object') parts.push(`${key}: ${JSON.stringify(val).slice(0, 200)}`)
      else parts.push(`${key}: ${String(val)}`)
    }
    return parts.join('\n') || JSON.stringify(result)
  }

  if (toolName === 'knowledge.summarize_or_update') {
    return `Knowledge doc updated. ${result.meta?.didUpdate ? 'Changes applied.' : 'No changes.'}`
  }

  const raw = JSON.stringify(result)
  if (raw.length <= 2000) return raw
  return raw.slice(0, 1800) + '\n... (truncated, use context.get for full data)'
}

export function buildMessageStats(messages: any[]) {
  const safe = Array.isArray(messages) ? messages : []
  const stats = {
    totalChars: 0,
    systemChars: 0,
    userChars: 0,
    assistantChars: 0,
    toolChars: 0,
    messageCount: safe.length,
    messagesCount: safe.length,
  }

  for (const message of safe) {
    const content = typeof message?.content === 'string' ? message.content : JSON.stringify(message?.content ?? '')
    const len = content.length
    stats.totalChars += len
    if (message?.role === 'system') stats.systemChars += len
    if (message?.role === 'user') stats.userChars += len
    if (message?.role === 'assistant') stats.assistantChars += len
    if (message?.role === 'tool') stats.toolChars += len
  }

  return stats
}
