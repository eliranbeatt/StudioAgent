'use client'

import { useMemo } from 'react'

function extractQuestionText(question: any) {
  return (
    question?.textHe ??
    question?.text_he ??
    question?.text ??
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
      return String(item?.labelHe ?? item?.label ?? item?.text ?? item?.title ?? item?.value ?? '').trim()
    })
    .filter(Boolean)
}

export function SdkQuestionsBlock({
  block,
  disabled,
  yesNo,
  multiSelectedIds,
  onSetYesNo,
  onToggleMulti,
}: {
  block: any
  disabled?: boolean
  yesNo: 'yes' | 'no' | null
  multiSelectedIds: string[]
  onSetYesNo: (value: 'yes' | 'no') => void
  onToggleMulti: (id: string) => void
}) {
  const questions = useMemo(() => (Array.isArray(block?.questions) ? block.questions : []), [block])
  const title = block?.titleHe ?? block?.title_he ?? 'Questions'
  const question = questions[0]
  const multiQuestion = questions[1] ?? questions[0]
  const options = multiQuestion ? extractOptions(multiQuestion) : []
  const yesNoLabel = String(question ? extractQuestionText(question) : '').trim()
  const multiLabel = String(multiQuestion ? extractQuestionText(multiQuestion) : '').trim()
  const showYesNo = Boolean(yesNoLabel)
  const showMulti = Boolean(multiLabel) && options.length > 0

  const isLocked = Boolean(disabled)

  return (
    <div className='rounded-xl border border-blue-200 bg-white p-4 shadow-sm' dir='auto'>
      <div className='text-xs font-semibold text-gray-900 mb-3'>{title}</div>

      <div className='space-y-4 mb-4'>
        {showYesNo ? (
          <div>
            <label className='block text-xs font-medium text-gray-700 mb-2'>{yesNoLabel}</label>
            <div className='flex gap-2 mb-2'>
              <button
                disabled={isLocked}
                onClick={() => onSetYesNo('yes')}
                className={`px-3 py-1 rounded border text-xs ${
                  yesNo === 'yes'
                    ? 'border-blue-600 bg-blue-50 text-blue-700'
                    : 'border-gray-200 text-gray-700 hover:border-blue-300'
                } disabled:opacity-50`}
              >
                Yes
              </button>
              <button
                disabled={isLocked}
                onClick={() => onSetYesNo('no')}
                className={`px-3 py-1 rounded border text-xs ${
                  yesNo === 'no'
                    ? 'border-blue-600 bg-blue-50 text-blue-700'
                    : 'border-gray-200 text-gray-700 hover:border-blue-300'
                } disabled:opacity-50`}
              >
                No
              </button>
            </div>
          </div>
        ) : null}

        {showMulti ? (
          <div>
            <label className='block text-xs font-medium text-gray-700 mb-2'>{multiLabel}</label>
            <div className='flex flex-wrap gap-2'>
              {options.map((option) => (
                <button
                  key={option}
                  disabled={isLocked}
                  onClick={() => onToggleMulti(option)}
                  className={`px-3 py-1 rounded border text-xs ${
                    multiSelectedIds.includes(option)
                      ? 'border-blue-600 bg-blue-50 text-blue-700'
                      : 'border-gray-200 text-gray-700 hover:border-blue-300'
                  } disabled:opacity-50`}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
