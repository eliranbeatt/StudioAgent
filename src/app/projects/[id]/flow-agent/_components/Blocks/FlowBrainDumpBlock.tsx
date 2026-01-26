'use client'

import { useAction, useMutation } from 'convex/react'
import { useState } from 'react'
import { api } from '../../../../../../../convex/_generated/api'
import { Id } from '../../../../../../../convex/_generated/dataModel'

export function FlowBrainDumpBlock({
  flowRunId,
  conversationId,
}: {
  flowRunId: Id<'flowRuns'>
  conversationId: Id<'agentConversations'>
}) {
  const submitBrainDump = useAction((api as any).flow.chat.submitBrainDump)
  const sendUserMessage = useMutation((api as any).flow.chat.sendUserMessage)
  const [text, setText] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async () => {
    if (!text.trim() || isSubmitting) return
    setIsSubmitting(true)
    try {
      await submitBrainDump({ flowRunId, text })
      setText('')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className='rounded-xl border border-slate-200 bg-white p-4 shadow-sm'>
      <div className='text-xs font-semibold text-gray-900'>Brain dump</div>
      <div className='mt-1 text-[11px] text-gray-500'>Share any missing context or constraints.</div>
      <textarea
        className='mt-3 w-full min-h-[120px] rounded-md border border-slate-200 p-2 text-xs focus:outline-none focus:ring-2 focus:ring-slate-100'
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder='Add notes, requirements, and constraints...'
      />
      <div className='mt-3 flex items-center gap-2'>
        <button
          className='rounded-md bg-slate-900 text-white px-3 py-2 text-xs disabled:opacity-50'
          disabled={isSubmitting || !text.trim()}
          onClick={handleSubmit}
        >
          Save brain dump
        </button>
        <button
          className='rounded-md border border-slate-200 px-3 py-2 text-xs text-gray-700'
          disabled={isSubmitting}
          onClick={async () => {
            await sendUserMessage({ conversationId, text: 'Skipped brain dump.' })
          }}
        >
          Skip
        </button>
      </div>
    </div>
  )
}
