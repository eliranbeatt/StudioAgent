#!/usr/bin/env node

import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import dotenv from 'dotenv'

import { evaluateChangeSetPolicy } from './lib/approval-policy.mjs'
import { convexAction, convexMutation, convexQuery } from './lib/client.mjs'
import { cleanObject, compactQuestionBatch, listContracts } from './lib/contracts.mjs'
import { getSessionState, resetProjectScopedState, updateSessionState } from './lib/session-store.mjs'
import { tavilySearch } from './lib/tavily.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

dotenv.config({ path: path.resolve(__dirname, '../.env') })

function printUsage() {
  console.log(
    JSON.stringify(
      {
        usage: 'node ./bridge/studio-bridge.mjs <operation> \'<json-payload>\'',
        operations: listContracts().operations,
      },
      null,
      2
    )
  )
}

function parsePayload(raw) {
  if (!raw) return {}
  try {
    return JSON.parse(raw)
  } catch (error) {
    throw new Error(`Payload must be valid JSON: ${error.message}`)
  }
}

function normalizeText(value) {
  return String(value ?? '').trim().toLowerCase()
}

function resolveSessionKey(payload) {
  return String(
    payload?.sessionKey ??
    process.env.OPENCLAW_SESSION_KEY ??
    process.env.CLAW_SESSION_KEY ??
    'default'
  ).trim() || 'default'
}

async function listProjects() {
  return convexQuery('projects:listProjects', {})
}

function scoreProject(project, query) {
  const id = String(project?.id ?? project?._id ?? '')
  const name = String(project?.name ?? '')
  const normalizedQuery = normalizeText(query)
  if (!normalizedQuery) return 0
  const normalizedName = normalizeText(name)
  if (id === query) return 1000
  if (normalizedName === normalizedQuery) return 900
  if (normalizedName.startsWith(normalizedQuery)) return 700
  if (normalizedName.includes(normalizedQuery)) return 600

  const tokens = normalizedQuery.split(/\s+/).filter(Boolean)
  const matchedTokens = tokens.filter((token) => normalizedName.includes(token)).length
  return matchedTokens * 100
}

async function searchProjects(query, limit = 5) {
  const projects = await listProjects()
  const normalized = normalizeText(query)
  const scored = (Array.isArray(projects) ? projects : [])
    .map((project) => ({
      id: String(project?.id ?? ''),
      name: String(project?.name ?? ''),
      status: String(project?.status ?? ''),
      score: normalized ? scoreProject(project, normalized) : 0,
    }))
    .filter((project) => !normalized || project.score > 0)
    .sort((left, right) => right.score - left.score || left.name.localeCompare(right.name))
  return normalized ? scored.slice(0, limit) : scored.slice(0, limit)
}

async function resolveProject(sessionKey, payload) {
  const session = await getSessionState(sessionKey)
  const directId = String(payload?.projectId ?? '').trim()
  if (directId) {
    const projects = await listProjects()
    const match = (projects ?? []).find((project) => String(project?.id ?? '') === directId)
    if (!match) {
      throw new Error(`Project not found: ${directId}`)
    }
    return {
      projectId: directId,
      projectName: String(match?.name ?? ''),
      session,
    }
  }

  if (session.activeProjectId) {
    return {
      projectId: session.activeProjectId,
      projectName: session.activeProjectName,
      session,
    }
  }

  const projects = await listProjects()
  if (Array.isArray(projects) && projects.length === 1) {
    return {
      projectId: String(projects[0]?.id ?? ''),
      projectName: String(projects[0]?.name ?? ''),
      session,
      autoSelected: true,
    }
  }

  return {
    projectId: null,
    projectName: null,
    session,
  }
}

async function getProjectCurrent(sessionKey) {
  const session = await getSessionState(sessionKey)
  if (!session.activeProjectId) {
    return {
      ok: true,
      session,
      project: null,
    }
  }

  const context = await convexQuery('sdk/api:contextGet', {
    projectId: session.activeProjectId,
    packs: ['project'],
  })

  return {
    ok: true,
    session,
    project: context?.project ?? null,
  }
}

