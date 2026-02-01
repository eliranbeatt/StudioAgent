'use client'

import { useQuery } from 'convex/react'
import { useMemo, useState } from 'react'
import { api } from '../../../../../../convex/_generated/api'
import { Id } from '../../../../../../convex/_generated/dataModel'

type Props = {
  projectId: Id<'projects'>
}

function formatCurrency(amount: number) {
  if (!Number.isFinite(amount)) return '—'
  try {
    return new Intl.NumberFormat('he-IL', {
      style: 'currency',
      currency: 'ILS',
      maximumFractionDigits: 0,
    }).format(amount)
  } catch {
    return `${amount} ₪`
  }
}

export function FlowElementsHealthPanel({ projectId }: Props) {
  const data = useQuery(api.flow.ui.getElementsHealth, { projectId })
  const [query, setQuery] = useState('')
  const [onlyMissing, setOnlyMissing] = useState(false)
  const [onlyNoTasks, setOnlyNoTasks] = useState(false)

  const elements = useMemo(() => {
    if (!data?.elements) return []
    let list = data.elements
    if (query.trim()) {
      const q = query.trim().toLowerCase()
      list = list.filter((el: any) => String(el.nameHe ?? '').toLowerCase().includes(q))
    }
    if (onlyMissing) {
      list = list.filter((el: any) => Array.isArray(el.flags) && el.flags.length > 0)
    }
    if (onlyNoTasks) {
      list = list.filter((el: any) => (el.tasksCount ?? 0) === 0)
    }
    return list
  }, [data?.elements, onlyMissing, onlyNoTasks, query])

  return (
    <div className='flex flex-col h-full min-h-0 rounded-xl border border-slate-200 bg-white p-4'>
      <div className='flex items-center justify-between'>
        <div>
          <div className='text-xs font-semibold text-slate-600 uppercase tracking-wide'>אלמנטים</div>
          <div className='text-sm font-medium text-slate-900'>
            {data?.elements?.length ?? 0} אלמנטים
          </div>
        </div>
        <div className='text-xs text-slate-500'>בריאות פרויקט</div>
      </div>

      <div className='mt-3 rounded-lg bg-slate-50 p-3 text-[11px] text-slate-600'>
        <div className='flex items-center justify-between'>
          <span>משימות</span>
          <span className='font-semibold text-slate-800'>{data?.totals?.tasksCount ?? 0}</span>
        </div>
        <div className='mt-1 flex items-center justify-between'>
          <span>חומרים</span>
          <span className='font-semibold text-slate-800'>
            {data?.totals?.materialLinesCount ?? 0} • {formatCurrency(data?.totals?.materialCost ?? 0)}
          </span>
        </div>
        <div className='mt-1 flex items-center justify-between'>
          <span>עבודה</span>
          <span className='font-semibold text-slate-800'>
            {data?.totals?.workLinesCount ?? 0} • {formatCurrency(data?.totals?.laborCost ?? 0)}
          </span>
        </div>
      </div>

      <div className='mt-3 space-y-2'>
        <input
          className='w-full rounded-md border border-slate-200 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-slate-100'
          placeholder='חיפוש אלמנט...'
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className='flex flex-wrap gap-2 text-[11px] text-slate-600'>
          <label className='inline-flex items-center gap-2'>
            <input
              type='checkbox'
              checked={onlyMissing}
              onChange={(e) => setOnlyMissing(e.target.checked)}
              className='h-3 w-3'
            />
            רק חסרים
          </label>
          <label className='inline-flex items-center gap-2'>
            <input
              type='checkbox'
              checked={onlyNoTasks}
              onChange={(e) => setOnlyNoTasks(e.target.checked)}
              className='h-3 w-3'
            />
            בלי משימות
          </label>
        </div>
      </div>

      <div className='mt-4 flex-1 overflow-y-auto space-y-3'>
        {!data ? (
          <div className='text-[11px] text-slate-400'>טוען אלמנטים...</div>
        ) : elements.length === 0 ? (
          <div className='text-[11px] text-slate-400'>אין אלמנטים להצגה.</div>
        ) : (
          elements.map((el: any) => (
            <div key={el.elementId} className='rounded-lg border border-slate-100 p-3'>
              <div className='flex items-center justify-between'>
                <div className='text-xs font-medium text-slate-900'>{el.nameHe}</div>
                <span className='text-[10px] text-slate-400'>{el.status ?? 'draft'}</span>
              </div>

              <div className='mt-2 grid grid-cols-3 gap-2 text-[11px] text-slate-600'>
                <div>
                  <div className='text-slate-400'>משימות</div>
                  <div className='font-semibold text-slate-800'>{el.tasksCount ?? 0}</div>
                </div>
                <div>
                  <div className='text-slate-400'>חומרים</div>
                  <div className='font-semibold text-slate-800'>
                    {el.materialLinesCount ?? 0} • {formatCurrency(el.materialCost ?? 0)}
                  </div>
                </div>
                <div>
                  <div className='text-slate-400'>עבודה</div>
                  <div className='font-semibold text-slate-800'>
                    {el.workLinesCount ?? 0} • {formatCurrency(el.laborCost ?? 0)}
                  </div>
                </div>
              </div>

              {Array.isArray(el.flags) && el.flags.length > 0 ? (
                <div className='mt-2 flex flex-wrap gap-1 text-[10px] text-amber-700'>
                  {el.flags.map((flag: string) => (
                    <span key={flag} className='rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5'>
                      {flag}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
