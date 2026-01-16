export type TagGroupId = 'category' | 'stage' | 'domain' | 'output' | 'tools' | 'behavior'

export type TagGroup = {
  id: TagGroupId
  labelHe: string
  order: number
}

export type TagDefinition = {
  id: string
  groupId: TagGroupId
  labelHe: string
  order: number
}

export type SkillTagSource = {
  skillId: string
  category?: string
  flow?: string
  config?: {
    requiresClarifications?: boolean
    allowedTools?: {
      webSearch?: boolean
      ragSearch?: boolean
      fileInspect?: boolean
    }
    outputContract?: string
  }
}

export const TAG_GROUPS: TagGroup[] = [
  { id: 'category', labelHe: 'סוג', order: 1 },
  { id: 'stage', labelHe: 'שלב', order: 2 },
  { id: 'domain', labelHe: 'נושא', order: 3 },
  { id: 'output', labelHe: 'פלט', order: 4 },
  { id: 'tools', labelHe: 'כלים', order: 5 },
  { id: 'behavior', labelHe: 'תנאים', order: 6 },
]

export const TAG_DEFINITIONS: TagDefinition[] = [
  { id: 'category:consult', groupId: 'category', labelHe: 'ייעוץ', order: 1 },
  { id: 'category:build', groupId: 'category', labelHe: 'בנייה', order: 2 },
  { id: 'category:review', groupId: 'category', labelHe: 'סקירה', order: 3 },
  { id: 'category:research', groupId: 'category', labelHe: 'מחקר', order: 4 },
  { id: 'category:audit', groupId: 'category', labelHe: 'ביקורת', order: 5 },
  { id: 'category:clarify', groupId: 'category', labelHe: 'הבהרה', order: 6 },
  { id: 'category:ops', groupId: 'category', labelHe: 'תפעול', order: 7 },

  { id: 'stage:ideation', groupId: 'stage', labelHe: 'אידאציה', order: 1 },
  { id: 'stage:planning', groupId: 'stage', labelHe: 'תכנון', order: 2 },
  { id: 'stage:execution', groupId: 'stage', labelHe: 'ביצוע', order: 3 },
  { id: 'stage:review', groupId: 'stage', labelHe: 'בקרה', order: 4 },
  { id: 'stage:optimization', groupId: 'stage', labelHe: 'אופטימיזציה', order: 5 },

  { id: 'domain:consult', groupId: 'domain', labelHe: 'שיחה/ייעוץ', order: 1 },
  { id: 'domain:brief', groupId: 'domain', labelHe: 'בריף', order: 2 },
  { id: 'domain:context', groupId: 'domain', labelHe: 'קונטקסט', order: 3 },
  { id: 'domain:elements', groupId: 'domain', labelHe: 'אלמנטים', order: 4 },
  { id: 'domain:tasks', groupId: 'domain', labelHe: 'משימות', order: 5 },
  { id: 'domain:budget', groupId: 'domain', labelHe: 'תקציב/BOM', order: 6 },
  { id: 'domain:quote', groupId: 'domain', labelHe: 'הצעת מחיר', order: 7 },
  { id: 'domain:install', groupId: 'domain', labelHe: 'התקנה/ראנבוק', order: 8 },
  { id: 'domain:procurement', groupId: 'domain', labelHe: 'רכש', order: 9 },
  { id: 'domain:research', groupId: 'domain', labelHe: 'מחקר/השראה', order: 10 },
  { id: 'domain:review', groupId: 'domain', labelHe: 'בדיקות/ביקורת', order: 11 },
  { id: 'domain:print', groupId: 'domain', labelHe: 'דפוס', order: 12 },
  { id: 'domain:receipts', groupId: 'domain', labelHe: 'קבלות', order: 13 },
  { id: 'domain:execution-planning', groupId: 'domain', labelHe: 'תכנון ביצוע', order: 14 },

  { id: 'output:blocks', groupId: 'output', labelHe: 'בלוקים', order: 1 },
  { id: 'output:changeset', groupId: 'output', labelHe: 'שינויים', order: 2 },
  { id: 'output:suggestions', groupId: 'output', labelHe: 'המלצות', order: 3 },

  { id: 'tools:web-search', groupId: 'tools', labelHe: 'ווב', order: 1 },
  { id: 'tools:file-inspect', groupId: 'tools', labelHe: 'קבצים', order: 2 },
  { id: 'tools:rag-search', groupId: 'tools', labelHe: 'חיפוש ידע', order: 3 },

  { id: 'behavior:needs-clarifications', groupId: 'behavior', labelHe: 'דורש הבהרות', order: 1 },
]