async function ensureChatRun(projectId, session) {
  if (session.conversationId && session.chatRunId) {
    return {
      conversationId: session.conversationId,
      runId: session.chatRunId,
      reused: true,
    }
  }

  const conversationId = await convexMutation('sdk/api:createConversation', {
    projectId,
    title: 'Telegram Studio Assistant',
  })
  const started = await convexMutation('sdk/api:startRun', {
    projectId,
    conversationId,
    mode: 'chat',
  })

  return {
    conversationId,
    runId: started?.runId,
    reused: false,
  }
}

async function getRunRecord(conversationId, runId) {
  const runs = await convexQuery('sdk/api:listRuns', {
    conversationId,
  })
  const allRuns = Array.isArray(runs) ? runs : []
  return allRuns.find((run) => String(run?._id ?? '') === String(runId)) ?? null
}

async function getLatestAssistantMessage(conversationId, runId) {
  const messages = await convexQuery('sdk/api:listMessages', {
    conversationId,
    runId,
    limit: 20,
  })
  const ordered = Array.isArray(messages) ? [...messages].reverse() : []
  const latest = ordered.find((message) => message?.role === 'assistant') ?? null
  if (!latest) return null
  return {
    text: String(latest?.text ?? '').trim(),
    blocks: Array.isArray(latest?.blocks) ? latest.blocks : [],
    createdAt: Number(latest?.createdAt ?? 0),
  }
}

async function reviewChangeSet(projectId, changeSetId) {
  const [changeSet, review] = await Promise.all([
    convexQuery('changeSets:get', { id: changeSetId }),
    convexAction('sdk/changeset:review', {
      projectId,
      changeSetId,
    }),
  ])
  return {
    changeSet,
    review,
    policy: evaluateChangeSetPolicy(changeSet, review),
  }
}

async function getPlanningQuestionBatch(runId, setIndex) {
  const result = await convexQuery('sdk/projectPlanning:getQuestionSets', {
    runId,
    setIndex,
  })
  return {
    raw: result,
    batch: compactQuestionBatch(result, setIndex),
  }
}

function hasExistingProjectContext(context) {
  const project = context?.project ?? {}
  const descriptiveText = [
    project?.description,
    project?.notes,
    project?.summary,
    project?.overviewSummary,
    context?.knowledgeDoc,
  ]
    .map((value) => String(value ?? '').trim())
    .filter(Boolean)
    .join('\n')

  return (
    (Array.isArray(context?.elements) && context.elements.length > 0) ||
    (Array.isArray(context?.tasks) && context.tasks.length > 0) ||
    descriptiveText.length > 0
  )
}

async function opProjectSearch(payload) {
  const sessionKey = resolveSessionKey(payload)
  const matches = await searchProjects(payload?.query ?? '', payload?.limit ?? 5)
  return {
    ok: true,
    sessionKey,
    query: String(payload?.query ?? ''),
    matches,
  }
}

async function opProjectSelect(payload) {
  const sessionKey = resolveSessionKey(payload)
  let selected = null

  if (payload?.projectId) {
    const projects = await listProjects()
    selected = (projects ?? []).find((project) => String(project?.id ?? '') === String(payload.projectId))
  } else if (payload?.query) {
    const matches = await searchProjects(payload.query, 5)
    if (matches.length === 1) {
      selected = matches[0]
    } else {
      return {
        ok: false,
        reason: matches.length === 0 ? 'no_match' : 'ambiguous',
        matches,
      }
    }
  }

  if (!selected) {
    return {
      ok: false,
      reason: 'missing_selection',
    }
  }

  const session = await resetProjectScopedState(sessionKey, {
    activeProjectId: String(selected.id),
    activeProjectName: String(selected.name ?? ''),
  })

  return {
    ok: true,
    selected: {
      id: String(selected.id),
      name: String(selected.name ?? ''),
      status: String(selected.status ?? ''),
    },
    session,
  }
}

async function opProjectCurrent(payload) {
  const sessionKey = resolveSessionKey(payload)
  return getProjectCurrent(sessionKey)
}

