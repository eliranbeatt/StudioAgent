
type TaskTitleCompressionResult = {
  title: string
  movedDetails: string | null
}

type MaterialNameSplitResult = {
  primary: string
  alternatives: string[]
}

const META_TOKENS_PATTERN = /\b(?:plan\s*[ab]|plan|approx|estimated|estimate|according\s+to\s+link|includes?\s+shipping|shipping\s+included|etc)\b|(?:משוער|הנחות|לפי\s+לינק|כולל\s+משלוח|וכו[׳']?|תיאור)/gi
const WORK_TYPE_LABELS_HE: Record<string, string> = {
  carpentry: 'נגרות',
  metal_fab: 'מסגרות',
  paint_finish: 'צביעה וגמר',
  printing_graphics: 'הדפסה וגרפיקה',
  props_sculpt: 'פיסול ואביזרים',
  rigging_install: 'ריגינג והתקנה',
  transport_logistics: 'הובלה ולוגיסטיקה',
  purchasing: 'רכש',
  management: 'ניהול',
}

function cleanWhitespace(value: string) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function simpleId() {
  return Math.random().toString(36).slice(2, 8)
}

function stripParentheticalSegments(value: string) {
  return cleanWhitespace(String(value ?? '').replace(/\([^)]*\)/g, ' '))
}

function clipWords(value: string, maxWords: number) {
  const words = cleanWhitespace(value).split(' ').filter(Boolean)
  if (words.length <= maxWords) return cleanWhitespace(value)
  return words.slice(0, maxWords).join(' ')
}

function appendDetail(base: unknown, extra: string | null) {
  const baseText = cleanWhitespace(String(base ?? ''))
  if (!extra) return baseText
  if (!baseText) return extra
  if (baseText.includes(extra)) return baseText
  return `${baseText}. ${extra}`
}

export function compressTaskTitleHe(title: unknown): TaskTitleCompressionResult {
  const original = cleanWhitespace(String(title ?? ''))
  if (!original) return { title: '', movedDetails: null }

  const withoutParens = stripParentheticalSegments(original)
  const noMeta = cleanWhitespace(withoutParens.replace(META_TOKENS_PATTERN, ' '))
  const firstClause = cleanWhitespace(noMeta.split(/[,:;\-|]/)[0] ?? noMeta)
  const compact = clipWords(firstClause, 7)

  const moved = cleanWhitespace(original.replace(compact, '').replace(META_TOKENS_PATTERN, ' ').replace(/^[\s,.;:-]+/, ''))
  return {
    title: compact || clipWords(noMeta || original, 7),
    movedDetails: moved || null,
  }
}

export function splitAlternativesIfExplicit(name: unknown): MaterialNameSplitResult {
  const source = cleanWhitespace(String(name ?? ''))
  if (!source) return { primary: '', alternatives: [] }
  const normalized = source.replace(/\s+/g, ' ')

  if (normalized.includes(' או ')) {
    const parts = normalized.split(' או ').map((part) => cleanWhitespace(part)).filter(Boolean)
    return {
      primary: parts[0] ?? source,
      alternatives: parts.slice(1),
    }
  }

  if (/\bor\b/i.test(normalized)) {
    const parts = normalized.split(/\bor\b/i).map((part) => cleanWhitespace(part)).filter(Boolean)
    return {
      primary: parts[0] ?? source,
      alternatives: parts.slice(1),
    }
  }

  return { primary: source, alternatives: [] }
}

export function compressMaterialNameHe(name: unknown): string {
  const source = cleanWhitespace(String(name ?? ''))
  if (!source) return ''
  const withoutParens = stripParentheticalSegments(source)
  const noMeta = cleanWhitespace(withoutParens.replace(META_TOKENS_PATTERN, ' '))
  return clipWords(noMeta || withoutParens || source, 8)
}

function normalizeTaskObject(task: any) {
  if (!task || typeof task !== 'object') return task
  const currentTitle = task.titleHe ?? task.title ?? ''
  const compressed = compressTaskTitleHe(currentTitle)
  if (compressed.title) {
    if (task.titleHe !== undefined) task.titleHe = compressed.title
    if (task.title !== undefined && !task.titleHe) task.title = compressed.title
  }
  if (compressed.movedDetails) {
    if (task.descriptionHe !== undefined || task.titleHe !== undefined) {
      task.descriptionHe = appendDetail(task.descriptionHe, compressed.movedDetails)
    } else {
      task.description = appendDetail(task.description, compressed.movedDetails)
    }
  }
  return task
}

function normalizeMaterialLabel(value: any) {
  const split = splitAlternativesIfExplicit(value)
  return {
    name: compressMaterialNameHe(split.primary),
    alternatives: split.alternatives.map((item) => compressMaterialNameHe(item)).filter(Boolean),
  }
}



function normalizeMaterialObject(line: any) {
  if (!line || typeof line !== 'object') return [line]
  const sourceName = line.nameHe ?? line.itemHe ?? line.titleHe ?? line.name ?? line.itemName ?? line.title ?? ''
  const normalized = normalizeMaterialLabel(sourceName)
  const clones: any[] = []

  const applyName = (target: any, name: string) => {
    if (target.nameHe !== undefined || target.itemHe === undefined) target.nameHe = name
    if (target.itemHe !== undefined) target.itemHe = name
    if (target.titleHe !== undefined && target.itemHe === undefined && target.nameHe === undefined) target.titleHe = name
    if (target.name !== undefined && target.nameHe === undefined && target.itemHe === undefined) target.name = name
  }

  applyName(line, normalized.name)

  if (normalized.alternatives.length > 0) {
    line.assumptionsHe = Array.isArray(line.assumptionsHe) ? line.assumptionsHe : []
    line.assumptionsHe.push(`חלופות נפרדות הועברו לשורות חלופיות: ${normalized.alternatives.join(', ')}`)

    for (const alt of normalized.alternatives) {
      const copy = { ...line }
      applyName(copy, alt)
      const idSeed = String(copy.lineTempOrId ?? copy.tempId ?? copy._id ?? 'material')
      if (copy.lineTempOrId) copy.lineTempOrId = `${idSeed}_alt_${simpleId()}`
      if (copy.tempId) copy.tempId = `${idSeed}_alt_${simpleId()}`
      copy.isAlternative = true
      clones.push(copy)
    }
  }

  return [line, ...clones]
}

function normalizeWorkObject(line: any) {
  if (!line || typeof line !== 'object') return line
  const workTypeKey = cleanWhitespace(String(line.workTypeKey ?? line.workType ?? '')).toLowerCase()
  if (workTypeKey && WORK_TYPE_LABELS_HE[workTypeKey]) {
    line.workTypeLabelHe = WORK_TYPE_LABELS_HE[workTypeKey]
  }

  const role = cleanWhitespace(String(line.roleHe ?? ''))
  const normalizedRole = cleanWhitespace(role.replace(META_TOKENS_PATTERN, '').replace(/\([^)]*\)/g, ''))
  const looksLikeKey = /^[a-z_]+$/.test(normalizedRole)
  if (!normalizedRole || looksLikeKey) {
    line.roleHe = WORK_TYPE_LABELS_HE[workTypeKey] ?? '????? ?????'
  } else {
    line.roleHe = clipWords(normalizedRole, 8)
  }
  return line
}

