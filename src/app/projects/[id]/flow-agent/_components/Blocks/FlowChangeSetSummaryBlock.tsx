'use client'

export function FlowChangeSetSummaryBlock({ block }: { block: any }) {
  const items = Array.isArray(block?.items) ? block.items : []

  return (
    <div className='rounded-xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm'>
      <div className='flex items-start justify-between gap-3'>
        <div>
          <div className='text-xs font-semibold text-emerald-900'>Auto-approved changes</div>
          <div className='mt-1 text-[11px] text-emerald-700'>
            {block?.summary ?? `${items.length} change set${items.length === 1 ? '' : 's'} applied`}
          </div>
        </div>
        <span className='text-[10px] uppercase tracking-wide bg-white text-emerald-700 border border-emerald-200 px-2 py-1 rounded'>
          Auto
        </span>
      </div>

      {items.length > 0 ? (
        <div className='mt-3 space-y-2'>
          {items.map((item: any) => (
            <div key={item.changeSetId ?? item.title} className='rounded-lg border border-emerald-100 bg-white px-3 py-2 text-xs'>
              <div className='text-emerald-900 font-medium'>{item.title ?? 'Change set'}</div>
              {item.detail ? <div className='mt-1 text-emerald-700'>{item.detail}</div> : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}