async function opContextGet(payload) {
  const sessionKey = resolveSessionKey(payload)
  const resolved = await resolveProject(sessionKey, payload)
  if (!resolved.projectId) {
    return {
      ok: false,
      reason: 'needs_project',
    }
  }

  const packs = Array.isArray(payload?.packs) && payload.packs.length > 0
    ? payload.packs
    : ['project', 'elements', 'tasks', 'knowledge', 'qa']

  const [context, counts, session] = await Promise.all([
    convexQuery('sdk/api:contextGet', {
      projectId: resolved.projectId,
      packs,
    }),
    convexQuery('sdk/api:contextGetCounts', {
      projectId: resolved.projectId,
    }),
    updateSessionState(sessionKey, {
      activeProjectId: resolved.projectId,
      activeProjectName: resolved.projectName ?? null,
    }),
  ])

  return {
    ok: true,
    projectId: resolved.projectId,
    packs,
    counts,
    context,
    session,
  }
}

async function opChatRunStartOrContinue(payload) {
  const sessionKey = resolveSessionKey(payload)
  const resolved = await resolveProject(sessionKey, payload)

  if (!resolved.projectId) {
    return {
      ok: false,
      status: 'needs_project',
      matches: await searchProjects(payload?.query ?? '', 5),
      session: resolved.session,
    }
  }

  const ensured = await ensureChatRun(resolved.projectId, resolved.session)
  let session = await updateSessionState(sessionKey, {
    activeProjectId: resolved.projectId,
    activeProjectName: resolved.projectName ?? null,
    conversationId: ensured.conversationId,
    chatRunId: ensured.runId,
    mode: 'free_chat',
  })

  const userText = String(payload?.userText ?? '').trim()
  if (!userText) {
    return {
      ok: false,
      reason: 'missing_user_text',
      session,
    }
  }

  const result = await convexAction('sdk/dispatch:runNext', {
    projectId: resolved.projectId,
    conversationId: ensured.conversationId,
    runId: ensured.runId,
    userMessage: userText,
  })

  const run = await getRunRecord(ensured.conversationId, ensured.runId)
  const latestAssistant = await getLatestAssistantMessage(ensured.conversationId, ensured.runId)

  let changeSetReview = null
  let autoApproved = false

  if (run?.status === 'awaiting_approval' && run?.pendingChangeSetId) {
    changeSetReview = await reviewChangeSet(resolved.projectId, run.pendingChangeSetId)
    session = await updateSessionState(sessionKey, {
      mode: 'awaiting_approval',
      pendingChangeSetId: run.pendingChangeSetId,
      approvalToken: String(run.approvalToken ?? '') || null,
    })

    const autoApproveAllowed =
      payload?.autoApprove !== false &&
      String(process.env.STUDIO_AGENT_AUTO_APPROVE ?? 'true').toLowerCase() !== 'false'

    if (autoApproveAllowed && run?.approvalToken && changeSetReview.policy.autoApplyEligible) {
      await convexAction('sdk/api:approveChangeSet', {
        runId: ensured.runId,
        approvalToken: run.approvalToken,
      })
      autoApproved = true
      session = await updateSessionState(sessionKey, {
        mode: 'free_chat',
        pendingChangeSetId: null,
        approvalToken: null,
      })
    }
  } else if (session.pendingChangeSetId || session.approvalToken) {
    session = await updateSessionState(sessionKey, {
      mode: 'free_chat',
      pendingChangeSetId: null,
      approvalToken: null,
    })
  }

  return {
    ok: true,
    status: autoApproved ? 'auto_applied' : String(result?.status ?? run?.status ?? 'success'),
    projectId: resolved.projectId,
    conversationId: ensured.conversationId,
    runId: ensured.runId,
    latestAssistant,
    pendingChangeSetId: autoApproved ? null : run?.pendingChangeSetId ?? null,
    changeSetReview,
    autoApproved,
    output: result?.output ?? result,
    session,
  }
}

