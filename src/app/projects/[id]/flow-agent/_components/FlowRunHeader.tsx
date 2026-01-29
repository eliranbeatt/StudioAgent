'use client'

import { Dispatch, SetStateAction, useState } from 'react'

type Props = {
  projectId: string
  activeRun: any | null
  runs: any[] | null | undefined
  selectedRunId: string | null
  setSelectedRunId: Dispatch<SetStateAction<string | null>>
  onStart: (args: { projectId: any; useWebSearch?: boolean }) => Promise<any>
  onPause: (args: { flowRunId: any }) => Promise<any>
  onResume: (args: { flowRunId: any }) => Promise<any>
  onCancel: (args: { flowRunId: any }) => Promise<any>
  formatTs: (ts: number | null | undefined) => string
  statusLabelHe: (status: string) => string
  webPricingEnabled: boolean
  defaultUseWebSearch: boolean
}

export function FlowRunHeader({
  projectId,
  activeRun,
  runs,
  selectedRunId,
  setSelectedRunId,
  onStart,
  onPause,
  onResume,
  onCancel,
  formatTs,
  statusLabelHe,
  webPricingEnabled,
  defaultUseWebSearch,
}: Props) {
  const [useWebSearch, setUseWebSearch] = useState(defaultUseWebSearch && webPricingEnabled)

  return (
    <>
      <div className='flex items-start justify-between gap-4'>
        <div>
          <h1 className='text-lg font-semibold text-gray-900'>Flow Agent</h1>
          <p className='mt-1 text-sm text-gray-600'>הרצות נשמרות וממשיכות אחרי רענון.</p>
        </div>

        <div className='flex items-center gap-2'>
          {!activeRun ? (
            <div className='flex items-center gap-2'>
              <label className='inline-flex items-center gap-2 text-xs text-gray-600'>
                <input
                  type='checkbox'
                  className='h-4 w-4'
                  checked={useWebSearch && webPricingEnabled}
                  disabled={!webPricingEnabled}
                  onChange={(e) => setUseWebSearch(e.target.checked)}
                />
                Web pricing
              </label>
              <button
                className='px-3 py-2 rounded-lg bg-black text-white text-sm disabled:opacity-60'
                onClick={async () => {
                  await onStart({ projectId: projectId as any, useWebSearch })
                }}
              >
                התחל הרצה
              </button>
            </div>
          ) : (
            <>
              {activeRun.status === 'running' ? (
                <button
                  className='px-3 py-2 rounded-lg bg-gray-900 text-white text-sm'
                  onClick={async () => {
                    await onPause({ flowRunId: activeRun._id })
                  }}
                >
                  השהה
                </button>
              ) : (
                <button
                  className='px-3 py-2 rounded-lg bg-gray-900 text-white text-sm'
                  onClick={async () => {
                    await onResume({ flowRunId: activeRun._id })
                  }}
                >
                  המשך
                </button>
              )}

              <button
                className='px-3 py-2 rounded-lg bg-white border text-sm text-gray-900'
                onClick={async () => {
                  await onCancel({ flowRunId: activeRun._id })
                }}
              >
                בטל
              </button>
            </>
          )}
        </div>
      </div>

      <div className='bg-white border rounded-xl p-4'>
        <div className='flex items-center justify-between gap-4'>
          <div>
            <div className='text-sm font-medium text-gray-900'>הרצות</div>
            <div className='mt-1 text-xs text-gray-500'>בחרו הרצה כדי לצפות בצעדים ובדיבאג</div>
          </div>

          <div className='flex items-center gap-2'>
            <select
              className='border rounded-lg px-3 py-2 text-sm bg-white'
              value={selectedRunId ?? ''}
              onChange={(e) => setSelectedRunId(e.target.value || null)}
              disabled={!runs || runs.length === 0}
            >
              {!runs || runs.length === 0 ? (
                <option value=''>אין הרצות</option>
              ) : (
                runs.map((r: any) => (
                  <option key={r._id} value={r._id}>
                    {r.currentGateId} • {statusLabelHe(r.status)} • {formatTs(r.createdAt)}
                  </option>
                ))
              )}
            </select>

            {activeRun && selectedRunId && activeRun._id !== selectedRunId ? (
              <button
                className='px-3 py-2 rounded-lg bg-white border text-sm text-gray-900'
                onClick={() => setSelectedRunId(activeRun._id as any)}
              >
                עבור להרצה הפעילה
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </>
  )
}
