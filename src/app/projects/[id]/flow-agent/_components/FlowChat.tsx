'use client'

import { useAction, useMutation, useQuery } from 'convex/react'
import { useEffect, useRef, useState } from 'react'
import { api } from '../../../../../../convex/_generated/api'
import { Id } from '../../../../../../convex/_generated/dataModel'
import { ChatBlock } from '../../agent/_components/Blocks/ChatBlock'
import { QuestionsBlock } from '../../agent/_components/Blocks/QuestionsBlock'
import { SuggestionBlock } from '../../agent/_components/Blocks/SuggestionBlock'
import { ChangeSetBlock } from '../../agent/_components/Blocks/ChangeSetBlock'
import { ReviewBlock } from '../../agent/_components/Blocks/ReviewBlock'
import { ShoppingPlanBlock } from '../../agent/_components/Blocks/ShoppingPlanBlock'
import { PrintQaBlock } from '../../agent/_components/Blocks/PrintQaBlock'
import { ReceiptBlock } from '../../agent/_components/Blocks/ReceiptBlock'
import { RunbookBlock } from '../../agent/_components/Blocks/RunbookBlock'
import { DailyPlanBlock } from '../../agent/_components/Blocks/DailyPlanBlock'
import ChangeSetReviewDrawer from '../../agent/_components/ChangeSetReviewDrawer'
import { FlowGateBlock } from './Blocks/FlowGateBlock'
import { FlowBrainDumpBlock } from './Blocks/FlowBrainDumpBlock'
import { FlowChangeSetSummaryBlock } from './Blocks/FlowChangeSetSummaryBlock'

type Props = {
  conversationId: Id<'agentConversations'>
  projectId: Id<'projects'>
  flowRunId: Id<'flowRuns'>
}