async function opPlanningRunStart(payload) {
  const sessionKey = resolveSessionKey(payload)
  const resolved = await resolveProject(sessionKey, payload)
  if (!resolved.projectId) {
    return { ok: false, status: 'needs_project', session: resolved.session }
  }

  if (!payload?.forceNew && resolved.session.planningRunId) {
    const existing = await getPlanningQuestionBatch(
      resolved.session.planningRunId,
      resolved.session.questionSetIndex ?? 0
    )
    return {
      ok: true,
      status: 'resumed',
      runId: resolved.session.planningRunId,
      conversationId: resolved.session.planningConversationId,
      questionBatch: existing.batch,
      session: resolved.session,
    }
  }

  const context = await convexQuery('sdk/api:contextGet', {
    projectId: resolved.projectId,
    packs: ['project', 'elements', 'tasks', 'knowledge', 'files'],
  })

  const brainDump = String(payload?.brainDump ?? '').trim()
  if (!brainDump && !hasExistingProjectContext(context)) {
    return {
      ok: false,
      status: 'needs_brief',
      promptHe: 'חסר הקשר בסיסי. שלח תיאור קצר של הפרויקט: מה בונים, איפה, מתי, ומה חשוב במיוחד.',
    }
  }

  let conversationId = null
  if (brainDump) {
    const seeded = await convexMutation('sdk/projectPlanning:submitBrainDump', {
      projectId: resolved.projectId,
      brainDump,
    })
    conversationId = seeded?.conversationId ?? null
  }

  const started = await convexAction('sdk/projectPlanning:initiatePlanning', cleanObject({
    projectId: resolved.projectId,
    conversationId,
  }))

  const questionSet = await getPlanningQuestionBatch(started?.runId, 0)
  const session = await updateSessionState(sessionKey, {
    activeProjectId: resolved.projectId,
    activeProjectName: resolved.projectName ?? null,
    mode: 'planning',
    planningStep: 'questions',
    planningConversationId: started?.conversationId ?? null,
    planningRunId: started?.runId ?? null,
    questionSetIndex: 0,
    lastQuestionBatch: questionSet.batch,
  })

  return {
    ok: true,
    status: 'started',
    projectId: resolved.projectId,
    conversationId: started?.conversationId ?? null,
    runId: started?.runId ?? null,
    questionBatch: questionSet.batch,
    session,
  }
}

async function opPlanningQuestionsNext(payload) {
  const sessionKey = resolveSessionKey(payload)
  const session = await getSessionState(sessionKey)
  const runId = String(payload?.runId ?? session.planningRunId ?? '').trim()
  if (!runId) {
    return { ok: false, reason: 'missing_planning_run', session }
  }

  const requestedIndex = Number.isInteger(payload?.setIndex)
    ? Number(payload.setIndex)
    : Number(session.questionSetIndex ?? 0)
  const questionSet = await getPlanningQuestionBatch(runId, requestedIndex)
  const nextSession = await updateSessionState(sessionKey, {
    mode: questionSet.batch ? 'planning' : 'planning_ready',
    planningStep: questionSet.batch ? 'questions' : 'ready_to_finalize',
    questionSetIndex: requestedIndex,
    lastQuestionBatch: questionSet.batch,
  })

  return {
    ok: true,
    runId,
    questionBatch: questionSet.batch,
    hasMore: Boolean(questionSet.raw?.hasMore),
    totalSets: Number(questionSet.raw?.totalSets ?? 0),
    session: nextSession,
  }
}

async function opPlanningAnswersSubmit(payload) {
  const sessionKey = resolveSessionKey(payload)
  const session = await getSessionState(sessionKey)
  const runId = String(payload?.runId ?? session.planningRunId ?? '').trim()
  if (!runId) {
    return { ok: false, reason: 'missing_planning_run', session }
  }

  const answers = Array.isArray(payload?.answers) ? payload.answers : []
  const normalizedAnswers = answers
    .map((item) => ({
      questionId: String(item?.questionId ?? '').trim(),
      answer: String(item?.answer ?? '').trim(),
    }))
    .filter((item) => item.questionId && item.answer)

  if (normalizedAnswers.length === 0 && !String(payload?.setNotes ?? '').trim()) {
    return { ok: false, reason: 'missing_answers', session }
  }

  await convexMutation('sdk/projectPlanning:submitAnswers', cleanObject({
    runId,
    answers: normalizedAnswers,
    setNotes: String(payload?.setNotes ?? '').trim() || undefined,
  }))

  const nextIndex = Number(session.questionSetIndex ?? 0) + 1
  const questionSet = await getPlanningQuestionBatch(runId, nextIndex)
  const readyToFinalize = !questionSet.batch
  const nextSession = await updateSessionState(sessionKey, {
    mode: readyToFinalize ? 'planning_ready' : 'planning',
    planningStep: readyToFinalize ? 'ready_to_finalize' : 'questions',
    questionSetIndex: nextIndex,
    lastQuestionBatch: questionSet.batch,
  })

  return {
    ok: true,
    submittedCount: normalizedAnswers.length,
    nextQuestionBatch: questionSet.batch,
    readyToFinalize,
    session: nextSession,
  }
}

