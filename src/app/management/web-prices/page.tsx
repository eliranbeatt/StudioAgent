'use client'

import { useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { api } from '../../../../convex/_generated/api'
import { Id } from '../../../../convex/_generated/dataModel'
import { useSearchParams } from 'next/navigation'

function formatMoney(amount?: number, currency?: string) {
  if (!Number.isFinite(Number(amount))) return '-'
  return `${Number(amount).toLocaleString()} ${String(currency ?? 'ILS').toUpperCase()}`
}

function toClickableUrl(raw?: string) {
  const value = String(raw ?? '').trim()
  if (!value) return null
  if (value.startsWith('http://') || value.startsWith('https://')) return value
  if (value.startsWith('www.')) return `https://${value}`
  return null
}

export default function WebPriceResultsPage() {
  const searchParams = useSearchParams()
  const [projectId, setProjectId] = useState(searchParams.get('projectId') ?? '')
  const [search, setSearch] = useState(searchParams.get('q') ?? '')
  const [freshness, setFreshness] = useState<'all' | 'fresh' | 'stale'>('all')
  const [domain, setDomain] = useState('')
  const [scope, setScope] = useState<'all' | 'project' | 'global'>('all')
  const [selectedRunId, setSelectedRunId] = useState<string | null>(searchParams.get('runId'))
  const [candidateIndex, setCandidateIndex] = useState(0)
  const [lineId, setLineId] = useState('')
  const [newLineQty, setNewLineQty] = useState(1)
  const [busyAction, setBusyAction] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)

  const typedProjectId = projectId.trim() ? (projectId.trim() as Id<'projects'>) : undefined

  const runs = useQuery(api.pricingEvidence.searchReusableWebPriceRuns, {
    projectId: typedProjectId,
    search: search || undefined,
    freshness,
    domain: domain || undefined,
    scope,
  })

  const selectedRun = useQuery(
    api.pricingEvidence.getWebPriceRunDetails,
    selectedRunId ? { runId: selectedRunId as Id<'webPriceRuns'> } : ('skip' as any)
  )

  const materialLines = useQuery(
    api.pricingEvidence.listProjectMaterialLines,
    typedProjectId ? { projectId: typedProjectId } : ('skip' as any)
  )

  const attachCandidate = useMutation(api.pricingEvidence.attachRunCandidateToLine)
  const createLine = useMutation(api.pricingEvidence.createMaterialLineFromRunCandidate)
  const markStale = useMutation(api.pricingEvidence.markWebPriceRunStale)

  const selectedCandidate = selectedRun?.candidates?.[candidateIndex]
  const selectedCandidateUrl = toClickableUrl(selectedCandidate?.link)

  const runRows = runs ?? []
  const sourceLabel = (run: any) => [
    run?.meta?.usedSources?.logged ? 'logged' : null,
    run?.meta?.usedSources?.web ? 'web' : null,
    run?.meta?.usedSources?.catalog ? 'catalog' : null,
    run?.meta?.usedSources?.fallback ? 'fallback' : null,
  ].filter(Boolean).join(', ')

  const rangeLabel = (run: any) => {
    if (!Number.isFinite(Number(run?.minPrice)) && !Number.isFinite(Number(run?.maxPrice))) return '-'
    const min = Number(run?.minPrice)
    const max = Number(run?.maxPrice)
    const currency = run?.recommended?.currency ?? 'ILS'
    if (!Number.isFinite(min)) return formatMoney(max, currency)
    if (!Number.isFinite(max)) return formatMoney(min, currency)
    return `${formatMoney(min, currency)} - ${formatMoney(max, currency)}`
  }
  const runLinks = (run: any) => {
    const candidates = Array.isArray(run?.candidates) ? run.candidates : []
    return candidates
      .map((candidate: any) => ({
        title: String(candidate?.title ?? 'Source'),
        url: toClickableUrl(candidate?.link),
      }))
      .filter((item: any) => !!item.url)
      .slice(0, 3)
  }

  const canAttach = !!selectedRunId && !!lineId
  const canCreate = !!selectedRunId && !!typedProjectId
  const showNotice = (kind: 'success' | 'error', text: string) => {
    setNotice({ kind, text })
    setTimeout(() => setNotice(null), 2200)
  }

  return (
    <div className='max-w-[1300px] mx-auto p-6'>
      <div className='mb-6'>
        <h1 className='text-3xl font-bold'>Web Price Results</h1>
        <p className='text-sm text-gray-500'>Reusable runs cache with attach/create actions for material lines.</p>
        {notice ? (
          <div
            className={`mt-3 rounded border px-3 py-2 text-xs inline-block ${
              notice.kind === 'success'
                ? 'bg-green-50 border-green-200 text-green-700'
                : 'bg-red-50 border-red-200 text-red-700'
            }`}
          >
            {notice.text}
          </div>
        ) : null}
      </div>

      <div className='grid grid-cols-1 xl:grid-cols-3 gap-4 items-start'>
        <div className='xl:col-span-2 border rounded-xl bg-white overflow-hidden max-h-[calc(100vh-170px)] overflow-y-auto'>
          <div className='p-3 border-b grid grid-cols-1 md:grid-cols-6 gap-2'>
            <input
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              placeholder='Project ID (optional)'
              className='border rounded px-2 py-1.5 text-sm md:col-span-2'
            />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder='Search item'
              className='border rounded px-2 py-1.5 text-sm'
            />
            <select value={freshness} onChange={(e) => setFreshness(e.target.value as any)} className='border rounded px-2 py-1.5 text-sm'>
              <option value='all'>All</option>
              <option value='fresh'>Fresh</option>
              <option value='stale'>Stale</option>
            </select>
            <input
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder='Domain filter'
              className='border rounded px-2 py-1.5 text-sm'
            />
            <select value={scope} onChange={(e) => setScope(e.target.value as any)} className='border rounded px-2 py-1.5 text-sm'>
              <option value='all'>Project + Global</option>
              <option value='project'>Project only</option>
              <option value='global'>Global only</option>
            </select>
          </div>

          <div className='overflow-auto'>
            <table className='w-full text-sm'>
              <thead className='bg-gray-50 border-b text-xs uppercase text-gray-500'>
                <tr>
                  <th className='text-left p-3'>Item</th>
                  <th className='text-left p-3'>Updated</th>
                  <th className='text-left p-3'>Freshness</th>
                  <th className='text-left p-3'>Range</th>
                  <th className='text-left p-3'>#Candidates</th>
                  <th className='text-left p-3'>Links</th>
                  <th className='text-left p-3'>Sources</th>
                  <th className='text-left p-3'>Confidence</th>
                </tr>
              </thead>
              <tbody>
                {runRows.map((run: any) => (
                  <tr
                    key={run._id}
                    className={`border-b hover:bg-gray-50 cursor-pointer ${selectedRunId === run._id ? 'bg-gray-50' : ''}`}
                    onClick={() => {
                      setSelectedRunId(run._id)
                      setCandidateIndex(0)
                    }}
                  >
                    <td className='p-3 font-semibold'>{run.itemHe}</td>
                    <td className='p-3 text-xs text-gray-500'>{new Date(run.updatedAt).toLocaleString()}</td>
                    <td className='p-3'>
                      <span className={`text-xs px-2 py-1 rounded-full border ${run.freshness === 'fresh' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-orange-50 text-orange-700 border-orange-200'}`}>
                        {run.freshness}
                      </span>
                    </td>
                    <td className='p-3 text-xs'>{rangeLabel(run)}</td>
                    <td className='p-3 text-xs'>{run.candidatesCount}</td>
                    <td className='p-3 text-xs'>
                      <div className='flex flex-col gap-1'>
                        {runLinks(run).length > 0 ? (
                          runLinks(run).map((item: any, idx: number) => (
                            <a
                              key={`${run._id}-link-${idx}`}
                              href={item.url}
                              target='_blank'
                              rel='noreferrer'
                              className='text-blue-700 hover:underline truncate max-w-[220px]'
                              onClick={(e) => e.stopPropagation()}
                              title={item.title}
                            >
                              {item.title}
                            </a>
                          ))
                        ) : (
                          <span className='text-gray-400'>-</span>
                        )}
                      </div>
                    </td>
                    <td className='p-3 text-xs'>{sourceLabel(run) || '-'}</td>
                    <td className='p-3 text-xs'>{run.confidence}</td>
                  </tr>
                ))}
                {runRows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className='p-6 text-center text-gray-500'>No runs found.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        <div className='border rounded-xl bg-white p-4 space-y-4 xl:sticky xl:top-4 max-h-[calc(100vh-120px)] overflow-y-auto'>
          <div>
            <div className='text-xs uppercase text-gray-500'>Run Details</div>
            <div className='text-lg font-bold'>{selectedRun?.itemHe ?? 'Select a run'}</div>
            {selectedRun ? (
              <div className='mt-1 text-xs text-gray-600'>
                Recommended: {formatMoney(selectedRun?.recommended?.unitPrice, selectedRun?.recommended?.currency)} {selectedRun?.recommended?.unitHe ?? ''}
              </div>
            ) : null}
          </div>

          {selectedRun ? (
            <>
              <div className='space-y-2'>
                <label className='text-xs text-gray-500'>Candidate</label>
                <select
                  value={candidateIndex}
                  onChange={(e) => setCandidateIndex(Number(e.target.value))}
                  className='w-full border rounded px-2 py-1.5 text-sm'
                >
                  {(selectedRun.candidates ?? []).map((candidate: any, idx: number) => (
                    <option key={`${idx}-${candidate?.title ?? 'candidate'}`} value={idx}>
                      {idx + 1}. {String(candidate?.sourceType ?? 'fallback').toUpperCase()} | {formatMoney(candidate?.unitPrice, candidate?.currency)} | {candidate?.title ?? 'Untitled'}
                    </option>
                  ))}
                </select>
                {selectedCandidateUrl ? (
                  <a href={selectedCandidateUrl} target='_blank' rel='noreferrer' className='text-xs text-blue-600 hover:underline'>
                    Open candidate link
                  </a>
                ) : null}
                <div className='text-xs text-gray-600'>{selectedCandidate?.notesHe ?? '-'}</div>
                <div className='max-h-48 overflow-auto rounded border'>
                  {(selectedRun.candidates ?? []).map((candidate: any, idx: number) => {
                    const url = toClickableUrl(candidate?.link)
                    return (
                      <div key={`${idx}-${candidate?.title ?? 'candidate'}`} className='p-2 text-xs border-b last:border-b-0'>
                        <div className='font-medium'>
                          {url ? (
                            <a href={url} target='_blank' rel='noreferrer' className='text-blue-700 hover:underline'>
                              {candidate?.title ?? `Candidate ${idx + 1}`}
                            </a>
                          ) : (
                            candidate?.title ?? `Candidate ${idx + 1}`
                          )}
                        </div>
                        <div className='text-gray-600'>{String(candidate?.sourceType ?? 'fallback').toUpperCase()} | {formatMoney(candidate?.unitPrice, candidate?.currency)}</div>
                      </div>
                    )
                  })}
                </div>
              </div>

              <div className='border-t pt-3 space-y-2'>
                <div className='text-xs uppercase text-gray-500'>Attach to existing line</div>
                <select
                  value={lineId}
                  onChange={(e) => setLineId(e.target.value)}
                  className='w-full border rounded px-2 py-1.5 text-sm'
                  disabled={!typedProjectId}
                >
                  <option value=''>{typedProjectId ? 'Select material line' : 'Enter project ID first'}</option>
                  {(materialLines ?? []).map((line: any) => (
                    <option key={line.id} value={line.id}>
                      {line.itemName} | qty {line.quantity} | {line.unitCost}
                    </option>
                  ))}
                </select>
                <button
                  disabled={!canAttach || !!busyAction}
                  onClick={async () => {
                    if (!selectedRunId || !lineId) return
                    setBusyAction('attach')
                    try {
                      await attachCandidate({
                        runId: selectedRunId as Id<'webPriceRuns'>,
                        materialLineId: lineId as Id<'materialLines'>,
                        candidateIndex,
                      })
                      showNotice('success', 'Candidate attached to line')
                    } catch (error: any) {
                      showNotice('error', String(error?.message ?? 'Failed to attach candidate'))
                    } finally {
                      setBusyAction(null)
                    }
                  }}
                  className='w-full px-3 py-2 text-xs rounded bg-black text-white disabled:opacity-40'
                >
                  {busyAction === 'attach' ? 'Attaching...' : 'Attach selected candidate'}
                </button>
              </div>

              <div className='border-t pt-3 space-y-2'>
                <div className='text-xs uppercase text-gray-500'>Create new material line</div>
                <input
                  type='number'
                  min={1}
                  value={newLineQty}
                  onChange={(e) => setNewLineQty(Math.max(1, Number(e.target.value) || 1))}
                  className='w-full border rounded px-2 py-1.5 text-sm'
                />
                <button
                  disabled={!canCreate || !!busyAction}
                  onClick={async () => {
                    if (!selectedRunId || !typedProjectId) return
                    setBusyAction('create_line')
                    try {
                      await createLine({
                        runId: selectedRunId as Id<'webPriceRuns'>,
                        candidateIndex,
                        projectId: typedProjectId,
                        quantity: newLineQty,
                      })
                      showNotice('success', 'New material line created')
                    } catch (error: any) {
                      showNotice('error', String(error?.message ?? 'Failed to create line'))
                    } finally {
                      setBusyAction(null)
                    }
                  }}
                  className='w-full px-3 py-2 text-xs rounded border hover:bg-gray-50 disabled:opacity-40'
                >
                  {busyAction === 'create_line' ? 'Creating...' : 'Create line from candidate'}
                </button>
              </div>

              <div className='border-t pt-3'>
                <button
                  disabled={!!busyAction}
                  onClick={async () => {
                    if (!selectedRunId) return
                    setBusyAction('mark_stale')
                    try {
                      await markStale({ runId: selectedRunId as Id<'webPriceRuns'> })
                      showNotice('success', 'Run marked stale')
                    } catch (error: any) {
                      showNotice('error', String(error?.message ?? 'Failed to mark stale'))
                    } finally {
                      setBusyAction(null)
                    }
                  }}
                  className='w-full px-3 py-2 text-xs rounded border hover:bg-gray-50 disabled:opacity-40'
                >
                  {busyAction === 'mark_stale' ? 'Marking...' : 'Mark stale'}
                </button>
              </div>
            </>
          ) : (
            <div className='text-sm text-gray-500'>Choose a run from the table.</div>
          )}
        </div>
      </div>
    </div>
  )
}
