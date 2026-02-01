'use client'

import { useQuery } from 'convex/react'
import { useMemo, useState } from 'react'
import { api } from '../../../../../../convex/_generated/api'

type Props = {
  selectedRun: any | null
  latestStepWithReport: any | null
  nodeRuns?: any[] | null | undefined
  applyLogs?: any[] | null | undefined
}

export function FlowDebugPanel({ selectedRun, latestStepWithReport, nodeRuns, applyLogs }: Props) {
  const conversationId = selectedRun?.conversationId as string | undefined
  const latestTrace = useQuery(
    api.tracing.latestByConversation,
    conversationId ? { conversationId } : 'skip'
  )
  const [selectedChangeSetId, setSelectedChangeSetId] = useState<string | null>(null)
  const selectedChangeSet = useQuery(
    api.changeSets.get,
    selectedChangeSetId ? { id: selectedChangeSetId as any } : 'skip'
  )

  const ctxPacks = latestTrace?.request?.traceMeta?.ctxPacks
  const cachedTokens = Number(latestTrace?.response?.usage?.prompt_tokens_details?.cached_tokens ?? 0)
  const promptCacheKey = latestTrace?.request?.prompt_cache_key
  const promptCacheRetention = latestTrace?.request?.prompt_cache_retention

  const applyLogSummaries = useMemo(() => {
    if (!Array.isArray(applyLogs)) return []
    return applyLogs.slice(0, 10)
  }, [applyLogs])

  return (
    <div className='bg-white border rounded-xl p-4'>
      <div className='text-sm font-medium text-gray-900'>Debug</div>
      <div className='mt-2 text-xs text-gray-600'>
        <div className='font-medium text-gray-900'>Context Packs</div>
        {ctxPacks ? (
          <div className='mt-1 p-3 rounded-lg border bg-gray-50 text-[11px]'>
            <div>View: {ctxPacks.view ?? '—'}</div>
            <div>Pack count: {ctxPacks.packCount ?? '—'}</div>
            <div>Total bytes: {ctxPacks.totalBytes ?? '—'}</div>
            <div>Cached tokens: {cachedTokens || '—'}</div>
            <div>Prompt cache key: {promptCacheKey ?? '—'}</div>
            <div>Retention: {promptCacheRetention ?? '—'}</div>
            {Array.isArray(ctxPacks.packIds) && ctxPacks.packIds.length > 0 ? (
              <div className='mt-2'>Packs: {ctxPacks.packIds.join(', ')}</div>
            ) : null}
          </div>
        ) : (
          <div className='mt-1 text-[11px] text-gray-500'>No context pack trace yet.</div>
        )}

        <div className='font-medium text-gray-900'>FlowRun</div>
        <pre className='mt-1 p-3 rounded-lg bg-gray-50 border overflow-auto text-[11px] leading-relaxed'>
          {JSON.stringify(selectedRun ?? null, null, 2)}
        </pre>

        <div className='mt-4 font-medium text-gray-900'>Latest Step</div>
        <pre className='mt-1 p-3 rounded-lg bg-gray-50 border overflow-auto text-[11px] leading-relaxed'>
          {JSON.stringify(latestStepWithReport ?? null, null, 2)}
        </pre>

        <div className='mt-4 font-medium text-gray-900'>Node Runs</div>
        <pre className='mt-1 p-3 rounded-lg bg-gray-50 border overflow-auto text-[11px] leading-relaxed'>
          {JSON.stringify(nodeRuns ?? null, null, 2)}
        </pre>

        <div className='mt-4 font-medium text-gray-900'>Apply Logs</div>
        {applyLogSummaries.length === 0 ? (
          <div className='mt-1 text-[11px] text-gray-500'>No apply logs yet.</div>
        ) : (
          <div className='mt-2 space-y-2'>
            {applyLogSummaries.map((log: any) => (
              <div key={log._id} className='rounded border bg-gray-50 p-2 text-[11px]'>
                <div>{log.changeSetId} â€¢ {log.result}</div>
                <div className='text-gray-500'>Applied at: {log.appliedAt}</div>
                <button
                  className='mt-1 text-xs text-blue-600 hover:underline'
                  onClick={() => setSelectedChangeSetId(log.changeSetId)}
                >
                  Load ChangeSet
                </button>
              </div>
            ))}
          </div>
        )}

        {selectedChangeSet ? (
          <div className='mt-4'>
            <div className='font-medium text-gray-900'>Selected ChangeSet</div>
            <div className='mt-2 flex gap-2'>
              <button
                className='px-2 py-1 rounded border text-xs'
                onClick={() => {
                  try {
                    navigator.clipboard.writeText(JSON.stringify(selectedChangeSet, null, 2))
                  } catch {
                    // no-op
                  }
                }}
              >
                Copy ChangeSet JSON
              </button>
              <button
                className='px-2 py-1 rounded border text-xs'
                onClick={() => {
                  try {
                    const blob = new Blob([JSON.stringify(selectedChangeSet, null, 2)], { type: 'application/json' })
                    const url = URL.createObjectURL(blob)
                    const link = document.createElement('a')
                    link.href = url
                    link.download = `changeset_${selectedChangeSet._id}.json`
                    document.body.appendChild(link)
                    link.click()
                    link.remove()
                    URL.revokeObjectURL(url)
                  } catch {
                    // no-op
                  }
                }}
              >
                Download JSON
              </button>
            </div>
            <pre className='mt-2 p-3 rounded-lg bg-gray-50 border overflow-auto text-[11px] leading-relaxed'>
              {JSON.stringify(selectedChangeSet ?? null, null, 2)}
            </pre>
          </div>
        ) : null}
      </div>
    </div>
  )
}