async function opPlanningFinalize(payload) {
  const sessionKey = resolveSessionKey(payload)
  const session = await getSessionState(sessionKey)
  const projectId = String(payload?.projectId ?? session.activeProjectId ?? '').trim()
  const runId = String(payload?.runId ?? session.planningRunId ?? '').trim()
  const conversationId = String(payload?.conversationId ?? session.planningConversationId ?? '').trim()
  if (!projectId || !runId || !conversationId) {
    return { ok: false, reason: 'missing_finalize_context', session }
  }

  const planningMode = payload?.planningMode === 'combined' ? 'combined' : 'separated'
  const result = await convexAction('sdk/projectPlanning:finalizeProject', {
    projectId,
    runId,
    conversationId,
    planningMode,
  })
  const progress = await convexQuery('sdk/projectPlanning:getFinalizationProgress', { runId })
  const nextSession = await updateSessionState(sessionKey, {
    mode: 'planning',
    planningStep: 'finalizing',
  })

  return {
    ok: true,
    status: 'finalizing',
    runId,
    conversationId,
    planningMode,
    progress,
    result,
    session: nextSession,
  }
}

async function opChangeSetListPending(payload) {
  const sessionKey = resolveSessionKey(payload)
  const resolved = await resolveProject(sessionKey, payload)
  if (!resolved.projectId) return { ok: false, reason: 'needs_project' }

  const items = await convexQuery('changeSets:listForProject', {
    projectId: resolved.projectId,
    statuses: ['PROPOSED'],
    limit: Number(payload?.limit ?? 20),
  })

  return {
    ok: true,
    projectId: resolved.projectId,
    pendingChangeSetId: resolved.session.pendingChangeSetId ?? null,
    items,
  }
}

async function opChangeSetCompile(payload) {
  const sessionKey = resolveSessionKey(payload)
  const resolved = await resolveProject(sessionKey, payload)
  if (!resolved.projectId) return { ok: false, reason: 'needs_project' }

  const runId = String(
    payload?.runId ??
    resolved.session.chatRunId ??
    resolved.session.planningRunId ??
    ''
  ).trim() || undefined

  const intents = Array.isArray(payload?.intents) ? payload.intents : []
  const result = await convexAction('sdk/changeset:compile', cleanObject({
    projectId: resolved.projectId,
    intents,
    deterministic: payload?.deterministic === true || undefined,
    runId,
    conversationId: resolved.session.conversationId ?? resolved.session.planningConversationId ?? undefined,
  }))

  const reviewed = await reviewChangeSet(resolved.projectId, result?.changeSetId)
  return {
    ok: true,
    projectId: resolved.projectId,
    result,
    review: reviewed.review,
    policy: reviewed.policy,
  }
}

async function opChangeSetReview(payload) {
  const sessionKey = resolveSessionKey(payload)
  const resolved = await resolveProject(sessionKey, payload)
  if (!resolved.projectId) return { ok: false, reason: 'needs_project' }

  const changeSetId = String(payload?.changeSetId ?? resolved.session.pendingChangeSetId ?? '').trim()
  if (!changeSetId) return { ok: false, reason: 'missing_changeset' }

  const reviewed = await reviewChangeSet(resolved.projectId, changeSetId)
  return {
    ok: true,
    projectId: resolved.projectId,
    changeSetId,
    changeSet: reviewed.changeSet,
    review: reviewed.review,
    policy: reviewed.policy,
  }
}

