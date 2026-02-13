'use client'

import { useMemo, useState } from 'react'

function extractQuestionText(question: any) {
  return (
    question?.textHe ??
    question?.text_he ??
    question?.questionHe ??
    question?.question_he ??
    question?.question ??
    question?.labelHe ??
    question?.label ??
    'Question'
  )
}

function extractOptions(question: any): string[] {
  const raw = question?.optionsHe ?? question?.options_he ?? question?.options
  if (!Array.isArray(raw)) return []
  return raw
    .map((item: any) => {
      if (typeof item === 'string') return item
      return String(item?.labelHe ?? item?.label ?? item?.value ?? '').trim()
    })
    .filter(Boolean)
}

export function SdkQuestionsBlock({
  block,
  disabled,
  onSubmit,
}: {
  block: any
  disabled?: boolean
  onSubmit: (text: string) => Promise<void>
}) {
  const [inputs, setInputs] = useState<Record<string, string>>({})
  const [selections, setSelections] = useState<Record<string, string[]>>({})
  const [freeText, setFreeText] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const questions = useMemo(() => (Array.isArray(block?.questions) ? block.questions : []), [block])
  const title = block?.titleHe ?? block?.title_he ?? 'Questions'
  const continueLabel = block?.continueAction?.labelHe ?? block?.continueAction?.label_he ?? 'Submit and continue'
  const followupLabel = block?.followupAction?.labelHe ?? block?.followupAction?.label_he ?? 'Submit and ask more'
  const submitLabel = block?.submitLabelHe ?? block?.submitLabel_he ?? continueLabel
  const freeTextTitle = block?.freeTextTitleHe ?? block?.freeTextTitle_he ?? 'Additional note'
  const freeTextPrompt = block?.freeTextPromptHe ?? block?.freeTextPrompt_he ?? 'Type your answer...'
  const showFreeText = Boolean(
    block?.showFreeText === true ||
      block?.show_free_text === true ||
      block?.freeTextPromptHe ||
      block?.freeTextPrompt_he
  )

  const buildPayload = (intent: 'continue' | 'clarify_more') => {
    const lines = questions.map((question: any, index: number) => {
      const qid = String(question?.id ?? `q_${index + 1}`)
      const label = String(extractQuestionText(question))
      const values = [inputs[qid], (selections[qid] ?? []).join(', ')].filter(Boolean).join('; ').trim()
      return `- ${label}: ${values || '(no answer)'}`
    })
    const footer = freeText.trim() ? `\n\nNote:\n${freeText.trim()}` : ''
    return `Answers (${intent}):\n${lines.join('\n')}${footer}`
  }

  const submitAnswers = async (intent: 'continue' | 'clarify_more') => {
    if (disabled || isSubmitting) return
    setIsSubmitting(true)
    try {
      await onSubmit(buildPayload(intent))
    } finally {
      setIsSubmitting(false)
    }
  }

  const isLocked = Boolean(disabled || isSubmitting)

  return (
    <div className='rounded-xl border border-blue-200 bg-white p-4 shadow-sm' dir='auto'>
      <div className='text-xs font-semibold text-gray-900 mb-3'>{title}</div>

      <div className='space-y-4 mb-6'>
        {questions.map((question: any, i: number) => {
          const qid = String(question?.id ?? `q_${i}`)
          const label = extractQuestionText(question)
          const options = extractOptions(question)
          const type = question?.type === 'date' ? 'date' : 'text'

          return (
            <div key={qid}>
              <label className='block text-xs font-medium text-gray-700 mb-1'>{label}</label>
              {options.length > 0 ? (
                <div className='flex flex-wrap gap-2 mb-2'>
                  {options.map((option) => {
                    const selected = (selections[qid] ?? []).includes(option)
                    return (
                      <button
                        key={option}
                        onClick={() =>
                          setSelections((prev) => {
                            const current = prev[qid] ?? []
                            const next = current.includes(option)
                              ? current.filter((value) => value !== option)
                              : [...current, option]
                            return { ...prev, [qid]: next }
                          })
                        }
                        disabled={isLocked}
                        className={`px-3 py-1 rounded border text-xs transition-colors ${
                          selected
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-white text-gray-700 border-gray-200 hover:border-blue-300'
                        } disabled:opacity-50`}
                      >
                        {option}
                      </button>
                    )
                  })}
                </div>
              ) : null}
              <input
                type={type}
                disabled={isLocked}
                className='w-full border border-gray-300 rounded p-2 text-xs focus:ring-2 focus:ring-blue-100 outline-none disabled:bg-gray-100'
                value={inputs[qid] ?? ''}
                onChange={(e) => setInputs((prev) => ({ ...prev, [qid]: e.target.value }))}
                placeholder='Type your answer...'
              />
            </div>
          )
        })}
      </div>

      {showFreeText ? (
        <div className='mb-4 pt-4 border-t border-gray-100'>
          <div className='text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2'>{freeTextTitle}</div>
          <textarea
            className='w-full border border-gray-300 rounded p-2 text-xs focus:ring-2 focus:ring-blue-100 outline-none min-h-[96px] disabled:bg-gray-100'
            value={freeText}
            onChange={(e) => setFreeText(e.target.value)}
            placeholder={freeTextPrompt}
            disabled={isLocked}
          />
        </div>
      ) : null}

      <div className='flex gap-2 w-full'>
        <button
          onClick={() => submitAnswers('clarify_more')}
          disabled={isLocked}
          className='flex-1 bg-white text-blue-600 border border-blue-600 py-2 rounded text-xs font-bold hover:bg-blue-50 disabled:opacity-50 transition-colors'
        >
          {followupLabel}
        </button>
        <button
          onClick={() => submitAnswers('continue')}
          disabled={isLocked}
          className='flex-1 bg-blue-600 text-white py-2 rounded text-xs font-bold hover:bg-blue-700 disabled:opacity-50 transition-colors'
        >
          {isSubmitting ? 'Submitting...' : submitLabel}
        </button>
      </div>
    </div>
  )
}
