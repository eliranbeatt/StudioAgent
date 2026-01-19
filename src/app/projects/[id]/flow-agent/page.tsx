'use client'

import { useMutation, useQuery } from 'convex/react'
import { useParams } from 'next/navigation'
import { useMemo, useRef, useState } from 'react'
import { api } from '../../../../../convex/_generated/api'

function formatTs(ts: number | null | undefined) {
  if (!ts) return '—'
  try {
    return new Date(ts).toLocaleString('he-IL')
  } catch {
    return String(ts)
  }
}

function formatScore(score: number | null | undefined) {
  if (score === null || score === undefined) return '—'
  if (Number.isNaN(score)) return '—'
  return score.toFixed(2)
}

function statusLabelHe(status: string) {
  switch (status) {
    case 'running':
      return 'רץ'
    case 'paused':
      return 'מושהה'
    case 'blocked':
      return 'חסום'
    case 'awaiting_approval':
      return 'ממתין לאישור'
    case 'completed':
      return 'הושלם'
    case 'failed':
      return 'נכשל'
    case 'cancelled':
      return 'בוטל'
    default:
      return status
  }
}

function severityLabelHe(sev: string) {
  switch (sev) {
    case 'CRITICAL':
      return 'קריטי'
    case 'HIGH':
      return 'גבוה'
    case 'MEDIUM':
      return 'בינוני'
    case 'LOW':
      return 'נמוך'
    default:
      return sev
  }
}