async function opChangeSetApply(payload) {
  const sessionKey = resolveSessionKey(payload)
  const session = await getSessionState(sessionKey)
  const pendingChangeSetId = String(payload?.changeSetId ?? session.pendingChangeSetId ?? '').trim()
  if (!pendingChangeSetId) return { ok: false, reason: 'missing_changeset', session }

  if (session.chatRunId && session.approvalToken && pendingChangeSetId === session.pendingChangeSetId) {
    await convexAction('sdk/api:approveChangeSet', {
      runId: session.chatRunId,
      approvalToken: session.approvalToken,
    })
  } else {
    await convexMutation('changeSets:applyChangeSet', { changeSetId: pendingChangeSetId })
  }

  const nextSession = await updateSessionState(sessionKey, {
    mode: 'free_chat',
    pendingChangeSetId: null,
    approvalToken: null,
  })

  return {
    ok: true,
    applied: pendingChangeSetId,
    session: nextSession,
  }
}

async function opChangeSetDiscard(payload) {
  const sessionKey = resolveSessionKey(payload)
  const session = await getSessionState(sessionKey)
  const changeSetId = String(payload?.changeSetId ?? session.pendingChangeSetId ?? '').trim()
  if (!changeSetId) return { ok: false, reason: 'missing_changeset', session }

  if (session.chatRunId && session.conversationId && changeSetId === session.pendingChangeSetId) {
    await convexAction('sdk/dispatch:runNext', {
      projectId: session.activeProjectId,
      conversationId: session.conversationId,
      runId: session.chatRunId,
      userMessage: 'no',
    })
  } else {
    await convexMutation('changeSets:discardChangeSet', { changeSetId })
  }

  const nextSession = await updateSessionState(sessionKey, {
    mode: 'free_chat',
    pendingChangeSetId: null,
    approvalToken: null,
  })

  return {
    ok: true,
    discarded: changeSetId,
    session: nextSession,
  }
}

async function opWebSearch(payload) {
  const result = await tavilySearch({
    query: payload?.query,
    maxResults: payload?.maxResults ?? 5,
    topic: payload?.topic ?? 'general',
    days: payload?.days ?? 30,
  })
  return {
    ok: true,
    ...result,
  }
}

async function opKnowledgeRefresh(payload) {
  const sessionKey = resolveSessionKey(payload)
  const resolved = await resolveProject(sessionKey, payload)
  if (!resolved.projectId) return { ok: false, reason: 'needs_project' }

  const result = await convexAction('sdk/knowledge:summarizeOrUpdate', {
    projectId: resolved.projectId,
    newFacts: Array.isArray(payload?.newFacts) ? payload.newFacts.map((item) => String(item)) : [],
    userText: String(payload?.userText ?? '').trim() || undefined,
    runId: resolved.session.chatRunId ?? resolved.session.planningRunId ?? undefined,
    conversationId:
      resolved.session.conversationId ??
      resolved.session.planningConversationId ??
      undefined,
  })

  return {
    ok: true,
    projectId: resolved.projectId,
    result,
  }
}

const operations = {
  'project.search': opProjectSearch,
  'project.select': opProjectSelect,
  'project.current': opProjectCurrent,
  'context.get': opContextGet,
  'chat.run.start_or_continue': opChatRunStartOrContinue,
  'planning.run.start': opPlanningRunStart,
  'planning.questions.next': opPlanningQuestionsNext,
  'planning.answers.submit': opPlanningAnswersSubmit,
  'planning.finalize': opPlanningFinalize,
  'changeset.list_pending': opChangeSetListPending,
  'changeset.compile': opChangeSetCompile,
  'changeset.review': opChangeSetReview,
  'changeset.apply': opChangeSetApply,
  'changeset.discard': opChangeSetDiscard,
  'web.search': opWebSearch,
  'knowledge.refresh': opKnowledgeRefresh,
  'meta.contracts': async () => ({
    ok: true,
    ...listContracts(),
  }),
}

async function main() {
  const [, , operation, rawPayload] = process.argv
  if (!operation || operation === '--help' || operation === '-h') {
    printUsage()
    return
  }

  const handler = operations[operation]
  if (!handler) {
    throw new Error(`Unsupported operation: ${operation}`)
  }

  const payload = parsePayload(rawPayload)
  const result = await handler(payload)
  console.log(JSON.stringify(result, null, 2))
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        ok: false,
        error: String(error?.message ?? error),
      },
      null,
      2
    )
  )
  process.exitCode = 1
})
