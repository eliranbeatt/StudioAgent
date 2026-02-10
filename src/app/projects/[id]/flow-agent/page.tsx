'use client'

import { useAction, useMutation, useQuery } from 'convex/react'
import { useParams } from 'next/navigation'
import { useMemo, useState } from 'react'
import { api } from '../../../../../convex/_generated/api'
import { FlowRunHeader } from './_components/FlowRunHeader'
import { FlowTimeline } from './_components/FlowTimeline'
import { FlowDebugPanel } from './_components/FlowDebugPanel'
import { FlowQuestionsLane } from './_components/FlowQuestionsLane'
import { FlowElementsHealthPanel } from './_components/FlowElementsHealthPanel'
import { FlowWorkflowGpsPanel } from './_components/FlowWorkflowGpsPanel'
import ChangeSetReviewDrawer from '../agent/_components/ChangeSetReviewDrawer'

function formatTs(ts: number | null | undefined) {
  if (!ts) return '—'
  try {
    return new Date(ts).toLocaleString('he-IL')
  } catch {
    return String(ts)
  }
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

export default function FlowAgentPage() {
  const params = useParams()
  const rawId = params.id as string
  const resolved = useQuery(api.projects.resolveProjectId, { id: rawId })
  const projectId = resolved?.projectId ?? null

  const featureFlags = useQuery(api.featureFlags.getAll)
  const tabEnabled = !!featureFlags?.ff_flow_agent_tab
  const backendEnabled = !!featureFlags?.ff_flow_agent_backend
  const runnerEnabled = !!featureFlags?.ff_flow_runner_v1 || !!featureFlags?.ff_flow_runner_v2
  const v2Enabled = !!featureFlags?.ff_flow_runner_v2
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
  const [showDebug, setShowDebug] = useState(false)
  const [reviewChangeSetId, setReviewChangeSetId] = useState<string | null>(null)

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
  const nodeRuns = useQuery(
    api.flowNodeRuns.listByRun,
    selectedRun?._id && backendEnabled ? { flowRunId: selectedRun._id } : 'skip'
  )
  const applyLogs = useQuery(
    api.flowChangeSetApplyLogs.listByRun,
    selectedRun?._id && backendEnabled ? { flowRunId: selectedRun._id } : 'skip'
  )

  const startRun = useMutation(api.flowRuns.start)
  const pauseRun = useMutation(api.flowRuns.pause)
  const resumeRun = useMutation(api.flowRuns.resume)
  const cancelRun = useMutation(api.flowRuns.cancel)
  const runNext = useAction(api.flowRuns.runNext)
  const setToggles = useMutation(api.flowRuns.setToggles)
  const setApprovalMode = useMutation(api.flowRuns.setApprovalMode)
  const runAudit = useAction(api.flow.audit.run)
  const setFlag = useMutation(api.featureFlags.setFlag)
  const auditStaleness = useQuery(
    api.flow.audit.getStaleness,
    selectedRun?._id ? { flowRunId: selectedRun._id } : 'skip'
  )

  if (!resolved) {
    return <div className='p-8 text-gray-500'>Loading project...</div>
  }

  if (!projectId) {
    return <div className='p-8 text-gray-500'>Project not found.</div>
  }

  if (!tabEnabled) {
    return (
      <div className='p-8'>
        <h1 className='text-lg font-semibold text-gray-900'>Flow Agent</h1>
        <p className='mt-2 text-sm text-gray-600'>Flow Agent is currently disabled.</p>
      </div>
    )
  }

  if (!backendEnabled) {
    return (
      <div className='p-8'>
        <h1 className='text-lg font-semibold text-gray-900'>Flow Agent</h1>
        <p className='mt-2 text-sm text-gray-600'>Backend is disabled. Enable ff_flow_agent_backend to continue.</p>
      </div>
    )
  }

  return (
    <div className='flex flex-col h-full bg-slate-50'>
      <div className='p-6 space-y-4'>
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
          webPricingEnabled={webPricingEnabled}
          defaultUseWebSearch={webPricingEnabled}
          defaultPlanningMode='separated'
        />

        <div className='bg-white border rounded-xl p-4'>
          <div className='flex flex-wrap items-center justify-between gap-4'>
            <div>
              <div className='text-sm font-medium text-gray-900'>Run status</div>
              <div className='mt-1 text-sm text-gray-600'>
                {selectedRun ? (
                  <>
                    {statusLabelHe(selectedRun.status)} • Gate: {selectedRun.currentGateId}
                  </>
                ) : (
                  'No run selected'
                )}
              </div>
            </div>

            <div className='flex flex-wrap items-center gap-2'>
              <button
                className='px-3 py-2 rounded-lg bg-slate-900 text-white text-sm disabled:opacity-50'
                disabled={!selectedRun?._id || !runnerEnabled}
                onClick={async () => {
                  if (!selectedRun?._id) return
                  await runNext({ flowRunId: selectedRun._id })
                }}
                title={runnerEnabled ? 'Advance to next step' : 'Enable ff_flow_runner_v1 or ff_flow_runner_v2'}
              >
                Run next
              </button>

              <button
                className='px-3 py-2 rounded-lg bg-white border text-sm text-gray-900'
                onClick={() => setShowDebug((prev) => !prev)}
              >
                {showDebug ? 'Hide debug' : 'Show debug'}
              </button>
            </div>
          </div>

          {selectedRun ? (
            <div className='mt-4 flex flex-wrap items-center gap-4 text-xs text-gray-600'>
              <label className='inline-flex items-center gap-2'>
                <span>Approval mode</span>
                <select
                  className='border rounded-md px-2 py-1 text-xs bg-white'
                  value={
                    selectedRun.approvalMode ??
                    (selectedRun.toggles?.autoApprove ? 'auto' : 'manual')
                  }
                  onChange={async (e) => {
                    await setApprovalMode({
                      flowRunId: selectedRun._id,
                      approvalMode: e.target.value as 'auto' | 'manual',
                    })
                  }}
                >
                  <option value='auto'>Auto-approve</option>
                  <option value='manual'>Manual approve</option>
                </select>
              </label>

              <label className='inline-flex items-center gap-2'>
                <span>Planning mode</span>
                <select
                  className='border rounded-md px-2 py-1 text-xs bg-white'
                  value={selectedRun.toggles?.planningMode === 'combined' ? 'combined' : 'separated'}
                  onChange={async (e) => {
                    await setToggles({
                      flowRunId: selectedRun._id,
                      toggles: {
                        planningMode: e.target.value as 'separated' | 'combined',
                      },
                    })
                  }}
                >
                  <option value='separated'>Separated</option>
                  <option value='combined'>Combined B+C</option>
                </select>
              </label>

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
                        autoApprove: !!selectedRun.toggles?.autoApprove,
                        useWebSearch: !!selectedRun.toggles?.useWebSearch,
                        planningMode: selectedRun.toggles?.planningMode === 'combined' ? 'combined' : 'separated',
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
                        autoApprove: !!selectedRun.toggles?.autoApprove,
                        useWebSearch: e.target.checked,
                        planningMode: selectedRun.toggles?.planningMode === 'combined' ? 'combined' : 'separated',
                      },
                    })
                  }}
                />
                <span>Web pricing</span>
              </label>

              <label className='inline-flex items-center gap-2'>
                <input
                  type='checkbox'
                  className='h-4 w-4'
                  checked={v2Enabled}
                  onChange={async (e) => {
                    await setFlag({ name: 'ff_flow_runner_v2', enabled: e.target.checked })
                  }}
                />
                <span>Use v2 runner</span>
              </label>
            </div>
          ) : null}

          {activeRun ? (
            <div className='mt-4 flex flex-wrap items-center gap-2'>
              <button
                className='px-3 py-2 rounded-lg bg-white border text-sm text-gray-900'
                onClick={async () => {
                  await cancelRun({ flowRunId: activeRun._id })
                  await startRun({
                    projectId: projectId as any,
                    useWebSearch: !!activeRun.toggles?.useWebSearch,
                    planningMode: activeRun.toggles?.planningMode === 'combined' ? 'combined' : 'separated',
                  })
                }}
              >
                Restart flow
              </button>
            </div>
          ) : null}

          {selectedRun?.status === 'completed' ? (
            <div className='mt-4 flex flex-wrap items-center gap-2'>
              <button
                className='px-3 py-2 rounded-lg bg-slate-900 text-white text-sm'
                onClick={async () => {
                  if (!selectedRun?._id) return
                  await runAudit({ flowRunId: selectedRun._id })
                }}
              >
                Run Audit & Repair
              </button>
              <button
                className='px-3 py-2 rounded-lg bg-white border text-sm text-gray-900'
                onClick={() => null}
              >
                Finish without polish
              </button>
              {auditStaleness?.stale ? (
                <div className='text-xs text-amber-600'>
                  Audit stale: answers/artifacts changed since last audit.
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      <div className='flex-1 min-h-0 border-t border-slate-200'>
        <div className='grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px_280px] gap-4 p-6 h-full'>
          <div className='flex flex-col min-h-0'>
            {selectedRun?._id ? (
              <FlowQuestionsLane flowRunId={selectedRun._id} isRunning={selectedRun.status === 'running'} />
            ) : (
              <div className='rounded-xl border border-dashed border-slate-200 bg-white p-6 text-sm text-slate-500'>
                Start a run to open the clarifications lane.
              </div>
            )}
          </div>

          <div className='hidden xl:flex min-h-0'>
            {projectId ? <FlowElementsHealthPanel projectId={projectId as any} /> : null}
          </div>

          <div className='hidden xl:flex min-h-0'>
            {selectedRun?._id ? <FlowWorkflowGpsPanel flowRunId={selectedRun._id} /> : null}
          </div>
        </div>
      </div>

      {showDebug ? (
        <div className='p-6 space-y-4 border-t border-slate-200 bg-white'>
          <FlowTimeline
            selectedRun={selectedRun}
            steps={steps as any}
            nodeRuns={nodeRuns as any}
            formatTs={formatTs}
            statusLabelHe={statusLabelHe}
            onOpenChangeSet={(id) => setReviewChangeSetId(id)}
          />
          <FlowDebugPanel
            selectedRun={selectedRun}
            latestStepWithReport={steps?.[steps.length - 1] ?? null}
            nodeRuns={nodeRuns as any}
            applyLogs={applyLogs as any}
          />
        </div>
      ) : null}

      {reviewChangeSetId ? (
        <ChangeSetReviewDrawer
          open={true}
          onClose={() => setReviewChangeSetId(null)}
          changeSetId={reviewChangeSetId as any}
          projectId={projectId as any}
        />
      ) : null}
    </div>
  )
}
