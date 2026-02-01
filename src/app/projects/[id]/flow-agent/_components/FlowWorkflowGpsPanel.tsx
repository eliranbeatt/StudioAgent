'use client'

import { useQuery } from 'convex/react'
import { api } from '../../../../../../convex/_generated/api'
import { Id } from '../../../../../../convex/_generated/dataModel'

type Props = {
  flowRunId: Id<'flowRuns'>
}

function stateClasses(state: string) {
  if (state === 'done') return 'bg-slate-900 border-slate-900'
  if (state === 'running' || state === 'current') return 'border-slate-900 bg-white'
  if (state === 'blocked') return 'border-amber-500 bg-amber-50'
  return 'border-slate-300 bg-white'
}

export function FlowWorkflowGpsPanel({ flowRunId }: Props) {
  const data = useQuery(api.flow.ui.getWorkflowGps, { flowRunId })

  return (
    <div className='flex flex-col h-full min-h-0 rounded-xl border border-slate-200 bg-slate-900 text-white p-4'>
      <div className='text-xs font-semibold uppercase tracking-wide text-slate-300'>Workflow GPS</div>
      <div className='mt-4 flex-1 overflow-y-auto'>
        {!data ? (
          <div className='text-xs text-slate-400'>טוען סטטוס...</div>
        ) : (
          <div className='relative pl-3'>
            <div className='absolute left-1 top-2 bottom-2 w-px bg-slate-700' />
            <div className='space-y-4'>
              {data.stages.map((stage: any) => (
                <div key={stage.key} className='flex items-start gap-3'>
                  <div className='mt-1'>
                    <div
                      className={`h-3 w-3 rounded-full border ${stateClasses(stage.state)}`}
                    />
                  </div>
                  <div>
                    <div className='text-xs font-medium'>{stage.titleHe}</div>
                    {stage.badgeHe ? (
                      <div className='mt-1 text-[10px] text-slate-300'>{stage.badgeHe}</div>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
