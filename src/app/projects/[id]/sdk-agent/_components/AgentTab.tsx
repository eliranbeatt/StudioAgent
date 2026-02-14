'use client'

import { useAction, useMutation, useQuery } from 'convex/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../../../../../../convex/_generated/api'
import { Id } from '../../../../../../convex/_generated/dataModel'
import { Send } from 'lucide-react'
import { ChatBlock } from '../../agent/_components/Blocks/ChatBlock'
import { ChangeSetBlock } from '../../agent/_components/Blocks/ChangeSetBlock'
import { ReviewBlock } from '../../agent/_components/Blocks/ReviewBlock'
import ChangeSetReviewDrawer from '../../agent/_components/ChangeSetReviewDrawer'
import { ConversationsSidebar } from '../../_components/ConversationsSidebar'
import { FlowElementsHealthPanel } from '../../flow-agent/_components/FlowElementsHealthPanel'
import { SdkQuestionsBlock } from './SdkQuestionsBlock'
import { SdkChangeSetsTray } from './SdkChangeSetsTray'
import { SdkSuggestionBlock } from './SdkSuggestionBlock'
import { BlocksPanelV2 } from './BlocksPanelV2'

type SuggestionItem = {
  id: string
  labelHe: string
  actionKey: string
}

type QuestionsState = {
  yesNo: 'yes' | 'no' | null
  multiSelectedIds: string[]
  multiOptions: SuggestionItem[]
  yesNoQuestionHe: string
  multiQuestionHe: string
}

type BlocksV2State = {
  suggestions: {
    items: SuggestionItem[]
    selectedIds: string[]
  }
  questions: QuestionsState
  chatDraft: string
}

const EMPTY_BLOCKS_STATE: BlocksV2State = {
  suggestions: {
    items: [],
    selectedIds: [],
  },
  questions: {
    yesNo: null,
    multiSelectedIds: [],
    multiOptions: [],
    yesNoQuestionHe: 'האם נמשיך עם הכיוון הזה?',
    multiQuestionHe: 'מה חשוב לטפל עכשיו?',
  },
  chatDraft: '',
}

const TURN_REQUEST_TIMEOUT_MS = 45000

function timeoutError(label: string) {
  return new Error(`${label} request timed out after ${Math.round(TURN_REQUEST_TIMEOUT_MS / 1000)}s`)
}