function isManagementLaborLine(line: any) {
  if (!line || typeof line !== 'object') return false
  const key = cleanWhitespace(String(line.workTypeKey ?? line.workType ?? '')).toLowerCase()
  if (key === 'management') return true
  if (line.isManagement === true) return true
  const role = cleanWhitespace(String(line.roleHe ?? line.titleHe ?? line.nameHe ?? '')).toLowerCase()
  return role.includes('management') || role.includes('?????')
}

function normalizeBudgetPayload(payload: any) {
  if (!payload || typeof payload !== 'object') return payload
  if (Array.isArray(payload.materialLines)) {
    payload.materialLines = payload.materialLines.flatMap((line: any) => normalizeMaterialObject(line))
  }
  let droppedManagementCount = 0
  if (Array.isArray(payload.workLines)) {
    payload.workLines = payload.workLines
      .map((line: any) => normalizeWorkObject(line))
      .filter((line: any) => {
        const drop = isManagementLaborLine(line)
        if (drop) droppedManagementCount += 1
        return !drop
      })
  }
  if (payload.intent?.payload && Array.isArray(payload.intent.payload.materialLines)) {
    payload.intent.payload.materialLines = payload.intent.payload.materialLines.flatMap((line: any) => normalizeMaterialObject(line))
  }
  if (payload.intent?.payload && Array.isArray(payload.intent.payload.workLines)) {
    payload.intent.payload.workLines = payload.intent.payload.workLines
      .map((line: any) => normalizeWorkObject(line))
      .filter((line: any) => {
        const drop = isManagementLaborLine(line)
        if (drop) droppedManagementCount += 1
        return !drop
      })
  }
  if (droppedManagementCount > 0) {
    payload.meta = payload.meta && typeof payload.meta === 'object' ? payload.meta : {}
    payload.meta.filteredManagementWorkLines = droppedManagementCount
  }
  return payload
}