export function FlowChat({ conversationId, projectId, flowRunId }: Props) {
  const messages = useQuery(api.flow.chat.listMessages, { conversationId })
  const sendMessage = useMutation(api.flow.chat.sendUserMessage)
  const [input, setInput] = useState('')
  const [reviewChangeSetId, setReviewChangeSetId] = useState<Id<'changeSets'> | null>(null)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = async () => {
    if (!input.trim()) return
    await sendMessage({ conversationId, text: input.trim() })
    setInput('')
  }

  return (
    <div className='flex flex-col h-full bg-slate-50'>
      <div className='flex-1 overflow-y-auto p-6 space-y-6'>
        {!messages ? (
          <div className='text-xs text-slate-400'>Loading chat...</div>
        ) : messages.length === 0 ? (
          <div className='text-center py-20'>
            <div className='text-sm font-semibold text-slate-700'>Ready to run Flow</div>
            <div className='text-xs text-slate-400 mt-1'>Start a run or add context below.</div>
          </div>
        ) : (
          messages.map((msg: any) => (
            <div key={msg._id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-2xl ${msg.role === 'user' ? 'bg-slate-900 text-white rounded-lg p-3 text-sm' : 'w-full'}`}>
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
                          conversationId={conversationId}
                          projectId={projectId}
                          flowRunId={flowRunId}
                          onReviewChangeSet={(id) => setReviewChangeSetId(id)}
                        />
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          ))
        )}
        <div ref={endRef} />
      </div>

      <div className='p-4 bg-white border-t border-slate-200'>
        <div className='flex gap-2'>
          <textarea
            className='flex-1 border border-slate-300 rounded-lg p-3 text-sm focus:ring-2 focus:ring-slate-100 outline-none resize-none'
            rows={1}
            placeholder='Type a message...'
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSend()
              }
            }}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim()}
            className='bg-slate-900 text-white px-4 rounded-lg hover:bg-black disabled:opacity-50 disabled:cursor-not-allowed text-sm'
          >
            Send
          </button>
        </div>
      </div>

      {reviewChangeSetId ? (
        <ChangeSetReviewDrawer
          open={true}
          onClose={() => setReviewChangeSetId(null)}
          changeSetId={reviewChangeSetId}
          projectId={projectId}
        />
      ) : null}
    </div>
  )
}

function BlockRenderer({
  block,
  conversationId,
  projectId,
  flowRunId,
  onReviewChangeSet,
}: {
  block: any
  conversationId: Id<'agentConversations'>
  projectId: Id<'projects'>
  flowRunId: Id<'flowRuns'>
  onReviewChangeSet: (id: Id<'changeSets'>) => void
}) {
  const applyChangeSet = useMutation(api.changeSets.applyChangeSet)
  const discardChangeSet = useMutation(api.changeSets.discardChangeSet)
  const sendMessageAndRun = useAction(api.skills.runner.sendMessageAndRun)

  if (block.type === 'FlowGateBlock') {
    return (
      <FlowGateBlock
        block={block}
        flowRunId={flowRunId}
        onOpenChangeSet={(id) => onReviewChangeSet(id)}
      />
    )
  }
  if (block.type === 'FlowBrainDumpBlock') {
    return <FlowBrainDumpBlock flowRunId={flowRunId} conversationId={conversationId} />
  }
  if (block.type === 'FlowChangeSetSummaryBlock') return <FlowChangeSetSummaryBlock block={block} />

  if (block.type === 'ChatBlock') return <ChatBlock block={block} />
  if (block.type === 'QuestionsBlock') {
    return <QuestionsBlock block={block} conversationId={conversationId} projectId={projectId} />
  }
  if (block.type === 'SuggestionBlock' || block.type === 'SuggestionsBlock') {
    return (
      <SuggestionBlock
        block={block}
        onSubmit={(text, payload) => {
          const skillId = payload?.targetSkillId ?? payload?.skillId ?? payload?.action
          sendMessageAndRun({
            projectId,
            conversationId,
            text,
            skillId: typeof skillId === 'string' ? skillId : undefined,
            params: payload?.params,
          })
        }}
      />
    )
  }
  if (block.type === 'ChangeSetBlock') {
    return (
      <ChangeSetBlock
        block={block}
        onApply={() => block.changeSetId && applyChangeSet({ changeSetId: block.changeSetId })}
        onDiscard={() => block.changeSetId && discardChangeSet({ changeSetId: block.changeSetId })}
        onReview={() => block.changeSetId && onReviewChangeSet(block.changeSetId)}
      />
    )
  }
  if (block.type === 'ReviewBlock') return <ReviewBlock block={block} />
  if (block.type === 'ShoppingPlanBlock') return <ShoppingPlanBlock block={block} />
  if (block.type === 'PrintQaBlock') return <PrintQaBlock block={block} />
  if (block.type === 'ReceiptBlock') return <ReceiptBlock block={block} />
  if (block.type === 'RunbookBlock') return <RunbookBlock block={block} projectId={projectId} />
  if (block.type === 'DailyPlanBlock') return <DailyPlanBlock block={block} />

  return (
    <div className='text-xs border border-gray-200 bg-gray-50 p-2 rounded overflow-hidden'>
      <div className='text-[10px] text-gray-400 font-mono mb-1 uppercase'>{block.type}</div>
      <pre className='whitespace-pre-wrap font-mono text-gray-600'>{JSON.stringify(block, null, 2)}</pre>
    </div>
  )
}

function normalizeBlock(block: any) {
  if (!block || typeof block !== 'object') return block
  if (!block.type) {
    if (block.QuestionsBlock && Array.isArray(block.QuestionsBlock)) {
      return {
        type: 'QuestionsBlock',
        questions: block.QuestionsBlock.map((q: any, i: number) =>
          typeof q === 'string' ? { id: `q${i}`, textHe: q } : q
        ),
      }
    }
    if (block.ChatBlock) return { type: 'ChatBlock', markdownHe: block.ChatBlock }
    if (block.SuggestionBlock) return { type: 'SuggestionBlock', ...block.SuggestionBlock }
    if (block.ChangeSetBlock) return { type: 'ChangeSetBlock', ...block.ChangeSetBlock }
  }
  return block
}