const TAG_GROUPS_BY_ID = new Map(TAG_GROUPS.map((group) => [group.id, group]))
const TAGS_BY_ID = new Map(TAG_DEFINITIONS.map((tag) => [tag.id, tag]))

const SKILL_DOMAIN_TAGS: Record<string, string[]> = {
  CONSULTANT_CHAT: ['domain:consult'],
  CLARIFICATIONS_GATE: ['domain:context'],
  CONTEXT_GENERATION: ['domain:context'],
  CHANGESET_REVIEWER: ['domain:review'],
  PROJECT_BRIEF_BUILDER: ['domain:brief'],
  ELEMENTS_BUILDER_FULL: ['domain:elements'],
  TASKS_BUILDER_FULL: ['domain:tasks'],
  ACCOUNTING_BUILDER_FULL: ['domain:budget'],
  QUOTE_WRITER_FULL: ['domain:quote'],
  ELEMENTS_TO_TASKS_SYNC: ['domain:elements', 'domain:tasks'],
  TASKS_CRITICAL_PATH_POLISH: ['domain:tasks'],
  TASK_ACCOUNTING_MAPPING_REPAIR: ['domain:tasks', 'domain:budget'],
  GAP_AUDIT: ['domain:review'],
  RISK_REVIEW: ['domain:review'],
  COST_VARIANCE_ANALYZER: ['domain:budget'],
  DAILY_EXECUTION_PLANNER: ['domain:execution-planning'],
  INSTALL_RUNBOOK_BUILDER: ['domain:install'],
  SHOPPING_PLANNER_WEB: ['domain:procurement'],
  BUYING_ASSISTANT_WEB: ['domain:procurement'],
  RESEARCH_INSPIRATION_WEB: ['domain:research'],
  RESEARCH_PRICING_ESTIMATES_WEB: ['domain:research', 'domain:budget'],
  PRINT_QA: ['domain:print'],
  RECEIPT_PARSE_AND_MAP: ['domain:receipts', 'domain:budget'],
  BOM_DUPLICATE_ANALYZER: ['domain:budget'],
  BUILD_PLANNER: ['domain:execution-planning'],
}

export const buildSkillTagIds = (skill: SkillTagSource) => {
  const tagIds = new Set<string>()

  if (skill.category) tagIds.add(`category:${skill.category}`)
  if (skill.flow) tagIds.add(`stage:${skill.flow}`)

  const outputContract = skill.config?.outputContract
  if (outputContract) tagIds.add(`output:${outputContract}`)

  const allowedTools = skill.config?.allowedTools
  if (allowedTools?.webSearch) tagIds.add('tools:web-search')
  if (allowedTools?.ragSearch) tagIds.add('tools:rag-search')
  if (allowedTools?.fileInspect) tagIds.add('tools:file-inspect')

  if (skill.config?.requiresClarifications) tagIds.add('behavior:needs-clarifications')

  const domainTags = SKILL_DOMAIN_TAGS[skill.skillId]
  if (domainTags) {
    for (const tagId of domainTags) tagIds.add(tagId)
  }

  return Array.from(tagIds)
}

export const resolveTagRecords = (tagIds: string[]) => {
  const records = tagIds
    .map((tagId) => {
      const tag = TAGS_BY_ID.get(tagId)
      if (!tag) return null
      const group = TAG_GROUPS_BY_ID.get(tag.groupId)
      if (!group) return null
      return {
        id: tag.id,
        labelHe: tag.labelHe,
        groupId: tag.groupId,
        groupLabelHe: group.labelHe,
        order: group.order * 100 + tag.order,
      }
    })
    .filter((record): record is NonNullable<typeof record> => Boolean(record))

  records.sort((a, b) => a.order - b.order)
  return records
}

export const addSkillTags = <T extends SkillTagSource>(skill: T) => {
  const tagIds = buildSkillTagIds(skill)
  const tagRecords = resolveTagRecords(tagIds)
  return {
    ...skill,
    tagIds,
    tagLabelsHe: tagRecords.map((tag) => tag.labelHe),
  }
}
