'use client'

import { useMemo, useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { X, ExternalLink, RefreshCw, Check, Copy } from 'lucide-react'
import Link from 'next/link'
import { api } from '../../../../../../convex/_generated/api'
import { Id } from '../../../../../../convex/_generated/dataModel'

type TabKey = 'candidates' | 'assumptions' | 'history'

function formatMoney(amount?: number, currency?: string) {
  if (!Number.isFinite(Number(amount))) return '-'
  const value = Number(amount)
  const code = String(currency ?? 'ILS').toUpperCase()
  return `${value.toLocaleString()} ${code}`
}

function sourceRank(sourceType?: string) {
  const s = String(sourceType ?? '').toLowerCase()
  if (s === 'logged') return 0
  if (s === 'web') return 1
  if (s === 'catalog') return 2
  return 3
}

function sourceBadge(sourceType?: string) {
  const s = String(sourceType ?? '').toUpperCase()
  if (s === 'LOGGED') return 'LOGGED'
  if (s === 'WEB') return 'WEB'
  if (s === 'CATALOG') return 'CATALOG'
  return 'FALLBACK'
}

function toClickableUrl(raw?: string) {
  const value = String(raw ?? '').trim()
  if (!value) return null
  if (value.startsWith('http://') || value.startsWith('https://')) return value
  if (value.startsWith('www.')) return `https://${value}`
  return null
}

export function PriceEvidenceDrawer({
  open,
  onClose,
  lineId,
  projectId,
}: {
  open: boolean
  onClose: () => void
  lineId: string | null
  projectId: Id<'projects'>
}) {
  const [tab, setTab] = useState<TabKey>('candidates')
  const [expandedCandidate, setExpandedCandidate] = useState<number | null>(null)
  const [busyAction, setBusyAction] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)

  const evidence = useQuery(
    api.pricingEvidence.getMaterialLinePriceEvidence,
    open && lineId ? { materialLineId: lineId as Id<'materialLines'> } : ('skip' as any)
  )

  const applyRecommendation = useMutation(api.pricingEvidence.applyRecommendationToMaterialLine)
  const applyCandidate = useMutation(api.pricingEvidence.applyCandidateToMaterialLine)
  const markStale = useMutation(api.pricingEvidence.markWebPriceRunStale)

  const snapshot = evidence?.latestSnapshot
  const run = evidence?.run
  const itemHe = snapshot?.itemHe ?? run?.itemHe ?? evidence?.line?.itemName ?? 'Price Evidence'
  const recommended = snapshot?.recommended ?? run?.recommended
  const assumptions = Array.isArray(snapshot?.assumptionsHe)
    ? snapshot.assumptionsHe
    : Array.isArray(run?.assumptionsHe)
      ? run.assumptionsHe
      : []
  const candidatesRaw = useMemo(() => {
    const src = Array.isArray(snapshot?.candidates)
      ? snapshot.candidates
      : Array.isArray(run?.candidates)
        ? run.candidates
        : []
    return src
  }, [snapshot?.candidates, run?.candidates])
  const candidates = useMemo(() => {
    return candidatesRaw
      .map((candidate: any, originalIndex: number) => ({ candidate, originalIndex }))
      .sort((a, b) => sourceRank(a?.candidate?.sourceType) - sourceRank(b?.candidate?.sourceType))
  }, [candidatesRaw])

  const lineQty = Number(evidence?.line?.quantity ?? 0)
  const lineCurrentUnit = Number(evidence?.line?.unitCost ?? 0)
  const lineCurrentTotal = Number(evidence?.line?.total ?? lineQty * lineCurrentUnit)
  const recUnit = Number(recommended?.unitPrice ?? 0)
  const recTotal = Number.isFinite(lineQty) && lineQty > 0 ? lineQty * recUnit : recUnit
  const delta = Number.isFinite(recTotal) ? recTotal - lineCurrentTotal : null
  const showNotice = (kind: 'success' | 'error', text: string) => {
    setNotice({ kind, text })
    setTimeout(() => setNotice(null), 2200)
  }

  if (!open || !lineId) return null

  return (
    <div className='fixed inset-0 z-[120] flex justify-end'>
      <button className='absolute inset-0 bg-black/30' onClick={onClose} aria-label='Close drawer' />
      <div className='relative h-full w-full sm:w-[560px] bg-white border-l shadow-2xl overflow-hidden'>
        <div className='sticky top-0 z-10 border-b bg-white p-4'>
          <div className='flex items-start justify-between gap-3'>
            <div>
              <div className='text-xs uppercase text-gray-500 font-semibold'>Price Evidence</div>
              <h3 className='text-lg font-bold text-gray-900'>{itemHe}</h3>
              <div className='mt-2 flex flex-wrap items-center gap-2 text-xs'>
                <span className='px-2 py-1 rounded-full bg-gray-100 border'>
                  Confidence: {String(snapshot?.confidence ?? run?.confidence ?? 'low')}
                </span>
                <span className='px-2 py-1 rounded-full bg-gray-100 border'>
                  Sources: {[
                    run?.meta?.usedSources?.logged ? 'logged' : null,
                    run?.meta?.usedSources?.web ? 'web' : null,
                    run?.meta?.usedSources?.fallback ? 'fallback' : null,
                    run?.meta?.usedSources?.catalog ? 'catalog' : null,
                  ].filter(Boolean).join(', ') || 'unknown'}
                </span>
              </div>
            </div>
            <button onClick={onClose} className='p-2 rounded hover:bg-gray-100'>
              <X size={18} />
            </button>
          </div>

          <div className='mt-3 rounded-lg border bg-gray-50 p-3'>
            <div className='text-xs text-gray-500'>Recommended</div>
            <div className='text-xl font-bold text-gray-900'>
              {formatMoney(recommended?.unitPrice, recommended?.currency)} {recommended?.unitHe ?? ''}
            </div>
            {recommended?.priceBasisHe ? (
              <div className='mt-1 text-xs text-gray-600 line-clamp-2'>{recommended.priceBasisHe}</div>
            ) : null}
          </div>

          <div className='mt-3 flex flex-wrap gap-2'>
            <button
              onClick={async () => {
                if (!lineId || !recommended) return
                setBusyAction('apply_recommended')
                try {
                  await applyRecommendation({
                    materialLineId: lineId as Id<'materialLines'>,
                    webPriceRunId: run?._id,
                    itemHe,
                    recommended,
                    confidence: snapshot?.confidence ?? run?.confidence,
                    assumptionsHe: assumptions,
                    candidates: candidatesRaw,
                    appliedBy: 'user',
                  })
                  showNotice('success', 'Applied recommended price')
                } catch (error: any) {
                  showNotice('error', String(error?.message ?? 'Failed to apply recommendation'))
                } finally {
                  setBusyAction(null)
                }
              }}
              disabled={!!busyAction}
              className='px-3 py-1.5 text-xs font-semibold rounded bg-black text-white hover:bg-gray-800'
            >
              {busyAction === 'apply_recommended' ? 'Applying...' : 'Apply recommended'}
            </button>
            <button
              onClick={async () => {
                if (!run?._id) return
                setBusyAction('mark_stale')
                try {
                  await markStale({ runId: run._id })
                  showNotice('success', 'Run marked stale')
                } catch (error: any) {
                  showNotice('error', String(error?.message ?? 'Failed to mark stale'))
                } finally {
                  setBusyAction(null)
                }
              }}
              disabled={!!busyAction}
              className='px-3 py-1.5 text-xs font-semibold rounded border hover:bg-gray-50 inline-flex items-center gap-1'
            >
              <RefreshCw size={12} /> {busyAction === 'mark_stale' ? 'Refreshing...' : 'Refresh online'}
            </button>
            <Link
              href={`/management/web-prices?projectId=${projectId}&runId=${String(run?._id ?? '')}&q=${encodeURIComponent(itemHe)}`}
              className='px-3 py-1.5 text-xs font-semibold rounded border hover:bg-gray-50 inline-flex items-center gap-1'
            >
              Open Web Price Results <ExternalLink size={12} />
            </Link>
          </div>
        </div>

        <div className='p-4 border-b bg-white'>
          {notice ? (
            <div
              className={`mb-2 rounded border px-3 py-2 text-xs ${
                notice.kind === 'success'
                  ? 'bg-green-50 border-green-200 text-green-700'
                  : 'bg-red-50 border-red-200 text-red-700'
              }`}
            >
              {notice.text}
            </div>
          ) : null}
          <div className='grid grid-cols-3 gap-2 text-xs'>
            <div className='rounded border p-2'>
              <div className='text-gray-500'>Line qty</div>
              <div className='font-semibold'>{lineQty || '-'} {evidence?.line?.uomCode ?? ''}</div>
            </div>
            <div className='rounded border p-2'>
              <div className='text-gray-500'>Current</div>
              <div className='font-semibold'>{formatMoney(lineCurrentUnit, recommended?.currency)}</div>
            </div>
            <div className='rounded border p-2'>
              <div className='text-gray-500'>Delta</div>
              <div className={`font-semibold ${delta && delta > 0 ? 'text-red-600' : delta && delta < 0 ? 'text-green-600' : ''}`}>
                {delta === null ? '-' : `${delta > 0 ? '+' : ''}${delta.toLocaleString()}`}
              </div>
            </div>
          </div>
        </div>

        <div className='px-4 pt-3 flex gap-2 border-b'>
          <button onClick={() => setTab('candidates')} className={`px-3 py-2 text-xs font-semibold ${tab === 'candidates' ? 'border-b-2 border-black' : 'text-gray-500'}`}>Candidates</button>
          <button onClick={() => setTab('assumptions')} className={`px-3 py-2 text-xs font-semibold ${tab === 'assumptions' ? 'border-b-2 border-black' : 'text-gray-500'}`}>Assumptions</button>
          <button onClick={() => setTab('history')} className={`px-3 py-2 text-xs font-semibold ${tab === 'history' ? 'border-b-2 border-black' : 'text-gray-500'}`}>History</button>
        </div>

        <div className='h-[calc(100%-320px)] overflow-y-auto p-4'>
          {tab === 'candidates' ? (
            <div className='space-y-3'>
              {candidates.map((entry: any, idx: number) => {
                const candidate = entry.candidate
                const candidateUrl = toClickableUrl(candidate?.link)
                const candidateUnit = Number(candidate?.unitPrice ?? 0)
                const lineTotal = Number.isFinite(lineQty) && lineQty > 0 ? lineQty * candidateUnit : candidateUnit
                const selected = snapshot?.selectedCandidateIndex === entry.originalIndex
                return (
                  <div key={`${idx}-${candidate?.title ?? 'candidate'}`} className='rounded-lg border p-3'>
                    <div className='flex items-start justify-between gap-2'>
                      <div>
                        <div className='flex items-center gap-2'>
                          <span className='text-[10px] font-bold px-2 py-0.5 rounded bg-gray-100 border'>{sourceBadge(candidate?.sourceType)}</span>
                          {selected ? <span className='text-[10px] font-bold px-2 py-0.5 rounded bg-green-100 border border-green-200 text-green-700'>Selected</span> : null}
                        </div>
                        <div className='mt-1 text-sm font-semibold'>
                          {candidateUrl ? (
                            <a href={candidateUrl} target='_blank' rel='noreferrer' className='text-blue-700 hover:underline inline-flex items-center gap-1'>
                              {candidate?.title ?? `Candidate ${idx + 1}`} <ExternalLink size={12} />
                            </a>
                          ) : (
                            candidate?.title ?? `Candidate ${idx + 1}`
                          )}
                        </div>
                        <div className='text-xs text-gray-600'>
                          {formatMoney(candidate?.unitPrice, candidate?.currency)} {candidate?.unitHe ?? ''}
                        </div>
                        <div className='text-xs text-gray-500'>Total for line: {formatMoney(lineTotal, candidate?.currency)}</div>
                      </div>
                      <div className='flex items-center gap-1'>
                        {candidateUrl ? (
                          <a href={candidateUrl} target='_blank' rel='noreferrer' className='p-1.5 rounded border hover:bg-gray-50' title='Open source link'>
                            <ExternalLink size={13} />
                          </a>
                        ) : null}
                        <button
                          onClick={async () => {
                            const text = `${candidate?.link ?? ''}\n${candidate?.notesHe ?? ''}`.trim()
                            if (!text) return
                            await navigator.clipboard.writeText(text)
                            showNotice('success', 'Copied link + notes')
                          }}
                          className='p-1.5 rounded border hover:bg-gray-50'
                          title='Copy link + notes'
                        >
                          <Copy size={13} />
                        </button>
                        <button
                          onClick={async () => {
                            if (!lineId) return
                            setBusyAction(`apply_candidate_${entry.originalIndex}`)
                            try {
                              await applyCandidate({
                                materialLineId: lineId as Id<'materialLines'>,
                                webPriceRunId: run?._id,
                                itemHe,
                                confidence: snapshot?.confidence ?? run?.confidence,
                                assumptionsHe: assumptions,
                                candidates: candidatesRaw,
                                selectedCandidateIndex: entry.originalIndex,
                                appliedBy: 'user',
                              })
                              showNotice('success', 'Candidate applied')
                            } catch (error: any) {
                              showNotice('error', String(error?.message ?? 'Failed to apply candidate'))
                            } finally {
                              setBusyAction(null)
                            }
                          }}
                          disabled={!!busyAction}
                          className='px-2 py-1 text-[11px] rounded bg-black text-white hover:bg-gray-800'
                        >
                          <Check size={12} className='inline mr-1' />
                          {busyAction === `apply_candidate_${entry.originalIndex}` ? 'Applying...' : 'Apply'}
                        </button>
                      </div>
                    </div>
                    <button
                      onClick={() => setExpandedCandidate((prev) => (prev === idx ? null : idx))}
                      className='mt-2 text-[11px] text-gray-500 hover:text-gray-800'
                    >
                      {expandedCandidate === idx ? 'Hide details' : 'Show details'}
                    </button>
                    {expandedCandidate === idx ? (
                      <div className='mt-2 text-xs text-gray-600 space-y-1'>
                        <div>{candidate?.notesHe ?? 'No notes'}</div>
                        <div>Captured at: {candidate?.capturedAt ? new Date(candidate.capturedAt).toLocaleString() : '-'}</div>
                      </div>
                    ) : null}
                  </div>
                )
              })}
              {candidates.length === 0 ? <div className='text-sm text-gray-500'>No candidates yet.</div> : null}
            </div>
          ) : null}

          {tab === 'assumptions' ? (
            <div className='space-y-2'>
              {assumptions.map((assumption: string, idx: number) => (
                <label key={`${idx}-${assumption}`} className='flex items-start gap-2 text-sm'>
                  <input type='checkbox' checked readOnly className='mt-1' />
                  <span>{assumption}</span>
                </label>
              ))}
              {assumptions.length === 0 ? <div className='text-sm text-gray-500'>No assumptions.</div> : null}
            </div>
          ) : null}

          {tab === 'history' ? (
            <div className='space-y-2'>
              {(evidence?.history ?? []).map((entry: any) => (
                <div key={entry._id} className='rounded border p-3 text-xs'>
                  <div className='font-semibold'>{formatMoney(entry?.recommended?.unitPrice, entry?.recommended?.currency)} {entry?.recommended?.unitHe ?? ''}</div>
                  <div className='text-gray-600'>Updated: {entry?.savedAt ? new Date(entry.savedAt).toLocaleString() : '-'}</div>
                  <div className='text-gray-600'>Selected: {Number.isFinite(entry?.selectedCandidateIndex) ? `candidate ${entry.selectedCandidateIndex + 1}` : 'recommended'}</div>
                  <div className='text-gray-500'>Applied by: {entry?.appliedBy ?? '-'}</div>
                  <div className='mt-1 flex flex-wrap gap-2'>
                    {(Array.isArray(entry?.candidates) ? entry.candidates : [])
                      .map((candidate: any, idx: number) => ({ idx, url: toClickableUrl(candidate?.link), sourceType: String(candidate?.sourceType ?? '').toUpperCase() }))
                      .filter((x: any) => !!x.url)
                      .slice(0, 4)
                      .map((x: any) => (
                        <a key={`${entry._id}-${x.idx}`} href={x.url} target='_blank' rel='noreferrer' className='text-blue-700 hover:underline'>
                          {x.sourceType || 'SOURCE'} link
                        </a>
                      ))}
                  </div>
                </div>
              ))}
              {(evidence?.history?.length ?? 0) === 0 ? <div className='text-sm text-gray-500'>No history yet.</div> : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
