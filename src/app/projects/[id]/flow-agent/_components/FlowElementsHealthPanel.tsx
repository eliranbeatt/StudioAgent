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


  const elements = useMemo(() => {
    if (!data?.elements) return []
    let list = data.elements
    return list
  }, [data?.elements])

  return (
    <div className='flex flex-col h-full min-h-0 rounded-xl border border-slate-200 bg-white p-4'>
      <div className='flex items-center justify-between'>
        <div>
          <div className='text-xs font-semibold text-slate-600 uppercase tracking-wide'>אלמנטים</div>
          <div className='text-sm font-medium text-slate-900'>
            {data?.elements?.length ?? 0} אלמנטים
          </div>
        </div>
        <div className='text-xs text-slate-400 font-medium'>פרויקט</div>
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



      <div className='mt-4 flex-1 overflow-y-auto space-y-3'>
        {!data ? (
          <div className='text-[11px] text-slate-400'>טוען אלמנטים...</div>
        ) : elements.length === 0 ? (
          <div className='text-[11px] text-slate-400'>אין אלמנטים להצגה.</div>
        ) : (
          elements.map((el: any) => (
            <div key={el.elementId} className='rounded-lg border border-slate-100 p-3'>
              <div className='flex items-center justify-between mb-1'>
                <div className='text-xs font-semibold text-slate-800'>{el.nameHe}</div>
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
