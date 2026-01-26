'use client'

import { useAction, useMutation } from 'convex/react'
import { useMemo, useState } from 'react'
import { api } from '../../../../../../../convex/_generated/api'
import { Id } from '../../../../../../../convex/_generated/dataModel'

type Props = {
  block: any
  flowRunId: Id<'flowRuns'>
  onOpenChangeSet?: (id: Id<'changeSets'>) => void
}

function severityLabel(sev: string) {
  switch (sev) {
    case 'CRITICAL':
      return 'Critical'
    case 'HIGH':
      return 'High'
    case 'MEDIUM':
      return 'Medium'
    case 'LOW':
      return 'Low'
    default:
      return sev
  }
}

export function FlowGateBlock({ block, flowRunId, onOpenChangeSet }: Props) {
  const submitGateAnswers = useAction((api as any).flow.gateActions.submitGateAnswers)
  const adoptOpportunity = useAction((api as any).flowAnswers.adoptOpportunity)
  const dismissOpportunity = useMutation((api as any).flowAnswers.dismissOpportunity)

  const [answersByKey, setAnswersByKey] = useState<Record<string, string>>({})
  const [isSubmitting, setIsSubmitting] = useState(false)

  const questionsBlock = block?.questionsBlock ?? null
  const questions = useMemo(() => (questionsBlock?.questions ?? []) as Array<any>, [questionsBlock])
  const suggestions = useMemo(() => (questionsBlock?.suggestions ?? []) as Array<any>, [questionsBlock])
  const blockingIssues = Array.isArray(block?.blockingIssues) ? block.blockingIssues : []
  const warnings = Array.isArray(block?.warnings) ? block.warnings : []

  const submit = async (intent: 'ask_more' | 'advance' | 'skip') => {
    if (isSubmitting) return
    setIsSubmitting(true)
    try {
      await submitGateAnswers({
        flowRunId,
        answersByKey,
        intent,
        questionKeys: questions.map((q) => q.id).filter(Boolean),
      })
      setAnswersByKey({})
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className='rounded-xl border border-amber-200 bg-white p-4 shadow-sm'>
      <div className='flex items-start justify-between gap-3'>
        <div>
          <div className='text-xs font-semibold text-gray-900'>Gate {block?.gateId ?? '—'} needs input</div>
          <div className='mt-1 text-[11px] text-gray-500'>
            Status: {block?.status ?? 'blocked'} • Readiness:{' '}
            {typeof block?.readinessScore === 'number' ? block.readinessScore.toFixed(2) : '—'}
          </div>
        </div>
        <span className='text-[10px] uppercase tracking-wide bg-amber-50 text-amber-700 border border-amber-200 px-2 py-1 rounded'>
          Gate
        </span>
      </div>

      {blockingIssues.length > 0 ? (
        <div className='mt-3 space-y-2'>
          <div className='text-[11px] font-semibold text-gray-700 uppercase tracking-wide'>Blocking issues</div>
          {blockingIssues.map((issue: any) => (
            <div key={issue.key} className='rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-xs'>
              <div className='text-gray-900 font-medium'>
                {severityLabel(issue.severity)} • {issue.titleHe ?? issue.key}
              </div>
              {issue.detailHe ? <div className='mt-1 text-gray-600'>{issue.detailHe}</div> : null}
              <div className='mt-1 text-[10px] text-gray-500'>{issue.key}</div>
            </div>
          ))}
        </div>
      ) : null}

      {warnings.length > 0 ? (
        <div className='mt-3 space-y-2'>
          <div className='text-[11px] font-semibold text-gray-700 uppercase tracking-wide'>Warnings</div>
          {warnings.map((issue: any) => (
            <div key={issue.key} className='rounded-lg border border-gray-100 bg-white px-3 py-2 text-xs'>
              <div className='text-gray-900 font-medium'>
                {severityLabel(issue.severity)} • {issue.titleHe ?? issue.key}
              </div>
              {issue.detailHe ? <div className='mt-1 text-gray-600'>{issue.detailHe}</div> : null}
              <div className='mt-1 text-[10px] text-gray-500'>{issue.key}</div>
            </div>
          ))}
        </div>
      ) : null}

      {questions.length > 0 ? (
        <div className='mt-4 space-y-3'>
          <div className='text-[11px] font-semibold text-gray-700 uppercase tracking-wide'>
            {questionsBlock?.titleHe ?? 'Questions'}
          </div>
          {questions.map((q: any, index: number) => {
            const qid = q.id ?? `q${index}`
            return (
              <div key={qid} className='rounded-lg border border-gray-200 bg-white p-3'>
                <div className='text-xs font-medium text-gray-900'>{q.textHe ?? qid}</div>
                {q.detailHe ? <div className='mt-1 text-[11px] text-gray-500'>{q.detailHe}</div> : null}
                <textarea
                  className='mt-2 w-full min-h-[72px] rounded-md border border-gray-200 p-2 text-xs focus:outline-none focus:ring-2 focus:ring-amber-100'
                  value={answersByKey[qid] ?? ''}
                  onChange={(e) =>
                    setAnswersByKey((prev) => ({
                      ...prev,
                      [qid]: e.target.value,
                    }))
                  }
                  placeholder='Type your answer...'
                />
              </div>
            )
          })}
        </div>
      ) : null}

      {suggestions.length > 0 ? (
        <div className='mt-4 space-y-2'>
          <div className='text-[11px] font-semibold text-gray-700 uppercase tracking-wide'>Suggestions</div>
          {suggestions.map((s: any) => (
            <div key={s.key} className='rounded-lg border border-gray-200 bg-white p-3 text-xs'>
              <div className='text-gray-900 font-medium'>{s.titleHe ?? s.key}</div>
              {s.detailHe ? <div className='mt-1 text-gray-600'>{s.detailHe}</div> : null}
              <div className='mt-2 flex items-center gap-2'>
                <button
                  className='rounded-md bg-gray-900 text-white px-3 py-1 text-[11px] disabled:opacity-50'
                  disabled={isSubmitting}
                  onClick={async () => {
                    const res = await adoptOpportunity({
                      flowRunId,
                      opportunityKey: s.key,
                    })
                    const changeSetId = (res as any)?.changeSetId
                    if (changeSetId && onOpenChangeSet) {
                      onOpenChangeSet(changeSetId)
                    }
                  }}
                >
                  Adopt
                </button>
                <button
                  className='rounded-md border border-gray-200 px-3 py-1 text-[11px] disabled:opacity-50'
                  disabled={isSubmitting}
                  onClick={async () => {
                    await dismissOpportunity({ flowRunId, opportunityKey: s.key })
                  }}
                >
                  Dismiss
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <div className='mt-4 flex flex-wrap gap-2'>
        <button
          className='rounded-md border border-gray-200 px-3 py-2 text-xs text-gray-700 disabled:opacity-50'
          disabled={isSubmitting}
          onClick={() => submit('ask_more')}
        >
          Ask more
        </button>
        <button
          className='rounded-md bg-amber-600 text-white px-3 py-2 text-xs disabled:opacity-50'
          disabled={isSubmitting}
          onClick={() => submit('advance')}
        >
          Save + advance
        </button>
        <button
          className='rounded-md border border-amber-200 text-amber-700 px-3 py-2 text-xs disabled:opacity-50'
          disabled={isSubmitting}
          onClick={() => submit('skip')}
        >
          Skip gate
        </button>
      </div>
    </div>
  )
}
