'use client'

import { useAction, useMutation, useQuery } from 'convex/react'
import { useParams } from 'next/navigation'
import { useMemo, useState } from 'react'
import { api } from '../../../../../convex/_generated/api'
import { FlowRunHeader } from './_components/FlowRunHeader'
import { FlowTimeline } from './_components/FlowTimeline'
import { FlowDebugPanel } from './_components/FlowDebugPanel'
import { FlowChat } from './_components/FlowChat'

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

  const elementsSummary = useQuery(
    api.elements.listByProject,
    projectId && backendEnabled ? { projectId } : 'skip'
  )

  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)
  const [showPanel, setShowPanel] = useState(true)
  const [showDebug, setShowDebug] = useState(false)

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

  const startRun = useMutation(api.flowRuns.start)
  const pauseRun = useMutation(api.flowRuns.pause)
  const resumeRun = useMutation(api.flowRuns.resume)
  const cancelRun = useMutation(api.flowRuns.cancel)
  const runNext = useAction(api.flowRuns.runNext)
  const setToggles = useMutation(api.flowRuns.setToggles)
  const setApprovalMode = useMutation(api.flowRuns.setApprovalMode)

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
                title={runnerEnabled ? 'Advance to next step' : 'Enable ff_flow_runner_v1'}
              >
                Run next
              </button>

              <button
                className='px-3 py-2 rounded-lg bg-white border text-sm text-gray-900'
                onClick={() => setShowPanel((prev) => !prev)}
              >
                {showPanel ? 'Hide panel' : 'Show panel'}
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
                      },
                    })
                  }}
                />
                <span>Web pricing</span>
              </label>
            </div>
          ) : null}
        </div>
      </div>

      <div className='flex flex-1 min-h-0 border-t border-slate-200'>
        <div className='flex-1 min-w-0'>
          {selectedRun?.conversationId ? (
            <FlowChat
              conversationId={selectedRun.conversationId}
              projectId={projectId as any}
              flowRunId={selectedRun._id}
            />
          ) : (
            <div className='p-8 text-sm text-slate-500'>Start a run to open the flow chat.</div>
          )}
        </div>

        {showPanel ? (
          <div className='w-80 border-l border-slate-200 bg-white p-4 overflow-y-auto'>
            <div className='text-xs font-semibold text-slate-700 uppercase tracking-wide'>Project data</div>
            <div className='mt-2 text-xs text-slate-500'>
              Elements: {elementsSummary?.elements?.length ?? 0}
            </div>
            <div className='mt-4 space-y-3'>
              {(elementsSummary?.elements ?? []).slice(0, 12).map((el: any) => (
                <div key={el.id} className='rounded-lg border border-slate-100 p-3 text-xs'>
                  <div className='font-medium text-slate-800'>{el.title}</div>
                  <div className='mt-1 text-[11px] text-slate-500'>
                    {el.type} • Tasks: {el.taskCount ?? 0}
                  </div>
                </div>
              ))}
              {(elementsSummary?.elements ?? []).length > 12 ? (
                <div className='text-[11px] text-slate-400'>Showing first 12 elements.</div>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      {showDebug ? (
        <div className='p-6 space-y-4 border-t border-slate-200 bg-white'>
          <FlowTimeline
            selectedRun={selectedRun}
            steps={steps as any}
            formatTs={formatTs}
            statusLabelHe={statusLabelHe}
            onOpenChangeSet={() => null}
          />
          <FlowDebugPanel selectedRun={selectedRun} latestStepWithReport={steps?.[steps.length - 1] ?? null} />
        </div>
      ) : null}
    </div>
  )
}