async function withTimeout<T>(promise: Promise<T>, label: string) {
  let timer: ReturnType<typeof setTimeout> | null = null
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(timeoutError(label)), TURN_REQUEST_TIMEOUT_MS)
  })
  try {
    return await Promise.race([promise, timeoutPromise])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

function parseUiErrorMessage(error: unknown) {
  const value =
    (error as any)?.data?.message ??
    (error as any)?.message ??
    (typeof error === 'string' ? error : '')
  return String(value ?? '').trim()
}

function isInFlightDisconnectError(error: unknown) {
  const message = parseUiErrorMessage(error).toLowerCase()
  return message.includes('connection lost while action was in flight')
}

function isRequestTimeoutError(error: unknown) {
  const message = parseUiErrorMessage(error).toLowerCase()
  return message.includes('request timed out')
}

function extractQuestionText(question: any) {
  return String(
    question?.textHe ??
    question?.text_he ??
    question?.text ??
    question?.questionHe ??
    question?.question_he ??
    question?.question ??
    question?.labelHe ??
    question?.label ??
    ''
  ).trim()
}

function extractOptions(question: any): SuggestionItem[] {
  const raw = question?.optionsHe ?? question?.options_he ?? question?.options
  if (!Array.isArray(raw)) return []
  const out: SuggestionItem[] = []
  for (let i = 0; i < raw.length; i += 1) {
    const item = raw[i]
    const label = String(item?.labelHe ?? item?.label ?? item?.value ?? item ?? '').trim()
    if (!label) continue
    out.push({
      id: String(item?.value ?? item?.id ?? `opt_${i + 1}`).trim() || `opt_${i + 1}`,
      labelHe: label,
      actionKey: String(item?.value ?? item?.id ?? `opt_${i + 1}`).trim() || `opt_${i + 1}`,
    })
  }
  return out
}

function normalizeSuggestions(block: any): SuggestionItem[] {
  const source = Array.isArray(block?.suggestions)
    ? block.suggestions
    : Array.isArray(block?.items)
      ? block.items
      : []
  const out: SuggestionItem[] = []
  for (let i = 0; i < source.length; i += 1) {
    const item = source[i]
    const label = String(item?.labelHe ?? item?.label_he ?? item?.label ?? item?.text ?? item?.title ?? item?.description ?? '').trim()
    if (!label) continue
    out.push({
      id: String(item?.id ?? item?.actionKey ?? item?.payload?.action ?? `s_${i + 1}`),
      labelHe: label,
      actionKey: String(item?.actionKey ?? item?.payload?.action ?? item?.id ?? `action_${i + 1}`),
    })
    if (out.length >= 3) break
  }
  return out
}

function normalizeQuestions(block: any): {
  yesNoQuestionHe: string
  multiQuestionHe: string
  multiOptions: SuggestionItem[]
} | null {
  const questions = Array.isArray(block?.questions) ? block.questions : []
  const q1 = questions[0] ?? null
  const q2 = questions[1] ?? null

  const q1Text = extractQuestionText(q1)
  const q2Text = extractQuestionText(q2)
  const q2Options = extractOptions(q2)
  const fallbackOptions = extractOptions(q1)
  const multiOptions = (q2Options.length > 0 ? q2Options : fallbackOptions).slice(0, 6)
  if (!q1Text && !q2Text && multiOptions.length === 0) return null

  return {
    yesNoQuestionHe: q1Text || q2Text || 'Continue?',
    multiQuestionHe: q2Text || q1Text || 'What should we handle next?',
    multiOptions,
  }
}

export function AgentTab({ projectId }: { projectId: Id<'projects'> }) {
  const sdkApi = (api as any)['sdk/api'] ?? (api as any).sdk?.api
  const listConversationsQuery = sdkApi?.listChatConversations ?? sdkApi?.listConversations
  const [conversationId, setConversationId] = useState<Id<'agentConversations'> | null>(null)
  const [reviewChangeSetId, setReviewChangeSetId] = useState<Id<'changeSets'> | null>(null)
  const [isDispatching, setIsDispatching] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const [trayBusyId, setTrayBusyId] = useState<string | null>(null)
  const [blocksState, setBlocksState] = useState<BlocksV2State>(EMPTY_BLOCKS_STATE)
  const creatingConversationRef = useRef(false)
  const creatingRunForRef = useRef<string | null>(null)
  const endRef = useRef<HTMLDivElement>(null)

  const featureFlags = useQuery(api.featureFlags.getAll)
  const blocksV2Enabled = Boolean(featureFlags?.ff_blocks_v2)

  const conversations = useQuery(listConversationsQuery, projectId ? { projectId } : 'skip')

  const createConversation = useMutation(api.sdk.api.createConversation)
  const renameConversation = useMutation(api.sdk.api.renameConversation)
  const deleteConversation = useMutation(api.sdk.api.deleteConversation)
  const startRun = useMutation(api.sdk.api.startRun)
  const runNext = useAction(api.sdk.dispatch.runNext)
  const submitTurn = useAction((api as any).agentTurns.submitTurn)
  const approveChangeSet = useAction(api.sdk.api.approveChangeSet)
  const generateTitle = useAction(api.sdk.api.generateConversationTitle)
  const applyChangeSet = useMutation(api.changeSets.applyChangeSet)
  const discardChangeSet = useMutation(api.changeSets.discardChangeSet)
  const listChangeSetsQuery = (api as any).changeSets?.listForProject

  const effectiveConversationId =
    conversationId ?? (conversations && conversations.length > 0 ? conversations[0]._id : null)

  const runs = useQuery(api.sdk.api.listRuns, effectiveConversationId ? { conversationId: effectiveConversationId } : 'skip')
  const chatRuns = useMemo(() => (runs ?? []).filter((run: any) => run.runMode === 'CHAT_EDIT'), [runs])
  const activeRun = chatRuns[0] ?? null

  const messages = useQuery(
    api.sdk.api.listMessages,
    effectiveConversationId && activeRun ? { conversationId: effectiveConversationId, runId: activeRun._id, limit: 100 } : 'skip'
  )

  const trayItems = useQuery(listChangeSetsQuery ?? 'skip', projectId && listChangeSetsQuery ? { projectId, limit: 80 } : 'skip')

  /* scan history for the most recent interactive blocks instead of just the last message */
  const latestSuggestions = useMemo(() => {
    const all = Array.isArray(messages) ? messages : []
    for (let i = all.length - 1; i >= 0; i -= 1) {
      const msg = all[i]
      if (msg?.role !== 'assistant') continue
      const blocks = Array.isArray(msg?.blocks) ? msg.blocks : []
      for (const rawBlock of blocks) {
        const block = normalizeBlock(rawBlock)
        if (block?.type === 'SuggestionBlock' || block?.type === 'SuggestionsBlock') {
          return normalizeSuggestions(block)
        }
      }
    }
    return []
  }, [messages])

  const latestQuestions = useMemo(() => {
    const all = Array.isArray(messages) ? messages : []
    for (let i = all.length - 1; i >= 0; i -= 1) {
      const msg = all[i]
      if (msg?.role !== 'assistant') continue
      const blocks = Array.isArray(msg?.blocks) ? msg.blocks : []
      for (const rawBlock of blocks) {
        const block = normalizeBlock(rawBlock)
        if (block?.type === 'QuestionsBlock') {
          return normalizeQuestions(block)
        }
      }
    }
    return null
  }, [messages])

  const blocksSignature = useMemo(() => {
    const suggestionPart = latestSuggestions.map((item) => item.id).join('|')
    const questionPart = latestQuestions
      ? `${latestQuestions.yesNoQuestionHe}|${latestQuestions.multiQuestionHe}|${latestQuestions.multiOptions
        .map((item) => item.id)
        .join('|')}`
      : ''
    return `${suggestionPart}::${questionPart}`
  }, [latestSuggestions, latestQuestions])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isDispatching])

  useEffect(() => {
    if (!blocksV2Enabled) return
    setBlocksState((prev) => ({
      ...prev,
      suggestions: {
        items: latestSuggestions,
        selectedIds: [],
      },
      questions: {
        yesNo: null,
        multiSelectedIds: [],
        multiOptions: latestQuestions?.multiOptions ?? [],
        yesNoQuestionHe: latestQuestions?.yesNoQuestionHe ?? 'האם נמשיך עם הכיוון הזה?',
        multiQuestionHe: latestQuestions?.multiQuestionHe ?? 'מה חשוב לטפל עכשיו?',
      },
    }))
  }, [blocksV2Enabled, blocksSignature, latestSuggestions, latestQuestions])

  const handleCreateConversation = useCallback(async () => {
    const id = await createConversation({ projectId, title: 'New Session' })
    setConversationId(id)
    await startRun({ projectId, conversationId: id, mode: 'chat' })
  }, [createConversation, projectId, startRun])

  useEffect(() => {
    if (conversations === undefined) return
    if (conversationId && conversations.some((item: any) => item._id === conversationId)) return
    if (conversations.length > 0) {
      setConversationId(conversations[0]._id)
      return
    }
    if (!creatingConversationRef.current) {
      creatingConversationRef.current = true
      void handleCreateConversation().finally(() => {
        creatingConversationRef.current = false
      })
    }
  }, [conversations, conversationId, handleCreateConversation])

  useEffect(() => {
    if (!effectiveConversationId || runs === undefined) return
    if (chatRuns.length > 0) return
    if (creatingRunForRef.current === effectiveConversationId) return
    creatingRunForRef.current = effectiveConversationId
    void startRun({ projectId, conversationId: effectiveConversationId, mode: 'chat' }).finally(() => {
      creatingRunForRef.current = null
    })
  }, [chatRuns, effectiveConversationId, projectId, runs, startRun])

  const hasStagedSelections =
    blocksState.suggestions.selectedIds.length > 0 ||
    blocksState.questions.yesNo !== null ||
    blocksState.questions.multiSelectedIds.length > 0

  const runStatus = activeRun?.status
  const canSend = Boolean(activeRun) && runStatus !== 'completed' && runStatus !== 'cancelled' && runStatus !== 'failed'

  const resetStagedSelections = () => {
    setBlocksState((prev) => ({
      ...prev,
      suggestions: {
        ...prev.suggestions,
        selectedIds: [],
      },
      questions: {
        ...prev.questions,
        yesNo: null,
        multiSelectedIds: [],
      },
      chatDraft: '',
    }))
  }

  const sendUserTurn = async () => {
    if (!effectiveConversationId || !activeRun) return
    const trimmed = blocksState.chatDraft.trim()
    if (!trimmed && !hasStagedSelections) return

    setSendError(null)
    setIsDispatching(true)
    try {
      if (blocksV2Enabled) {
        await withTimeout(
          submitTurn({
            projectId,
            conversationId: effectiveConversationId,
            runId: activeRun._id,
            stageId: String(activeRun.stageKey ?? 'chat'),
            messageText: trimmed,
            uiSelections: {
              suggestionIds: blocksState.suggestions.selectedIds,
              answers: {
                yesNo: blocksState.questions.yesNo,
                multiChoiceIds: blocksState.questions.multiSelectedIds,
              },
            },
            clientMeta: {
              uiVersion: 'blocks_v2',
              locale: 'he-IL',
              timestampMs: Date.now(),
            },
          }),
          'submitTurn'
        )
      } else {
        const messageWithQueued = buildMessageWithQueuedInput(trimmed || 'apply queued updates', blocksState)
        await withTimeout(
          runNext({
            projectId,
            conversationId: effectiveConversationId,
            runId: activeRun._id,
            userMessage: messageWithQueued,
          }),
          'runNext'
        )
      }
      resetStagedSelections()
    } catch (error) {
      if (isRequestTimeoutError(error)) {
        setSendError('The request is taking too long. The backend run may still be processing; check for a new assistant message or retry once.')
      } else if (isInFlightDisconnectError(error)) {
        setSendError('Connection dropped while the request was in flight. The action may still complete; wait a moment before retrying.')
      } else {
        const details = parseUiErrorMessage(error)
        setSendError(details || 'Failed to send message. Please try again.')
      }
    } finally {
      setIsDispatching(false)
    }
  }

  const handleRenameConversation = async (id: string, title: string) => {
    await renameConversation({ conversationId: id as Id<'agentConversations'>, title })
  }

  const handleGenerateTitle = async (id: string) => {
    await generateTitle({ conversationId: id as Id<'agentConversations'>, projectId })
  }

  const handleDeleteConversation = async (id: string) => {
    await deleteConversation({ conversationId: id as Id<'agentConversations'> })
    if (effectiveConversationId !== id) return
    const next = (conversations ?? []).find((item: any) => item._id !== id)
    if (next) {
      setConversationId(next._id)
      return
    }
    setConversationId(null)
  }

  const handleToggleSuggestion = (id: string) => {
    setBlocksState((prev) => {
      const selected = prev.suggestions.selectedIds.includes(id)
      return {
        ...prev,
        suggestions: {
          ...prev.suggestions,
          selectedIds: selected
            ? prev.suggestions.selectedIds.filter((item) => item !== id)
            : [...prev.suggestions.selectedIds, id],
        },
      }
    })
  }

  const handleSetYesNo = (value: 'yes' | 'no') => {
    setBlocksState((prev) => ({
      ...prev,
      questions: {
        ...prev.questions,
        yesNo: prev.questions.yesNo === value ? null : value,
      },
    }))
  }

  const handleToggleMulti = (id: string) => {
    setBlocksState((prev) => {
      const selected = prev.questions.multiSelectedIds.includes(id)
      return {
        ...prev,
        questions: {
          ...prev.questions,
          multiSelectedIds: selected
            ? prev.questions.multiSelectedIds.filter((item) => item !== id)
            : [...prev.questions.multiSelectedIds, id],
        },
      }
    })
  }

  const handleApplyChangeSet = async (changeSetId: Id<'changeSets'>) => {
    setTrayBusyId(changeSetId)
    try {
      const isPendingCurrent =
        activeRun?.status === 'awaiting_approval' &&
        activeRun?.pendingChangeSetId === changeSetId &&
        Boolean(activeRun?.approvalToken)
      if (isPendingCurrent) {
        await approveChangeSet({
          runId: activeRun!._id,
          approvalToken: activeRun!.approvalToken!,
        })
        return
      }
      await applyChangeSet({ changeSetId })
    } finally {
      setTrayBusyId(null)
    }
  }

  const handleDiscardChangeSet = async (changeSetId: Id<'changeSets'>) => {
    setTrayBusyId(changeSetId)
    try {
      const isPendingCurrent = activeRun?.status === 'awaiting_approval' && activeRun?.pendingChangeSetId === changeSetId
      if (isPendingCurrent) {
        if (effectiveConversationId && activeRun) {
          setIsDispatching(true)
          try {
            await runNext({
              projectId,
              conversationId: effectiveConversationId,
              runId: activeRun._id,
              userMessage: 'no',
            })
          } finally {
            setIsDispatching(false)
          }
        }
        return
      }
      await discardChangeSet({ changeSetId })
    } finally {
      setTrayBusyId(null)
    }
  }

  return (
    <div className='flex h-full bg-slate-50'>
      <ConversationsSidebar
        items={conversations as any}
        activeId={effectiveConversationId as string | null}
        onSelect={(id) => setConversationId(id as Id<'agentConversations'>)}
        onCreate={handleCreateConversation}
        onRename={handleRenameConversation}
        onGenerateTitle={handleGenerateTitle}
        onDelete={handleDeleteConversation}
        emptyLabel='No chat sessions yet'
      />

      <div className='flex-1 min-w-0 flex'>
        <div className='flex-1 flex flex-col min-w-0'>
          <div className='border-b border-slate-200 bg-white px-6 py-3 flex items-center justify-between'>
            <div>
              <div className='text-sm font-semibold text-slate-700'>Agent Orchestrator</div>
              <div className='text-xs text-slate-500'>Free chat agent with SDK tools and structured blocks</div>
            </div>
            {activeRun ? (
              <div className='text-xs text-slate-500'>
                Run {String(activeRun._id).slice(-6)} - {activeRun.status}
              </div>
            ) : null}
          </div>

          <div className='flex-1 overflow-y-auto p-6 space-y-6'>
            {!effectiveConversationId || !activeRun ? (
              <div className='text-xs text-slate-400'>Initializing chat session...</div>
            ) : !messages ? (
              <div className='text-xs text-slate-400'>Loading history...</div>
            ) : messages.length === 0 ? (
              <div className='text-center py-20'>
                <div className='text-sm font-semibold text-slate-700'>Agent Ready</div>
                <div className='text-xs text-slate-400 mt-1'>
                  Ask naturally. The orchestrator will decide when to chat, ask structured questions, or execute tools.
                </div>
              </div>
            ) : (
              messages.map((msg: any) => (
                <div key={msg._id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-3xl ${msg.role === 'user' ? 'bg-blue-600 text-white rounded-lg p-3 text-sm' : 'w-full'}`}>
                    {msg.role === 'user' ? (
                      <div className='whitespace-pre-wrap'>{msg.text}</div>
                    ) : (
                      <div className='space-y-4'>
                        {(msg.blocks ?? []).map((rawBlock: any, idx: number) => {
                          const block = normalizeBlock(rawBlock)
                          return (
                            <BlockRenderer
                              key={idx}
                              block={block}
                              blocksV2Enabled={blocksV2Enabled}
                              onReviewChangeSet={(id) => setReviewChangeSetId(id)}
                              onApplyChangeSet={(id) => id && void handleApplyChangeSet(id)}
                              onDiscardChangeSet={(id) => id && void handleDiscardChangeSet(id)}
                              blocksState={blocksState}
                              onStateChange={setBlocksState}
                              disabled={isDispatching || !canSend}
                            />
                          )
                        })}
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
            {isDispatching ? (
              <div className='flex justify-start'>
                <div className='bg-white rounded-lg p-3 text-sm border border-slate-100 shadow-sm flex items-center gap-3 text-slate-600'>
                  <div className='w-4 h-4 rounded-full border-2 border-slate-200 border-t-blue-600 animate-spin' />
                  <span>Agent is working...</span>
                </div>
              </div>
            ) : null}
            <div ref={endRef} />
          </div>

          {blocksV2Enabled ? (
            <BlocksPanelV2
              suggestions={blocksState.suggestions.items}
              questions={
                latestQuestions
                  ? {
                    yesNoQuestionHe: blocksState.questions.yesNoQuestionHe,
                    multiQuestionHe: blocksState.questions.multiQuestionHe,
                    multiOptions: blocksState.questions.multiOptions,
                  }
                  : null
              }
              selectedSuggestionIds={blocksState.suggestions.selectedIds}
              yesNo={blocksState.questions.yesNo}
              selectedMultiIds={blocksState.questions.multiSelectedIds}
              onToggleSuggestion={handleToggleSuggestion}
              onSetYesNo={handleSetYesNo}
              onToggleMulti={handleToggleMulti}
              disabled={isDispatching || !canSend}
            />
          ) : null}

          <div className='p-4 bg-white border-t border-slate-200'>
            {sendError ? (
              <div className='mb-2 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900'>
                {sendError}
              </div>
            ) : null}
            <div className='flex gap-2'>
              <textarea
                className='flex-1 border border-slate-300 rounded-lg p-3 text-sm focus:ring-2 focus:ring-blue-100 outline-none resize-none'
                rows={1}
                placeholder='Ask me anything about the project...'
                value={blocksState.chatDraft}
                onChange={(e) =>
                  setBlocksState((prev) => ({
                    ...prev,
                    chatDraft: e.target.value,
                  }))
                }
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    void sendUserTurn()
                  }
                }}
              />
              <button
                onClick={() => void sendUserTurn()}
                disabled={!canSend || (!blocksState.chatDraft.trim() && !hasStagedSelections) || isDispatching}
                className='bg-blue-600 text-white p-3 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed'
              >
                <Send size={18} />
              </button>
            </div>
          </div>
        </div>

        <aside className='hidden xl:flex w-[360px] border-l border-slate-200 bg-slate-50 flex-col h-full'>
          <div className='flex-1 min-h-0 border-b border-slate-200 p-4'>
            <FlowElementsHealthPanel projectId={projectId} />
          </div>
          <div className='flex-1 min-h-0 overflow-y-auto p-4'>
            <SdkChangeSetsTray
              items={(trayItems ?? []) as any}
              busy={trayBusyId}
              onReview={(id) => setReviewChangeSetId(id)}
              onApply={handleApplyChangeSet}
              onDiscard={handleDiscardChangeSet}
            />
          </div>
        </aside>
      </div>

      {reviewChangeSetId ? (
        <ChangeSetReviewDrawer
          open={true}
          onClose={() => setReviewChangeSetId(null)}
          changeSetId={reviewChangeSetId}
          projectId={projectId}
        />
      ) : null}

      {activeRun?.status === 'awaiting_approval' && activeRun.pendingChangeSetId ? (
        <div className='absolute bottom-20 right-4 border rounded-lg p-4 bg-amber-50 border-amber-200 shadow-lg max-w-sm'>
          <div className='text-xs font-semibold text-amber-700 uppercase tracking-wider mb-2'>Approval Required</div>
          <div className='text-sm text-amber-900 mb-3'>
            ChangeSet {String(activeRun.pendingChangeSetId).slice(-6)} is awaiting approval.
          </div>
          <button
            onClick={() =>
              approveChangeSet({
                runId: activeRun._id,
                approvalToken: activeRun.approvalToken ?? '',
              })
            }
            disabled={!activeRun.approvalToken}
            className='w-full px-3 py-2 rounded bg-amber-600 text-white text-xs hover:bg-amber-700 disabled:opacity-50'
          >
            Approve & Apply
          </button>
        </div>
      ) : null}
    </div>
  )
}

function normalizeBlock(block: any) {
  if (typeof block === 'string') {
    try {
      return normalizeBlock(JSON.parse(block))
    } catch {
      return block
    }
  }
  if (!block || typeof block !== 'object') return block
  if (!block.type) {
    if (block.QuestionsBlock) {
      const source = block.QuestionsBlock
      const questions = Array.isArray(source)
        ? source
        : source && typeof source === 'object'
          ? [source]
          : []
      return {
        type: 'QuestionsBlock',
        questions: questions
          .map((q: any, i: number) => {
            if (typeof q === 'string') return { id: `q${i}`, textHe: q }
            const textHe = String(q?.textHe ?? q?.text_he ?? q?.text ?? q?.questionHe ?? q?.question ?? '').trim()
            if (!textHe) return null
            return {
              ...q,
              id: String(q?.id ?? `q${i}`),
              textHe,
            }
          })
          .filter(Boolean),
      }
    }
    if (block.ChatBlock) {
      const source = block.ChatBlock
      const markdownHe = typeof source === 'string'
        ? source
        : String(source?.markdownHe ?? source?.text ?? source?.contentHe ?? '').trim()
      return { type: 'ChatBlock', markdownHe }
    }
    if (block.SuggestionBlock) return { type: 'SuggestionBlock', ...block.SuggestionBlock }
    if (block.SuggestionsBlock) {
      const source = block.SuggestionsBlock
      if (Array.isArray(source)) {
        return { type: 'SuggestionsBlock', suggestions: source }
      }
      return { type: 'SuggestionsBlock', ...source }
    }
    if (block.ChangeSetBlock) return { type: 'ChangeSetBlock', ...block.ChangeSetBlock }
  }
  if (block.type === 'ChatBlock' && block.contentHe && !block.markdownHe) {
    return { ...block, markdownHe: block.contentHe }
  }
  return block
}

function buildMessageWithQueuedInput(text: string, state: BlocksV2State) {
  const selectedActions = state.suggestions.selectedIds
    .map((id) => {
      const match = state.suggestions.items.find((item) => item.id === id)
      return String(match?.actionKey ?? id).trim()
    })
    .filter(Boolean)

  const payload = {
    suggestionDecision: selectedActions.length > 0 ? 'accepted' : null,
    answers: {
      yesNo: state.questions.yesNo === 'yes' ? true : state.questions.yesNo === 'no' ? false : null,
      choice: state.questions.multiSelectedIds[0] ?? null,
      clarify: state.questions.multiSelectedIds.length > 0 ? state.questions.multiSelectedIds.join(', ') : null,
    },
    suggestions: {
      actionPrimary: selectedActions[0] ?? null,
      actionSecondary: selectedActions[1] ?? null,
      changeSetAction: selectedActions.find((id) => id.toLowerCase().includes('changeset') || id === 'create_changeset') ?? null,
    },
    sentAt: Date.now(),
  }
  return `${text}\n\n[SDK_QUEUED_INPUT_V1]${JSON.stringify(payload)}[/SDK_QUEUED_INPUT_V1]`
}

function BlockRenderer({
  block,
  blocksV2Enabled,
  onReviewChangeSet,
  onApplyChangeSet,
  onDiscardChangeSet,
  blocksState,
  onStateChange,
  disabled,
}: {
  block: any
  blocksV2Enabled: boolean
  onReviewChangeSet: (id: Id<'changeSets'>) => void
  onApplyChangeSet: (id?: Id<'changeSets'>) => void
  onDiscardChangeSet: (id?: Id<'changeSets'>) => void
  blocksState: BlocksV2State
  onStateChange: (next: BlocksV2State | ((prev: BlocksV2State) => BlocksV2State)) => void
  disabled?: boolean
}) {
  if (!block) return null

  if (block.type === 'ChatBlock') return <ChatBlock block={block} />
  if (block.type === 'QuestionsBlock') {
    return (
      <SdkQuestionsBlock
        block={block}
        disabled={disabled}
        yesNo={blocksState.questions.yesNo}
        multiSelectedIds={blocksState.questions.multiSelectedIds}
        onSetYesNo={(value) =>
          onStateChange((prev) => ({
            ...prev,
            questions: {
              ...prev.questions,
              yesNo: prev.questions.yesNo === value ? null : value,
            },
          }))
        }
        onToggleMulti={(id) =>
          onStateChange((prev) => {
            const selected = prev.questions.multiSelectedIds.includes(id)
            return {
              ...prev,
              questions: {
                ...prev.questions,
                multiSelectedIds: selected
                  ? prev.questions.multiSelectedIds.filter((item) => item !== id)
                  : [...prev.questions.multiSelectedIds, id],
              },
            }
          })
        }
      />
    )
  }
  if (block.type === 'SuggestionBlock' || block.type === 'SuggestionsBlock') {
    return (
      <SdkSuggestionBlock
        block={block}
        disabled={disabled}
        selectedIds={blocksState.suggestions.selectedIds}
        onToggle={(id) =>
          onStateChange((prev) => {
            const selected = prev.suggestions.selectedIds.includes(id)
            return {
              ...prev,
              suggestions: {
                ...prev.suggestions,
                selectedIds: selected
                  ? prev.suggestions.selectedIds.filter((item) => item !== id)
                  : [...prev.suggestions.selectedIds, id],
              },
            }
          })
        }
      />
    )
  }
  if (block.type === 'ChangeSetBlock') {
    return (
      <ChangeSetBlock
        block={block}
        onApply={() => onApplyChangeSet(block.changeSetId)}
        onDiscard={() => onDiscardChangeSet(block.changeSetId)}
        onReview={() => block.changeSetId && onReviewChangeSet(block.changeSetId)}
      />
    )
  }
  if (block.type === 'ReviewBlock') return <ReviewBlock block={block} />

  return (
    <div className='text-xs border border-gray-200 bg-gray-50 p-2 rounded overflow-hidden'>
      <div className='text-[10px] text-gray-400 font-mono mb-1 uppercase'>{block.type}</div>
      <pre className='whitespace-pre-wrap font-mono text-gray-600'>{JSON.stringify(block, null, 2)}</pre>
    </div>
  )
}

