'use client'

import { useAction, useQuery } from 'convex/react'
import { useMemo, useState } from 'react'
import { api } from '../../../../../../convex/_generated/api'
import { Id } from '../../../../../../convex/_generated/dataModel'

type Props = {
  flowRunId: Id<'flowRuns'>
  isRunning?: boolean
}

type Question = {
  questionId: string
  fieldKey: string
  prompt: string
  choices?: string[]
  type?: string
  placeholderHe?: string
  whyAsked?: string
}

const GATE_TITLES: Record<string, string> = {
  G0: 'איסוף בריף',
  G0C: 'הבהרות',
  G1: 'אלמנטים',
  G2: 'משימות',
  G3: 'תקציב',
  G4: 'תמחור',
  G5: 'השלמות משימות',
  G6: 'לוגיסטיקה',
  G7: 'בדיקת תמחור',
  G8: 'הצעת מחיר',
  G9: 'אודיט',
  G10: 'קונטקסט',
}

function formatTs(ts?: number | null) {
  if (!ts) return '—'
  try {
    return new Date(ts).toLocaleString('he-IL')
  } catch {
    return String(ts)
  }
}

export function FlowQuestionsLane({ flowRunId, isRunning }: Props) {
  const currentSet = useQuery(api.flow.questionsUi.getCurrentQuestionSet, { flowRunId })
  const history = useQuery(api.flow.questionsUi.listQuestionHistory, { flowRunId, limit: 12 })
  const submitQuestionSet = useAction(api.flow.questionsUi.submitQuestionSet)

  const [showHistory, setShowHistory] = useState(false)
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null)
  const [answersByKey, setAnswersByKey] = useState<Record<string, string>>({})
  const [selectionsByKey, setSelectionsByKey] = useState<Record<string, string[]>>({})
  const [freeText, setFreeText] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const questionSet = currentSet?.current ?? null
  const questions = useMemo(() => (questionSet?.questions ?? []) as Question[], [questionSet?.questions])
  const gateTitle = questionSet?.gateId ? GATE_TITLES[questionSet.gateId] : null
  const headerTitle = questionSet?.titleHe ?? (gateTitle ? `שאלות — ${gateTitle}` : 'שאלות')

  const handleSubmit = async (intent: 'submit_more' | 'submit_skip') => {
    if (!questionSet || isSubmitting) return
    setIsSubmitting(true)
    try {
      const answersPayload: Record<string, string> = {}
      for (const q of questions) {
        const key = q.fieldKey ?? q.questionId
        const freeAnswer = answersByKey[key]
        if (freeAnswer && freeAnswer.trim()) {
          answersPayload[key] = freeAnswer.trim()
        }
        const selections = selectionsByKey[key] ?? []
        if (selections.length > 0) {
          const joined = selections.join(', ')
          answersPayload[key] = answersPayload[key]
            ? `${answersPayload[key]}; ${joined}`
            : joined
        }
      }

      await submitQuestionSet({
        flowRunId,
        questionSetId: questionSet._id,
        answersByKey: answersPayload,
        intent,
        freeText: freeText.trim() || undefined,
      })

      setAnswersByKey({})
      setSelectionsByKey({})
      setFreeText('')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className='flex flex-col h-full min-h-0'>
      <div className='flex items-center justify-between'>
        <div>
          <div className='text-sm font-semibold text-gray-900'>Flow Agent</div>
          <div className='text-xs text-gray-500'>זרם הבהרות מנותק מהשלבים</div>
        </div>
        <div className='flex items-center gap-2'>
          {isRunning ? (
            <div className='flex items-center gap-2 text-xs text-slate-500'>
              <div className='w-3 h-3 rounded-full border-2 border-slate-200 border-t-slate-700 animate-spin' />
              <span>Thinking</span>
            </div>
          ) : null}
          <button
            className='text-xs px-3 py-1 rounded-full border border-slate-200 text-slate-600'
            onClick={() => setShowHistory((prev) => !prev)}
          >
            {showHistory ? '???????? ????????????????' : '????????????????'}
          </button>
        </div>
      </div>

      {showHistory ? (
        <div className='mt-4 rounded-xl border border-slate-200 bg-white p-3'>
          <div className='text-xs font-semibold text-slate-600 uppercase tracking-wide'>היסטוריה</div>
          <div className='mt-3 space-y-2'>
            {!history || history.length === 0 ? (
              <div className='text-[11px] text-slate-500'>אין סטים קודמים.</div>
            ) : (
              history.map((item: any) => {
                const set = item?.questionSet
                const response = item?.response
                if (!set) return null
                const gateLabel = set.gateId ? GATE_TITLES[set.gateId] ?? set.gateId : '—'
                const isOpen = expandedHistoryId === set._id
                return (
                  <div key={set._id} className='rounded-lg border border-slate-100 p-2'>
                    <button
                      className='w-full text-left flex items-center justify-between text-xs text-slate-700'
                      onClick={() => setExpandedHistoryId(isOpen ? null : set._id)}
                    >
                      <span>{set.titleHe ?? `סט שאלות (${gateLabel})`}</span>
                      <span className='text-[11px] text-slate-400'>{formatTs(response?.createdAt)}</span>
                    </button>
                    {isOpen ? (
                      <div className='mt-2 text-[11px] text-slate-600 space-y-1'>
                        <div>סטטוס: {response?.status === 'skipped' ? 'דולג' : 'נענה'}</div>
                        {response?.answersByKey ? (
                          <div className='rounded bg-slate-50 p-2'>
                            {Object.entries(response.answersByKey).map(([k, v]) => (
                              <div key={k}>
                                <span className='font-medium'>{k}:</span> {String(v)}
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                )
              })
            )}
          </div>
        </div>
      ) : null}

      <div className='mt-6 flex-1 min-h-0'>
        {!questionSet ? (
          <div className='rounded-xl border border-dashed border-slate-200 bg-white p-6 text-sm text-slate-500'>
            אין שאלות פתוחות כרגע. כשהמערכת תזהה חוסרים, היא תציג סט חדש כאן.
          </div>
        ) : (
          <div className='rounded-xl border border-slate-200 bg-white p-4'>
            <div className='text-xs font-semibold text-slate-700 uppercase tracking-wide'>סט פעיל</div>
            <div className='mt-2 text-sm font-medium text-slate-900'>{headerTitle}</div>
            {questionSet?.gateId ? (
              <div className='mt-1 text-[11px] text-slate-500'>שלב: {gateTitle}</div>
            ) : null}

            <div className='mt-4 space-y-4'>
              {questions.map((q, idx) => {
                const qKey = q.fieldKey ?? q.questionId ?? `q${idx}`
                const qType = q.type ?? (q.choices?.length ? 'single' : 'text')
                const isSingle = qType === 'single' || qType === 'toggle'
                const isMulti = qType === 'multi'
                const selection = selectionsByKey[qKey] ?? []

                return (
                  <div key={qKey} className='rounded-lg border border-slate-100 p-3'>
                    <div className='text-xs font-medium text-slate-900'>{q.prompt}</div>
                    {q.whyAsked ? (
                      <div className='mt-1 text-[11px] text-slate-500'>{q.whyAsked}</div>
                    ) : null}

                    {Array.isArray(q.choices) && q.choices.length > 0 ? (
                      <div className='mt-3 flex flex-wrap gap-2'>
                        {q.choices.map((choice) => {
                          const selected = selection.includes(choice)
                          return (
                            <button
                              key={choice}
                              type='button'
                              disabled={isSubmitting}
                              onClick={() => {
                                setSelectionsByKey((prev) => {
                                  const current = prev[qKey] ?? []
                                  if (current.includes(choice)) {
                                    return { ...prev, [qKey]: current.filter((v) => v !== choice) }
                                  }
                                  if (isSingle) return { ...prev, [qKey]: [choice] }
                                  if (isMulti) return { ...prev, [qKey]: [...current, choice] }
                                  return { ...prev, [qKey]: [choice] }
                                })
                              }}
                              className={`px-3 py-1 rounded-full border text-[11px] transition-colors ${
                                selected
                                  ? 'bg-slate-900 text-white border-slate-900'
                                  : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
                              }`}
                            >
                              {choice}
                            </button>
                          )
                        })}
                      </div>
                    ) : null}

                    {qType === 'number' || qType === 'date' ? (
                      <input
                        type={qType === 'date' ? 'date' : 'number'}
                        className='mt-3 w-full rounded-md border border-slate-200 p-2 text-xs focus:outline-none focus:ring-2 focus:ring-slate-100'
                        value={answersByKey[qKey] ?? ''}
                        onChange={(e) =>
                          setAnswersByKey((prev) => ({
                            ...prev,
                            [qKey]: e.target.value,
                          }))
                        }
                        placeholder={q.placeholderHe ?? 'ענה כאן...'}
                        disabled={isSubmitting}
                      />
                    ) : qType === 'textarea' ? (
                      <textarea
                        className='mt-3 w-full min-h-[96px] rounded-md border border-slate-200 p-2 text-xs focus:outline-none focus:ring-2 focus:ring-slate-100'
                        value={answersByKey[qKey] ?? ''}
                        onChange={(e) =>
                          setAnswersByKey((prev) => ({
                            ...prev,
                            [qKey]: e.target.value,
                          }))
                        }
                        placeholder={q.placeholderHe ?? 'ענה כאן...'}
                        disabled={isSubmitting}
                      />
                    ) : (
                      <textarea
                        className='mt-3 w-full min-h-[72px] rounded-md border border-slate-200 p-2 text-xs focus:outline-none focus:ring-2 focus:ring-slate-100'
                        value={answersByKey[qKey] ?? ''}
                        onChange={(e) =>
                          setAnswersByKey((prev) => ({
                            ...prev,
                            [qKey]: e.target.value,
                          }))
                        }
                        placeholder={q.placeholderHe ?? 'ענה כאן...'}
                        disabled={isSubmitting}
                      />
                    )}
                  </div>
                )
              })}
            </div>

            <div className='mt-4 border-t border-slate-100 pt-4'>
              <div className='text-[11px] font-semibold text-slate-500 uppercase tracking-wide'>הערות כלליות</div>
              <textarea
                className='mt-2 w-full min-h-[80px] rounded-md border border-slate-200 p-2 text-xs focus:outline-none focus:ring-2 focus:ring-slate-100'
                value={freeText}
                onChange={(e) => setFreeText(e.target.value)}
                placeholder='הוסף הקשר כללי או תיקונים...'
                disabled={isSubmitting}
              />
            </div>

            <div className='mt-4 flex flex-wrap gap-2'>
              <button
                className='rounded-md border border-slate-200 px-3 py-2 text-xs text-slate-700 disabled:opacity-50'
                disabled={isSubmitting}
                onClick={() => handleSubmit('submit_more')}
              >
                ??? ???? ?????</button>
              <button
                className='rounded-md bg-slate-900 text-white px-3 py-2 text-xs disabled:opacity-50'
                disabled={isSubmitting}
                onClick={() => handleSubmit('submit_skip')}
              >
                שלח והמשך
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
