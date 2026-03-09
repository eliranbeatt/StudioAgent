import { z } from 'zod'

export const sessionStateSchema = z.object({
  version: z.literal(1).default(1),
  activeProjectId: z.string().nullable().default(null),
  activeProjectName: z.string().nullable().default(null),
  mode: z.enum(['free_chat', 'planning', 'planning_ready', 'awaiting_approval']).default('free_chat'),
  planningStep: z.string().nullable().default(null),
  pendingChangeSetId: z.string().nullable().default(null),
  approvalToken: z.string().nullable().default(null),
  conversationId: z.string().nullable().default(null),
  chatRunId: z.string().nullable().default(null),
  planningConversationId: z.string().nullable().default(null),
  planningRunId: z.string().nullable().default(null),
  questionSetIndex: z.number().int().min(0).default(0),
  lastQuestionBatch: z.any().nullable().default(null),
  updatedAt: z.number().int().default(() => Date.now()),
})

export const storeSchema = z.object({
  version: z.literal(1).default(1),
  sessions: z.record(z.string(), sessionStateSchema).default({}),
})

export function createDefaultSessionState() {
  return sessionStateSchema.parse({})
}

export function normalizeSessionState(value) {
  return sessionStateSchema.parse({
    ...createDefaultSessionState(),
    ...(value ?? {}),
    updatedAt: Date.now(),
  })
}

export function cleanObject(value) {
  return Object.fromEntries(
    Object.entries(value ?? {}).filter(([, entry]) => entry !== undefined)
  )
}

export function compactQuestionBatch(result, setIndex) {
  const currentSet = result?.currentSet ?? null
  if (!currentSet) return null
  const questions = Array.isArray(currentSet.questions) ? currentSet.questions : []
  return {
    setIndex,
    totalSets: Number(result?.totalSets ?? 0),
    hasMore: Boolean(result?.hasMore),
    groupKey: String(currentSet.groupKey ?? ''),
    groupLabelHe: String(currentSet.groupLabelHe ?? ''),
    questionIds: questions.map((question) => String(question?.id ?? '')).filter(Boolean),
    questions: questions.map((question) => ({
      id: String(question?.id ?? ''),
      questionHe: String(question?.questionHe ?? ''),
      type: String(question?.type ?? 'text'),
      blockingLevel: String(question?.blockingLevel ?? 'helpful'),
      allowDontKnow: question?.allowDontKnow !== false,
      options: Array.isArray(question?.options) ? question.options : [],
      suggestedAnswers: Array.isArray(question?.suggestedAnswers) ? question.suggestedAnswers : [],
    })),
  }
}

export function listContracts() {
  return {
    sessionState: {
      fields: [
        'activeProjectId',
        'mode',
        'planningStep',
        'pendingChangeSetId',
        'lastQuestionBatch',
      ],
    },
    operations: [
      'project.search',
      'project.select',
      'project.current',
      'context.get',
      'chat.run.start_or_continue',
      'planning.run.start',
      'planning.questions.next',
      'planning.answers.submit',
      'planning.finalize',
      'changeset.list_pending',
      'changeset.compile',
      'changeset.review',
      'changeset.apply',
      'changeset.discard',
      'web.search',
      'knowledge.refresh',
      'meta.contracts',
    ],
  }
}
