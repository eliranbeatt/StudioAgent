'use client'

import { useQuery } from 'convex/react'
import { api } from '../../../../../../convex/_generated/api'

type Props = {
  selectedRun: any | null
  latestStepWithReport: any | null
}

export function FlowDebugPanel({ selectedRun, latestStepWithReport }: Props) {
  const conversationId = selectedRun?.conversationId as string | undefined
  const latestTrace = useQuery(
    api.tracing.latestByConversation,
    conversationId ? { conversationId } : 'skip'
  )

  const ctxPacks = latestTrace?.request?.traceMeta?.ctxPacks
  const cachedTokens = Number(latestTrace?.response?.usage?.prompt_tokens_details?.cached_tokens ?? 0)
  const promptCacheKey = latestTrace?.request?.prompt_cache_key
  const promptCacheRetention = latestTrace?.request?.prompt_cache_retention

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
      </div>
    </div>
  )
}