export default function FlowAgentPage() {
  const params = useParams()
  const rawId = params.id as string
  const resolved = useQuery(api.projects.resolveProjectId, { id: rawId })
  const projectId = resolved?.projectId ?? null

  const featureFlags = useQuery((api as any).featureFlags.getAll)
  const tabEnabled = !!featureFlags?.ff_flow_agent_tab
  const backendEnabled = !!featureFlags?.ff_flow_agent_backend
  const validatorsEnabled = !!featureFlags?.ff_flow_validators_v1

  const activeRun = useQuery(
    (api as any).flowRuns.getActiveByProject,
    projectId && backendEnabled ? { projectId } : 'skip'
  )

  const runs = useQuery(
    (api as any).flowRuns.listByProject,
    projectId && backendEnabled ? { projectId } : 'skip'
  )

  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)

  const defaultSelectedRunId = useMemo(() => {
    if (!backendEnabled) return null
    return (activeRun?._id as string | undefined) ?? (runs?.[0]?._id as string | undefined) ?? null
  }, [activeRun?._id, backendEnabled, runs])

  const effectiveSelectedRunId = selectedRunId ?? defaultSelectedRunId

  const selectedRun = useMemo(() => {
    if (!effectiveSelectedRunId) return activeRun ?? null
    if (activeRun?._id === effectiveSelectedRunId) return activeRun
    if (!runs) return null
    return runs.find((r: any) => r._id === effectiveSelectedRunId) ?? null
  }, [activeRun, effectiveSelectedRunId, runs])

  const steps = useQuery(
    (api as any).flowSteps.listByRun,
    selectedRun?._id && backendEnabled ? { flowRunId: selectedRun._id } : 'skip'
  )

  const latestStepWithReport = useMemo(() => {
    if (!steps || steps.length === 0) return null
    for (let i = steps.length - 1; i >= 0; i--) {
      if (steps[i]?.validationReport) return steps[i]
    }
    return steps[steps.length - 1]
  }, [steps])

  const latestReport = latestStepWithReport?.validationReport ?? null

  const brainDump = useQuery(
    (api as any).brainDump.getProjectBrainDump,
    projectId && backendEnabled ? { projectId } : 'skip'
  )

  const startRun = useMutation((api as any).flowRuns.start)
  const pauseRun = useMutation((api as any).flowRuns.pause)
  const resumeRun = useMutation((api as any).flowRuns.resume)
  const cancelRun = useMutation((api as any).flowRuns.cancel)

  const computeValidation = useMutation((api as any).flowRuns.computeValidation)

  const [validationGateOverride, setValidationGateOverride] = useState<'G0' | 'G1' | 'G2' | 'G3' | null>(null)
  const validationGateId: 'G0' | 'G1' | 'G2' | 'G3' = useMemo(() => {
    if (validationGateOverride) return validationGateOverride
    const gate = selectedRun?.currentGateId
    return gate === 'G0' || gate === 'G1' || gate === 'G2' || gate === 'G3' ? gate : 'G0'
  }, [selectedRun?.currentGateId, validationGateOverride])

  const appendBrainDump = useMutation((api as any).brainDump.appendProjectBrainDump)
  const setBrainDump = useMutation((api as any).brainDump.setProjectBrainDumpRaw)

  const [addendumText, setAddendumText] = useState('')
  const brainDumpLastUpdatedAt = useMemo(() => brainDump?.updatedAt ?? null, [brainDump?.updatedAt])

  const brainDumpReplaceRef = useRef<HTMLTextAreaElement | null>(null)

  if (!resolved) {
    return <div className='p-8 text-gray-500'>טוען פרויקט...</div>
  }

  if (!projectId) {
    return <div className='p-8 text-gray-500'>פרויקט לא נמצא.</div>
  }

  if (!tabEnabled) {
    return (
      <div className='p-8'>
        <h1 className='text-lg font-semibold text-gray-900'>Flow Agent</h1>
        <p className='mt-2 text-sm text-gray-600'>Flow Agent מושבת כרגע.</p>
      </div>
    )
  }

  if (!backendEnabled) {
    return (
      <div className='p-8'>
        <h1 className='text-lg font-semibold text-gray-900'>Flow Agent</h1>
        <p className='mt-2 text-sm text-gray-600'>השרת של Flow Agent עדיין מושבת.</p>
        <p className='mt-1 text-sm text-gray-500'>יש להדליק את הדגל ff_flow_agent_backend כדי להתחיל.</p>
      </div>
    )
  }

  return (
    <div className='p-8 space-y-6'>
      <div className='flex items-start justify-between gap-4'>
        <div>
          <h1 className='text-lg font-semibold text-gray-900'>Flow Agent</h1>
          <p className='mt-1 text-sm text-gray-600'>הרצות נשמרות וממשיכות אחרי רענון.</p>
        </div>

        <div className='flex items-center gap-2'>
          {!activeRun ? (
            <button
              className='px-3 py-2 rounded-lg bg-black text-white text-sm'
              onClick={async () => {
                if (!projectId) return
                await startRun({ projectId })
              }}
            >
              התחל הרצה
            </button>
          ) : (
            <>
              {activeRun.status === 'running' ? (
                <button
                  className='px-3 py-2 rounded-lg bg-gray-900 text-white text-sm'
                  onClick={async () => {
                    await pauseRun({ flowRunId: activeRun._id })
                  }}
                >
                  השהה
                </button>
              ) : (
                <button
                  className='px-3 py-2 rounded-lg bg-gray-900 text-white text-sm'
                  onClick={async () => {
                    await resumeRun({ flowRunId: activeRun._id })
                  }}
                >
                  המשך
                </button>
              )}

              <button
                className='px-3 py-2 rounded-lg bg-white border text-sm text-gray-900'
                onClick={async () => {
                  await cancelRun({ flowRunId: activeRun._id })
                }}
              >
                בטל
              </button>
            </>
          )}
        </div>
      </div>

      <div className='bg-white border rounded-xl p-4'>
        <div className='flex items-center justify-between gap-4'>
          <div>
            <div className='text-sm font-medium text-gray-900'>הרצות</div>
            <div className='mt-1 text-xs text-gray-500'>בחרו הרצה כדי לצפות בצעדים ובדיבאג</div>
          </div>

          <div className='flex items-center gap-2'>
            <select
              className='border rounded-lg px-3 py-2 text-sm bg-white'
              value={selectedRunId ?? ''}
              onChange={(e) => setSelectedRunId(e.target.value || null)}
              disabled={!runs || runs.length === 0}
            >
              {!runs || runs.length === 0 ? (
                <option value=''>אין הרצות</option>
              ) : (
                runs.map((r: any) => (
                  <option key={r._id} value={r._id}>
                    {r.currentGateId} • {statusLabelHe(r.status)} • {formatTs(r.createdAt)}
                  </option>
                ))
              )}
            </select>

            {activeRun && selectedRunId && activeRun._id !== selectedRunId ? (
              <button
                className='px-3 py-2 rounded-lg bg-white border text-sm text-gray-900'
                onClick={() => setSelectedRunId(activeRun._id as any)}
              >
                עבור להרצה הפעילה
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <div className='bg-white border rounded-xl p-4'>
        <div className='flex items-center justify-between gap-4'>
          <div>
            <div className='text-sm font-medium text-gray-900'>סטטוס הרצה</div>
            <div className='mt-1 text-sm text-gray-600'>
              {selectedRun ? (
                <>
                  {statusLabelHe(selectedRun.status)} • Gate: {selectedRun.currentGateId}
                </>
              ) : (
                'אין הרצה פעילה'
              )}
            </div>
            {selectedRun ? (
              <div className='mt-2 text-xs text-gray-500'>
                מוכנות: {formatScore(selectedRun.readinessScore)}
                {selectedRun.blockingIssueKeys?.length ? (
                  <> • חסימות: {selectedRun.blockingIssueKeys.length}</>
                ) : (
                  <> • חסימות: 0</>
                )}
              </div>
            ) : null}

            {selectedRun?.blockingIssueKeys?.length ? (
              <div className='mt-2 text-xs text-gray-600'>
                <div className='font-medium text-gray-900'>מפתחות חסימה</div>
                <div className='mt-1 flex flex-wrap gap-2'>
                  {selectedRun.blockingIssueKeys.map((k: string) => (
                    <span key={k} className='px-2 py-1 rounded-md bg-gray-100 border'>
                      {k}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          {selectedRun ? (
            <div className='text-xs text-gray-500 text-right'>
              עודכן: {formatTs(selectedRun.updatedAt)}
            </div>
          ) : null}
        </div>

        <div className='mt-3 flex items-center gap-2'>
          <select
            className='border rounded-lg px-3 py-2 text-sm bg-white'
            value={validationGateId}
            onChange={(e) => setValidationGateOverride(e.target.value as any)}
            disabled={!selectedRun}
          >
            <option value='G0'>G0 — Brief</option>
            <option value='G1'>G1 — Elements</option>
            <option value='G2'>G2 — Tasks</option>
            <option value='G3'>G3 — Accounting</option>
          </select>

          <button
            className='px-3 py-2 rounded-lg bg-white border text-sm text-gray-900 disabled:opacity-50'
            disabled={!selectedRun || !validatorsEnabled}
            onClick={async () => {
              if (!selectedRun) return
              await computeValidation({
                flowRunId: selectedRun._id,
                gateId: validationGateId,
              })
            }}
          >
            רענן ולידציה
          </button>

          {!validatorsEnabled ? (
            <div className='text-xs text-gray-500'>וולידטורים מושבתים (ff_flow_validators_v1)</div>
          ) : null}
        </div>
      </div>

      {latestReport ? (
        <div className='bg-white border rounded-xl p-4'>
          <div className='text-sm font-medium text-gray-900'>ממצאים (ולידציה)</div>
          <div className='mt-1 text-xs text-gray-500'>
            Gate: {latestStepWithReport?.gateId ?? '—'} • סטטוס: {latestReport.status ?? '—'} • מוכנות:{' '}
            {formatScore(latestReport.readinessScore)}
          </div>

          {Array.isArray(latestReport.blockingIssues) && latestReport.blockingIssues.length > 0 ? (
            <div className='mt-3'>
              <div className='text-sm font-medium text-gray-900'>חסימות</div>
              <div className='mt-2 space-y-2'>
                {latestReport.blockingIssues.map((iss: any) => (
                  <div key={iss.key} className='p-3 rounded-lg border bg-gray-50'>
                    <div className='text-sm text-gray-900'>
                      {severityLabelHe(iss.severity)} • {iss.titleHe ?? iss.key}
                    </div>
                    <div className='mt-1 text-xs text-gray-600'>{iss.detailHe ?? iss.key}</div>
                    <div className='mt-1 text-[11px] text-gray-500'>{iss.key}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className='mt-3 text-sm text-gray-600'>אין חסימות.</div>
          )}

          {Array.isArray(latestReport.warnings) && latestReport.warnings.length > 0 ? (
            <div className='mt-4'>
              <div className='text-sm font-medium text-gray-900'>אזהרות</div>
              <div className='mt-2 space-y-2'>
                {latestReport.warnings.map((iss: any) => (
                  <div key={iss.key} className='p-3 rounded-lg border bg-white'>
                    <div className='text-sm text-gray-900'>
                      {severityLabelHe(iss.severity)} • {iss.titleHe ?? iss.key}
                    </div>
                    <div className='mt-1 text-xs text-gray-600'>{iss.detailHe ?? iss.key}</div>
                    <div className='mt-1 text-[11px] text-gray-500'>{iss.key}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className='bg-white border rounded-xl p-4'>
        <div className='flex items-center justify-between gap-4'>
          <div>
            <div className='text-sm font-medium text-gray-900'>Brain Dump</div>
            <div className='mt-1 text-xs text-gray-500'>עודכן: {formatTs(brainDumpLastUpdatedAt)}</div>
          </div>

          <div className='flex items-center gap-2'>
            <button
              className='px-3 py-2 rounded-lg bg-white border text-sm text-gray-900'
              onClick={async () => {
                if (!projectId) return
                const text = addendumText.trim()
                if (!text) return
                await appendBrainDump({ projectId, text })
                setAddendumText('')

                if (selectedRun && validatorsEnabled) {
                  await computeValidation({
                    flowRunId: selectedRun._id,
                    gateId: selectedRun.currentGateId,
                  })
                }
              }}
            >
              הוסף תוספת
            </button>
            <button
              className='px-3 py-2 rounded-lg bg-black text-white text-sm'
              onClick={async () => {
                if (!projectId) return
                const nextText = brainDumpReplaceRef.current?.value ?? ''
                await setBrainDump({ projectId, text: nextText })

                if (selectedRun && validatorsEnabled) {
                  await computeValidation({
                    flowRunId: selectedRun._id,
                    gateId: selectedRun.currentGateId,
                  })
                }
              }}
            >
              עדכן מלא
            </button>
          </div>
        </div>

        <div className='mt-3'>
          <div className='text-xs font-medium text-gray-700'>תוספת חופשית (append)</div>
          <input
            className='mt-1 w-full rounded-lg border p-2 text-sm'
            placeholder='הוסיפו כאן תוספת קצרה (נשמרת בהוספה בלבד)'
            value={addendumText}
            onChange={(e) => setAddendumText(e.target.value)}
          />
        </div>

        <textarea
          className='mt-3 w-full min-h-[220px] rounded-lg border p-3 text-sm'
          placeholder='טקסט מלא (replace)'
          key={String(brainDumpLastUpdatedAt ?? 'brainDump')}
          defaultValue={brainDump?.brainDumpRaw ?? ''}
          ref={brainDumpReplaceRef}
        />
      </div>

      <div className='bg-white border rounded-xl p-4'>
        <div className='text-sm font-medium text-gray-900'>ציר זמן</div>
        <div className='mt-2 text-sm text-gray-600'>
          {!selectedRun ? (
            'אין צעדים להצגה. התחילו הרצה.'
          ) : !steps ? (
            'טוען צעדים...'
          ) : steps.length === 0 ? (
            'אין צעדים עדיין.'
          ) : (
            <div className='divide-y'>
              {steps.map((s: any) => (
                <div key={s._id} className='py-3 flex items-start justify-between gap-4'>
                  <div>
                    <div className='text-sm text-gray-900'>
                      {s.gateId} • {statusLabelHe(s.status)}
                    </div>
                    <div className='mt-1 text-xs text-gray-500'>
                      התחיל: {formatTs(s.startedAt)}
                      {s.finishedAt ? ` • הסתיים: ${formatTs(s.finishedAt)}` : ''}
                    </div>
                    {s.error ? (
                      <div className='mt-1 text-xs text-red-600'>{s.error}</div>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

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
    </div>
  )
}
