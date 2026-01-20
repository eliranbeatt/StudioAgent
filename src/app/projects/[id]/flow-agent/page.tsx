'use client'

import { useAction, useMutation, useQuery } from 'convex/react'
import { useParams } from 'next/navigation'
import { useMemo, useRef, useState } from 'react'
import { api } from '../../../../../convex/_generated/api'
import { FlowRunHeader } from './_components/FlowRunHeader'
import { FlowTimeline } from './_components/FlowTimeline'
import { FlowDebugPanel } from './_components/FlowDebugPanel'
import ChangeSetReviewDrawer from '../agent/_components/ChangeSetReviewDrawer'

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

  const featureFlags = useQuery(api.featureFlags.getAll)
  const tabEnabled = !!featureFlags?.ff_flow_agent_tab
  const backendEnabled = !!featureFlags?.ff_flow_agent_backend
  const validatorsEnabled = !!featureFlags?.ff_flow_validators_v1
  const clarificationPackEnabled = !!featureFlags?.ff_flow_clarification_pack_v1
  const runnerEnabled = !!featureFlags?.ff_flow_runner_v1
  const webPricingEnabled = !!featureFlags?.ff_flow_web_pricing

  const activeRun = useQuery(
    api.flowRuns.getActiveByProject,
    projectId && backendEnabled ? { projectId } : 'skip'
  )

  const runs = useQuery(
    api.flowRuns.listByProject,
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
    api.flowSteps.listByRun,
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
  const questionsBlock = latestReport?.questionsBlock ?? null

  const reportStats = useMemo(() => {
    if (!latestReport) return null
    const blocking = Array.isArray(latestReport.blockingIssues) ? latestReport.blockingIssues.length : 0
    const fixable = Array.isArray(latestReport.fixableIssues) ? latestReport.fixableIssues.length : 0
    const warnings = Array.isArray(latestReport.warnings) ? latestReport.warnings.length : 0
    const opportunities = Array.isArray(latestReport.opportunities) ? latestReport.opportunities.length : 0

    const questions =
      questionsBlock?.type === 'QuestionsBlock' && Array.isArray(questionsBlock.questions)
        ? questionsBlock.questions.length
        : 0

    const suggestions =
      questionsBlock?.type === 'QuestionsBlock' && Array.isArray(questionsBlock.suggestions)
        ? questionsBlock.suggestions.length
        : 0

    return {
      blocking,
      fixable,
      warnings,
      opportunities,
      questions,
      suggestions,
    }
  }, [latestReport, questionsBlock])

  const [answersByKey, setAnswersByKey] = useState<Record<string, string>>({})

  const brainDump = useQuery(
    api.brainDump.getProjectBrainDump,
    projectId && backendEnabled ? { projectId } : 'skip'
  )

  const startRun = useMutation(api.flowRuns.start)
  const pauseRun = useMutation(api.flowRuns.pause)
  const resumeRun = useMutation(api.flowRuns.resume)
  const cancelRun = useMutation(api.flowRuns.cancel)

  const computeValidation = useMutation(api.flowRuns.computeValidation)
  const runNext = useAction(api.flowRuns.runNext)
  const setToggles = useMutation(api.flowRuns.setToggles)

  const submitFlowAnswers = useMutation((api as any).flowAnswers.submitAnswers)
  const acceptUnknown = useMutation((api as any).flowAnswers.acceptUnknown)
  const dismissOpportunity = useMutation((api as any).flowAnswers.dismissOpportunity)

  const [validationGateOverride, setValidationGateOverride] = useState<
    'G0' | 'G1' | 'G2' | 'G3' | 'G4' | 'G5' | 'G6' | 'G7' | 'G8' | 'G9' | null
  >(null)
  const validationGateId: 'G0' | 'G1' | 'G2' | 'G3' | 'G4' | 'G5' | 'G6' | 'G7' | 'G8' | 'G9' = useMemo(() => {
    if (validationGateOverride) return validationGateOverride
    const gate = selectedRun?.currentGateId
    return gate === 'G0' ||
      gate === 'G1' ||
      gate === 'G2' ||
      gate === 'G3' ||
      gate === 'G4' ||
      gate === 'G5' ||
      gate === 'G6' ||
      gate === 'G7' ||
      gate === 'G8' ||
      gate === 'G9'
      ? gate
      : 'G0'
  }, [selectedRun?.currentGateId, validationGateOverride])

  const appendBrainDump = useMutation(api.brainDump.appendProjectBrainDump)
  const setBrainDump = useMutation(api.brainDump.setProjectBrainDumpRaw)

  const [addendumText, setAddendumText] = useState('')
  const brainDumpLastUpdatedAt = useMemo(() => brainDump?.updatedAt ?? null, [brainDump?.updatedAt])

  const brainDumpReplaceRef = useRef<HTMLTextAreaElement | null>(null)

  const [openChangeSetId, setOpenChangeSetId] = useState<string | null>(null)
  const [openChangeSetFlowRunId, setOpenChangeSetFlowRunId] = useState<string | null>(null)

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
      <FlowRunHeader
        projectId={projectId}
        activeRun={activeRun}
        runs={runs as any}
        selectedRunId={selectedRunId}
        setSelectedRunId={setSelectedRunId}
        onStart={startRun as any}
        onPause={pauseRun as any}
        onResume={resumeRun as any}
        onCancel={cancelRun as any}
        formatTs={formatTs}
        statusLabelHe={statusLabelHe}
      />

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

            {selectedRun ? (
              <div className='mt-3 flex flex-wrap items-center gap-4 text-xs text-gray-600'>
                <label className='inline-flex items-center gap-2'>
                  <input
                    type='checkbox'
                    className='h-4 w-4'
                    disabled={!runnerEnabled}
                    checked={!!selectedRun.toggles?.autoRun}
                    onChange={async (e) => {
                      await setToggles({
                        flowRunId: selectedRun._id,
                        toggles: {
                          autoRun: e.target.checked,
                          useWebSearch: !!selectedRun.toggles?.useWebSearch,
                        },
                      })
                    }}
                  />
                  <span>Auto-run</span>
                </label>

                <label className='inline-flex items-center gap-2'>
                  <input
                    type='checkbox'
                    className='h-4 w-4'
                    disabled={!runnerEnabled || !webPricingEnabled}
                    checked={!!selectedRun.toggles?.useWebSearch && webPricingEnabled}
                    onChange={async (e) => {
                      await setToggles({
                        flowRunId: selectedRun._id,
                        toggles: {
                          autoRun: !!selectedRun.toggles?.autoRun,
                          useWebSearch: e.target.checked,
                        },
                      })
                    }}
                  />
                  <span title={webPricingEnabled ? 'מפעיל שימוש ב-Web Pricing (אם יש Skill רלוונטי)' : 'יש להדליק ff_flow_web_pricing'}>
                    Web search
                  </span>
                </label>

                {!webPricingEnabled ? (
                  <span className='text-gray-400'>Web pricing מושבת (ff_flow_web_pricing)</span>
                ) : null}
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
            <option value='G4'>G4 — Pricing</option>
            <option value='G5'>G5 — Tasks Enrichment</option>
            <option value='G6'>G6 — Ops Completeness</option>
            <option value='G7'>G7 — Pricing Recheck</option>
            <option value='G8'>G8 — Quote</option>
            <option value='G9'>G9 — Audit</option>
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

          <button
            className='px-3 py-2 rounded-lg bg-black text-white text-sm disabled:opacity-50'
            disabled={!selectedRun?._id || !runnerEnabled}
            onClick={async () => {
              if (!selectedRun?._id) return
              await runNext({ flowRunId: selectedRun._id })
            }}
            title={runnerEnabled ? 'התקדם לשער הבא' : 'יש להדליק ff_flow_runner_v1'}
          >
            המשך (Run next)
          </button>

          {!validatorsEnabled ? (
            <div className='text-xs text-gray-500'>וולידטורים מושבתים (ff_flow_validators_v1)</div>
          ) : null}

          {!runnerEnabled ? (
            <div className='text-xs text-gray-500'>Runner מושבת (ff_flow_runner_v1)</div>
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

          {reportStats ? (
            <div className='mt-3 flex flex-wrap gap-2 text-xs'>
              <span className='px-2 py-1 rounded-md bg-gray-100 border'>חסימות: {reportStats.blocking}</span>
              <span className='px-2 py-1 rounded-md bg-gray-100 border'>ניתן לתיקון: {reportStats.fixable}</span>
              <span className='px-2 py-1 rounded-md bg-gray-100 border'>אזהרות: {reportStats.warnings}</span>
              <span className='px-2 py-1 rounded-md bg-gray-100 border'>הזדמנויות: {reportStats.opportunities}</span>
              <span className='px-2 py-1 rounded-md bg-gray-100 border'>שאלות: {reportStats.questions}</span>
              <span className='px-2 py-1 rounded-md bg-gray-100 border'>הצעות: {reportStats.suggestions}</span>
            </div>
          ) : null}

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

      {clarificationPackEnabled && questionsBlock?.type === 'QuestionsBlock' ? (
        <div className='bg-white border rounded-xl p-4 space-y-4'>
          <div className='flex items-start justify-between gap-4'>
            <div>
              <div className='text-sm font-medium text-gray-900'>
                {questionsBlock.titleHe ?? 'שאלות להשלמה'}
              </div>
              <div className='mt-1 text-xs text-gray-500'>
                תשובות נשמרות ב-QA ולא יישאלו שוב.
              </div>
            </div>

            <button
              className='px-3 py-2 rounded-lg bg-gray-900 text-white text-sm disabled:opacity-50'
              disabled={!selectedRun?._id || !(questionsBlock.questions?.length > 0)}
              onClick={async () => {
                if (!selectedRun?._id) return
                await submitFlowAnswers({
                  flowRunId: selectedRun._id,
                  answersByKey,
                })
                await computeValidation({
                  flowRunId: selectedRun._id,
                  gateId: validationGateId,
                })
              }}
            >
              {questionsBlock.submitLabelHe ?? 'שמור תשובות'}
            </button>
          </div>

          <div className='space-y-3'>
            {(questionsBlock.questions ?? []).map((q: any) => (
              <div key={q.id} className='rounded-lg border p-3'>
                <div className='text-sm font-medium text-gray-900'>{q.textHe ?? q.id}</div>
                {q.detailHe ? <div className='mt-1 text-xs text-gray-600'>{q.detailHe}</div> : null}

                <div className='mt-3 flex items-start gap-3'>
                  <textarea
                    className='flex-1 border rounded-lg px-3 py-2 text-sm min-h-[72px]'
                    placeholder='הקלידו תשובה...'
                    value={answersByKey[q.id] ?? ''}
                    onChange={(e) =>
                      setAnswersByKey((prev) => ({
                        ...prev,
                        [q.id]: e.target.value,
                      }))
                    }
                  />

                  <button
                    className='px-3 py-2 rounded-lg bg-white border text-sm text-gray-900'
                    disabled={!selectedRun?._id}
                    onClick={async () => {
                      if (!selectedRun?._id) return
                      await acceptUnknown({ flowRunId: selectedRun._id, issueKey: q.id })
                      await computeValidation({
                        flowRunId: selectedRun._id,
                        gateId: validationGateId,
                      })
                    }}
                  >
                    לא יודע
                  </button>
                </div>
              </div>
            ))}
          </div>

          {Array.isArray(questionsBlock.suggestions) && questionsBlock.suggestions.length > 0 ? (
            <div className='pt-3 border-t space-y-2'>
              <div className='text-sm font-medium text-gray-900'>הצעות (לא חוסם)</div>
              {(questionsBlock.suggestions ?? []).map((s: any) => (
                <div key={s.key} className='rounded-lg border p-3 flex items-start justify-between gap-4'>
                  <div>
                    <div className='text-sm font-medium text-gray-900'>{s.titleHe ?? s.key}</div>
                    {s.detailHe ? <div className='mt-1 text-xs text-gray-600'>{s.detailHe}</div> : null}
                    <div className='mt-1 text-[11px] text-gray-500'>{s.key}</div>
                  </div>
                  <button
                    className='px-3 py-2 rounded-lg bg-white border text-sm text-gray-900'
                    disabled={!selectedRun?._id}
                    onClick={async () => {
                      if (!selectedRun?._id) return
                      await dismissOpportunity({ flowRunId: selectedRun._id, opportunityKey: s.key })
                      await computeValidation({
                        flowRunId: selectedRun._id,
                        gateId: validationGateId,
                      })
                    }}
                  >
                    לא להציע שוב
                  </button>
                </div>
              ))}
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

      {openChangeSetId && projectId ? (
        <ChangeSetReviewDrawer
          open={true}
          onClose={() => {
            setOpenChangeSetId(null)
            setOpenChangeSetFlowRunId(null)
          }}
          closeOnResolve={false}
          showApplyAndContinue={true}
          flowRunIdForContinue={openChangeSetFlowRunId as any}
          changeSetId={openChangeSetId as any}
          projectId={projectId as any}
        />
      ) : null}

      <FlowTimeline
        selectedRun={selectedRun}
        steps={steps as any}
        formatTs={formatTs}
        statusLabelHe={statusLabelHe}
        onOpenChangeSet={(id) => {
          setOpenChangeSetId(id)
          setOpenChangeSetFlowRunId((selectedRun?._id as any) ?? null)
        }}
      />

      <FlowDebugPanel selectedRun={selectedRun} latestStepWithReport={latestStepWithReport} />
    </div>
  )
}