function normalizePricingPayload(payload: any) {
  if (!payload || typeof payload !== 'object') return payload
  if (Array.isArray(payload.recommendations)) {
    payload.recommendations = payload.recommendations.flatMap((recommendation: any) => {
      if (!recommendation || typeof recommendation !== 'object') return [recommendation]
      const normalized = normalizeMaterialLabel(recommendation.itemHe ?? recommendation.nameHe ?? recommendation.titleHe)
      recommendation.itemHe = normalized.name
      recommendation.assumptionsHe = Array.isArray(recommendation.assumptionsHe) ? recommendation.assumptionsHe : []
      if (normalized.alternatives.length > 0) {
        recommendation.assumptionsHe.push(`?????? ??????? ??????: ${normalized.alternatives.join(', ')}`)
      }

      if (Array.isArray(recommendation.candidates)) {
        recommendation.candidates = recommendation.candidates.map((candidate: any) => {
          if (!candidate || typeof candidate !== 'object') return candidate
          const candidateName = candidate.titleHe ?? candidate.title ?? candidate.itemHe
          const normalizedCandidate = normalizeMaterialLabel(candidateName)
          if (candidate.titleHe !== undefined || candidate.title === undefined) candidate.titleHe = normalizedCandidate.name
          if (candidate.title !== undefined) candidate.title = normalizedCandidate.name
          return candidate
        })
      }

      const alternatives = normalized.alternatives
      if (alternatives.length === 0) return [recommendation]

      const clones = alternatives.map((altName: string) => ({
        ...recommendation,
        itemHe: altName,
        isAlternative: true,
      }))
      return [recommendation, ...clones]
    })
  }
  return payload
}

function normalizeTaskPayload(payload: any) {
  if (!payload || typeof payload !== 'object') return payload
  if (Array.isArray(payload.tasks)) {
    payload.tasks = payload.tasks.map((task: any) => normalizeTaskObject(task))
  }
  if (payload.intent?.payload && Array.isArray(payload.intent.payload.tasks)) {
    payload.intent.payload.tasks = payload.intent.payload.tasks.map((task: any) => normalizeTaskObject(task))
  }
  return payload
}

export function postProcessToolOutput(toolId: string, payload: any) {
  if (!payload || typeof payload !== 'object') return payload
  if (toolId === 'plan.tasks') return normalizeTaskPayload(payload)
  if (toolId === 'pricing.resolve_lines') return normalizePricingPayload(payload)
  if (toolId === 'cost.build_budget') return normalizeBudgetPayload(payload)
  return payload
}

