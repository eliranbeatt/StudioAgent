'use client'

import { useAction } from 'convex/react'
import { useMemo, useState } from 'react'
import { api } from '../../../../../../../convex/_generated/api'
import { Id } from '../../../../../../../convex/_generated/dataModel'

export function FlowQuestionsBlock({
  block,
  flowRunId,
}: {
  block: any
  flowRunId: Id<'flowRuns'>
}) {
  const submitGateAnswers = useAction((api as any).flow.gateActions.submitGateAnswers)

  const [answersByKey, setAnswersByKey] = useState<Record<string, string>>({})
  const [selectionsByKey, setSelectionsByKey] = useState<Record<string, string[]>>({})
  const [freeText, setFreeText] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const questions = useMemo(() => (block?.questions ?? []) as Array<any>, [block?.questions])
  const title = block?.titleHe ?? block?.title_he ?? 'Questions'
  const continueLabel =
    block?.continueAction?.labelHe ??
    block?.continueAction?.label_he ??
    'Submit and continue'
  const followupLabel =
    block?.followupAction?.labelHe ??
    block?.followupAction?.label_he ??
    'Submit and ask more'
  const freeTextTitle =
    block?.freeTextTitleHe ??
    block?.freeTextTitle_he ??
    block?.free_text_title_he ??
    'Free text'
  const freeTextPrompt =
    block?.freeTextPromptHe ??
    block?.freeTextPrompt_he ??
    block?.free_text_prompt_he ??
    'Add any extra context or notes...'

  const hasFreeTextProps = !!(
    block?.freeTextPromptHe ||
    block?.freeTextPrompt_he ||
    block?.free_text_prompt_he
  )
  const showFreeText =
    hasFreeTextProps || block?.showFreeText === true || block?.show_free_text === true

  const handleSubmit = async (intent: 'ask_more' | 'advance') => {
    if (isSubmitting || submitted) return
    setIsSubmitting(true)

    try {
      const answersPayload: Record<string, string> = {}
      for (const key of Object.keys(answersByKey)) {
        const value = String(answersByKey[key] ?? '').trim()
        if (value) answersPayload[key] = value
      }
      for (const key of Object.keys(selectionsByKey)) {
        const selection = selectionsByKey[key]
        if (selection && selection.length > 0) {
          const existing = answersPayload[key]
          const joined = selection.join(', ')
          answersPayload[key] = existing ? `${existing}; ${joined}` : joined
        }
      }

      await submitGateAnswers({
        flowRunId,
        answersByKey: answersPayload,
        intent,
        questionKeys: questions.map((q) => q.id).filter(Boolean),
        freeText: freeText.trim() || undefined,
      })
      setSubmitted(true)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div
      className={`rounded-xl border p-4 shadow-sm transition-colors ${
        submitted ? 'bg-gray-50 border-gray-200' : 'bg-white border-amber-200'
      }`}
      dir='auto'
    >
      <div className='text-xs font-semibold text-gray-900 mb-3'>{title}</div>

      <div className='space-y-4 mb-6'>
        {questions.map((q: any, i: number) => {
          const qId = q.id ?? `q${i}`
          const qText =
            q.textHe ??
            q.text_he ??
            q.text ??
            q.question ??
            q.questionHe ??
            q.label ??
            q.labelHe ??
            'Question'
          const qOptions = q.optionsHe ?? q.options_he
          const qType = q.type ?? 'text'
          const isSingle = qType === 'single' || qType === 'toggle'
          const isMulti = qType === 'multi'

          return (
            <div key={qId}>
              <label className='block text-xs font-medium text-gray-700 mb-1'>{qText}</label>

              {Array.isArray(qOptions) && qOptions.length > 0 ? (
                <div className='flex flex-wrap gap-2 mb-2'>
                  {qOptions.map((opt: string) => {
                    const selected = (selectionsByKey[qId] ?? []).includes(opt)
                    return (
                      <button
                        key={opt}
                        type='button'
                        onClick={() => {
                          if (submitted) return
                          setSelectionsByKey((prev) => {
                            const current = prev[qId] ?? []
                            if (current.includes(opt)) {
                              return { ...prev, [qId]: current.filter((v) => v !== opt) }
                            }
                            if (isSingle) return { ...prev, [qId]: [opt] }
                            if (isMulti) return { ...prev, [qId]: [...current, opt] }
                            return { ...prev, [qId]: [opt] }
                          })
                        }}
                        disabled={isSubmitting || submitted}
                        className={`px-3 py-1 rounded border text-xs transition-colors ${
                          selected
                            ? 'bg-amber-600 text-white border-amber-600'
                            : 'bg-white text-gray-700 border-gray-200 hover:border-amber-300 disabled:opacity-50'
                        }`}
                      >
                        {opt}
                      </button>
                    )
                  })}
                </div>
              ) : null}

              {qType === 'date' || qType === 'number' ? (
                <input
                  type={qType === 'date' ? 'date' : 'number'}
                  disabled={isSubmitting || submitted}
                  className='w-full border border-gray-300 rounded p-2 text-xs focus:ring-2 focus:ring-amber-100 outline-none disabled:bg-gray-100 disabled:text-gray-500'
                  value={answersByKey[qId] ?? ''}
                  onChange={(e) =>
                    setAnswersByKey((prev) => ({ ...prev, [qId]: e.target.value }))
                  }
                  placeholder='Type your answer...'
                />
              ) : (
                <textarea
                  disabled={isSubmitting || submitted}
                  className='w-full border border-gray-300 rounded p-2 text-xs focus:ring-2 focus:ring-amber-100 outline-none min-h-[72px] disabled:bg-gray-100 disabled:text-gray-500'
                  value={answersByKey[qId] ?? ''}
                  onChange={(e) =>
                    setAnswersByKey((prev) => ({ ...prev, [qId]: e.target.value }))
                  }
                  placeholder='Type your answer...'
                />
              )}
            </div>
          )
        })}
      </div>

      {showFreeText ? (
        <div className='mb-4 pt-4 border-t border-gray-100'>
          <div className='text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2'>
            {freeTextTitle}
          </div>
          <textarea
            className='w-full border border-gray-300 rounded p-2 text-xs focus:ring-2 focus:ring-amber-100 outline-none min-h-[96px] disabled:bg-gray-100 disabled:text-gray-500'
            value={freeText}
            onChange={(e) => setFreeText(e.target.value)}
            placeholder={freeTextPrompt}
            disabled={isSubmitting || submitted}
          />
        </div>
      ) : null}

      <div className='flex gap-2 w-full'>
        <button
          onClick={() => handleSubmit('ask_more')}
          disabled={isSubmitting || submitted}
          className='flex-1 bg-white text-amber-700 border border-amber-600 py-2 rounded text-xs font-bold hover:bg-amber-50 disabled:opacity-50 flex justify-center items-center transition-colors'
        >
          {followupLabel}
        </button>
        <button
          onClick={() => handleSubmit('advance')}
          disabled={isSubmitting || submitted}
          className='flex-1 bg-amber-600 text-white py-2 rounded text-xs font-bold hover:bg-amber-700 disabled:opacity-50 flex justify-center items-center transition-colors'
        >
          {isSubmitting ? (
            <span className='flex items-center gap-2'>
              <span className='animate-spin h-3 w-3 border-2 border-white border-t-transparent rounded-full' />
              Processing...
            </span>
          ) : (
            continueLabel
          )}
        </button>
      </div>
    </div>
  )
}
