'use client'

import { Id } from '../../../../../../convex/_generated/dataModel'

type TrayItem = {
  _id: Id<'changeSets'>
  status: 'PROPOSED' | 'APPLIED' | 'PARTIALLY_APPLIED' | 'DISCARDED'
  stage: string
  reason_he?: string
  createdAt: number
  opsCount: number
}

function groupTitle(status: string) {
  if (status === 'PROPOSED') return 'Pending approval'
  if (status === 'APPLIED' || status === 'PARTIALLY_APPLIED') return 'Applied'
  return 'Rejected'
}

function statusBucket(status: TrayItem['status']) {
  if (status === 'PROPOSED') return 'pending'
  if (status === 'APPLIED' || status === 'PARTIALLY_APPLIED') return 'applied'
  return 'rejected'
}

export function SdkChangeSetsTray({
  items,
  busy,
  onReview,
  onApply,
  onDiscard,
}: {
  items: TrayItem[]
  busy: string | null
  onReview: (id: Id<'changeSets'>) => void
  onApply: (id: Id<'changeSets'>) => Promise<void>
  onDiscard: (id: Id<'changeSets'>) => Promise<void>
}) {
  const groups = {
    pending: items.filter((item) => statusBucket(item.status) === 'pending'),
    applied: items.filter((item) => statusBucket(item.status) === 'applied'),
    rejected: items.filter((item) => statusBucket(item.status) === 'rejected'),
  }

  const ordered = [
    { key: 'pending', title: groupTitle('PROPOSED'), rows: groups.pending },
    { key: 'applied', title: groupTitle('APPLIED'), rows: groups.applied },
    { key: 'rejected', title: groupTitle('DISCARDED'), rows: groups.rejected },
  ] as const

  return (
    <div className='rounded-xl border border-slate-200 bg-white p-4 shadow-sm'>
      <div className='text-sm font-semibold text-slate-800'>ChangeSets</div>
      <div className='text-xs text-slate-500 mt-1'>Review, apply, or discard without another LLM turn.</div>

      <div className='mt-3 space-y-4 max-h-[50vh] overflow-auto pr-1'>
        {ordered.map((group) => (
          <div key={group.key}>
            <div className='text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2'>{group.title}</div>
            {group.rows.length === 0 ? <div className='text-xs text-slate-400'>None</div> : null}
            <div className='space-y-2'>
              {group.rows.map((item) => {
                const isBusy = busy === item._id
                return (
                  <div key={item._id} className='rounded border border-slate-200 p-2'>
                    <div className='text-xs font-medium text-slate-800'>
                      {item.reason_he?.trim() || 'עדכון מוצע'}
                    </div>
                    <div className='text-[11px] text-slate-500 mt-1'>
                      {item.opsCount} ops - {item.stage}
                    </div>
                    <div className='mt-2 flex gap-2'>
                      <button
                        onClick={() => onReview(item._id)}
                        className='rounded border border-slate-200 px-2 py-1 text-[11px] text-slate-700 hover:bg-slate-50'
                      >
                        Review
                      </button>
                      {item.status === 'PROPOSED' ? (
                        <>
                          <button
                            disabled={isBusy}
                            onClick={() => void onApply(item._id)}
                            className='rounded bg-emerald-600 px-2 py-1 text-[11px] text-white hover:bg-emerald-700 disabled:opacity-50'
                          >
                            Apply
                          </button>
                          <button
                            disabled={isBusy}
                            onClick={() => void onDiscard(item._id)}
                            className='rounded border border-rose-200 px-2 py-1 text-[11px] text-rose-700 hover:bg-rose-50 disabled:opacity-50'
                          >
                            Discard
                          </button>
                        </>
                      ) : null}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
