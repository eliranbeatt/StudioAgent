export type TagGroupId = 'category'

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
]

export const TAG_DEFINITIONS: TagDefinition[] = [
  { id: 'category:planning', groupId: 'category', labelHe: 'תכנון', order: 1 },
  { id: 'category:tasks', groupId: 'category', labelHe: 'משימות', order: 2 },
  { id: 'category:knowledge', groupId: 'category', labelHe: 'איסוף ידע', order: 3 },
  { id: 'category:review', groupId: 'category', labelHe: 'ביקורת', order: 4 },
  { id: 'category:shopping', groupId: 'category', labelHe: 'קניות', order: 5 },
]

const TAG_GROUPS_BY_ID = new Map(TAG_GROUPS.map((group) => [group.id, group]))
const TAGS_BY_ID = new Map(TAG_DEFINITIONS.map((tag) => [tag.id, tag]))

export const buildSkillTagIds = (skill: SkillTagSource) => {
  const tagIds = new Set<string>()

  if (skill.category) tagIds.add(`category:${skill.category}`)

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

