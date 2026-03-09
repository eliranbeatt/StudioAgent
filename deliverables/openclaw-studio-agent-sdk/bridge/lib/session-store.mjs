import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

import {
  createDefaultSessionState,
  normalizeSessionState,
  storeSchema,
} from './contracts.mjs'

function resolveStorePath() {
  const configured = process.env.STUDIO_AGENT_STATE_PATH
  return path.resolve(configured || './.state/session-store.json')
}

async function ensureParentDir(filePath) {
  await mkdir(path.dirname(filePath), { recursive: true })
}

async function readStore() {
  const filePath = resolveStorePath()
  try {
    const raw = await readFile(filePath, 'utf8')
    return storeSchema.parse(JSON.parse(raw))
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return storeSchema.parse({})
    }
    throw error
  }
}

async function writeStore(store) {
  const filePath = resolveStorePath()
  await ensureParentDir(filePath)
  await writeFile(filePath, JSON.stringify(storeSchema.parse(store), null, 2))
}

export async function getSessionState(sessionKey = 'default') {
  const key = String(sessionKey || 'default')
  const store = await readStore()
  return normalizeSessionState(store.sessions[key] ?? createDefaultSessionState())
}

export async function updateSessionState(sessionKey = 'default', updater) {
  const key = String(sessionKey || 'default')
  const store = await readStore()
  const current = normalizeSessionState(store.sessions[key] ?? createDefaultSessionState())
  const patch = typeof updater === 'function' ? updater(current) : updater
  const next = normalizeSessionState({
    ...current,
    ...(patch ?? {}),
  })
  store.sessions[key] = next
  await writeStore(store)
  return next
}

export async function resetProjectScopedState(sessionKey = 'default', projectPatch = {}) {
  return updateSessionState(sessionKey, (current) => ({
    ...current,
    ...projectPatch,
    mode: 'free_chat',
    planningStep: null,
    pendingChangeSetId: null,
    approvalToken: null,
    conversationId: null,
    chatRunId: null,
    planningConversationId: null,
    planningRunId: null,
    questionSetIndex: 0,
    lastQuestionBatch: null,
  }))
}
