'use client'

type Props = {
  selectedRun: any | null
  steps: any[] | null | undefined
  formatTs: (ts: number | null | undefined) => string
  statusLabelHe: (status: string) => string
  onOpenChangeSet?: (id: string) => void
}

export function FlowTimeline({ selectedRun, steps, formatTs, statusLabelHe, onOpenChangeSet }: Props) {
  return (
    <div className='bg-white border rounded-xl p-4'>
      <div className='text-sm font-medium text-gray-900'>ציר זמן</div>
      <div className='mt-2 text-sm text-gray-600'>
        {!selectedRun ? (
          'אין צעדים להצגה. התחילו הרצה.'
        ) : !steps ? (
          'טוען צעדים...'
        ) : steps.length === 0 ? (
          'אין צעדים עדיין.'
        ) : (
          <div className='divide-y'>
            {steps.map((s: any) => (
              <div key={s._id} className='py-3 flex items-start justify-between gap-4'>
                <div>
                  <div className='text-sm text-gray-900'>
                    {s.gateId} • {statusLabelHe(s.status)}
                  </div>
                  <div className='mt-1 text-xs text-gray-500'>
                    התחיל: {formatTs(s.startedAt)}
                    {s.finishedAt ? ` • הסתיים: ${formatTs(s.finishedAt)}` : ''}
                  </div>
                  {s.error ? <div className='mt-1 text-xs text-red-600'>{s.error}</div> : null}

                  {s.status === 'awaiting_approval' && Array.isArray(s.draftChangeSetIds) && s.draftChangeSetIds.length > 0 ? (
                    <div className='mt-2 flex flex-wrap gap-2'>
                      {s.draftChangeSetIds.map((id: string) => (
                        <button
                          key={id}
                          className='px-2 py-1 rounded-md bg-white border text-xs text-gray-900 hover:bg-gray-50'
                          onClick={() => onOpenChangeSet?.(id)}
                        >
                          פתח ChangeSet
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
