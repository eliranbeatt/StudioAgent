'use client'

type Props = {
  selectedRun: any | null
  latestStepWithReport: any | null
}

export function FlowDebugPanel({ selectedRun, latestStepWithReport }: Props) {
  return (
    <div className='bg-white border rounded-xl p-4'>
      <div className='text-sm font-medium text-gray-900'>Debug</div>
      <div className='mt-2 text-xs text-gray-600'>
        <div className='font-medium text-gray-900'>FlowRun</div>
        <pre className='mt-1 p-3 rounded-lg bg-gray-50 border overflow-auto text-[11px] leading-relaxed'>
          {JSON.stringify(selectedRun ?? null, null, 2)}
        </pre>

        <div className='mt-4 font-medium text-gray-900'>Latest Step</div>
        <pre className='mt-1 p-3 rounded-lg bg-gray-50 border overflow-auto text-[11px] leading-relaxed'>
          {JSON.stringify(latestStepWithReport ?? null, null, 2)}
        </pre>
      </div>
    </div>
  )
}
