'use client';

import { useAction, useMutation, useQuery } from 'convex/react';
import { useParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { api } from '../../../../../convex/_generated/api';
import { Id } from '../../../../../convex/_generated/dataModel';
import { ChatBlock } from '../agent/_components/Blocks/ChatBlock';
import { QuestionsBlock } from '../agent/_components/Blocks/QuestionsBlock';
import { SuggestionBlock } from '../agent/_components/Blocks/SuggestionBlock';
import { ChangeSetBlock } from '../agent/_components/Blocks/ChangeSetBlock';
import { ReviewBlock } from '../agent/_components/Blocks/ReviewBlock';
import { ShoppingPlanBlock } from '../agent/_components/Blocks/ShoppingPlanBlock';
import { PrintQaBlock } from '../agent/_components/Blocks/PrintQaBlock';
import { ReceiptBlock } from '../agent/_components/Blocks/ReceiptBlock';
import { RunbookBlock } from '../agent/_components/Blocks/RunbookBlock';
import { DailyPlanBlock } from '../agent/_components/Blocks/DailyPlanBlock';
import ChangeSetReviewDrawer from '../agent/_components/ChangeSetReviewDrawer';
import { Check, Pencil, Send, Sparkles, Trash2, X } from 'lucide-react';
import { AnswerChips, type AnswerSource } from './_components/AnswerChips';

export default function SdkAgentPage() {
  const params = useParams();
  const rawId = params.id as string;
  const resolved = useQuery(api.projects.resolveProjectId, { id: rawId });
  const projectId = resolved?.projectId ?? null;

  const featureFlags = useQuery(api.featureFlags.getAll);
  const isEnabled = featureFlags?.ff_sdk_agent_tab;
  const isBackendEnabled = featureFlags?.ff_sdk_agent_backend;
  const isVnextUiEnabled = featureFlags?.ff_sdk_vnext_ui;

  const conversations = useQuery(
    api.sdk.api.listConversations,
    projectId ? { projectId } : 'skip'
  );
  const [selectedConvId, setSelectedConvId] = useState<Id<'agentConversations'> | null>(null);
  const [reviewChangeSetId, setReviewChangeSetId] = useState<Id<'changeSets'> | null>(null);

  const effectiveConvId = selectedConvId ?? conversations?.[0]?._id ?? null;

  const runs = useQuery(
    api.sdk.api.listRuns,
    effectiveConvId ? { conversationId: effectiveConvId } : 'skip'
  );
  const activeRun = runs && runs.length > 0 ? runs[0] : null;

  const messages = useQuery(
    api.sdk.api.listMessages,
    effectiveConvId ? { conversationId: effectiveConvId, limit: 100 } : 'skip'
  );
  const pricingSnapshots = useQuery(
    api.sdk.api.listRunEvents,
    activeRun?._id ? { runId: activeRun._id, type: 'pricing_queue_snapshot', limit: 1 } : 'skip'
  );
  const latestRunEvents = useQuery(
    api.sdk.api.listRunEvents,
    activeRun?._id ? { runId: activeRun._id, limit: 4 } : 'skip'
  );
  const sdkQuestionSet = useQuery(
    api.sdk.questions.peekNextSet,
    projectId && activeRun?._id
      ? { projectId, runId: activeRun._id, limit: 6 }
      : 'skip'
  );
  const finalizeContext = useQuery(
    api.sdk.api.contextGet,
    projectId ? { projectId, packs: ['elements', 'tasks', 'accounting'] } : 'skip'
  );

  const createConversation = useMutation(api.sdk.api.createConversation);
  const renameConversation = useMutation(api.sdk.api.renameConversation);
  const deleteConversation = useMutation(api.sdk.api.deleteConversation);
  const startRun = useMutation(api.sdk.api.startRun);
  const startVnextRun = useMutation(api.sdk.api.startVnextRun);
  const answerVnext = useMutation(api.sdk.api.answerVnext);
  const pauseRun = useMutation(api.sdk.api.pauseRun);
  const resumeRun = useMutation(api.sdk.api.resumeRun);
  const cancelRun = useMutation(api.sdk.api.cancelRun);
  const continueVnext = useAction(api.sdk.api.continueVnext);
  const bootstrapFastPlan = useAction(api.sdk.api.bootstrapFastPlan);
  const submitSdkAnswers = useMutation(api.sdk.questions.submitAnswers);
  const regenerateQuestionsManual = useAction(api.sdk.rebaseNode.regenerateQuestionsManual);
  const finalizeNow = useAction(api.sdk.api.finalizeNow);
  const generateConversationTitle = useAction(api.sdk.api.generateConversationTitle);
  const approveChangeSet = useAction(api.sdk.api.approveChangeSet);
  const shadowEvaluate = useAction(api.sdk.api.shadowEvaluate);
  const runNext = useAction(api.sdk.dispatch.runNext);

  const [input, setInput] = useState('');
  const [editingConvId, setEditingConvId] = useState<Id<'agentConversations'> | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [savingTitleId, setSavingTitleId] = useState<Id<'agentConversations'> | null>(null);
  const [deletingConvId, setDeletingConvId] = useState<Id<'agentConversations'> | null>(null);
  const [generatingTitleId, setGeneratingTitleId] = useState<Id<'agentConversations'> | null>(null);
  const [nowMs, setNowMs] = useState(0);
  const [isDispatching, setIsDispatching] = useState(false);
  const [dispatchStartedAt, setDispatchStartedAt] = useState<number | null>(null);
  const [manualRegenBusy, setManualRegenBusy] = useState(false);
  const [manualRegenNotice, setManualRegenNotice] = useState<string | null>(null);
  const [finalizeBusy, setFinalizeBusy] = useState(false);
  const [finalizeNotice, setFinalizeNotice] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const runStatus = activeRun?.status;
  const isRunActive =
    runStatus === 'running' ||
    runStatus === 'awaiting_approval' ||
    runStatus === 'blocked' ||
    runStatus === 'needs_input';
  const runMessages = (messages ?? []).filter((m: any) => m.runId === activeRun?._id);
  const lastUserIndex = [...runMessages]
    .map((m: any, idx: number) => ({ m, idx }))
    .filter(({ m }) => m.role === 'user')
    .map(({ idx }) => idx)
    .pop();
  const hasAssistantAfterUser =
    typeof lastUserIndex === 'number' &&
    runMessages.slice(lastUserIndex + 1).some((m: any) => m.role === 'assistant' || m.role === 'system');
  const pendingTurnStartedAt =
    typeof lastUserIndex === 'number' && !hasAssistantAfterUser
      ? runMessages[lastUserIndex]?.createdAt ?? null
      : null;
  const showProgress =
    !!pendingTurnStartedAt ||
    isDispatching ||
    runStatus === 'awaiting_approval' ||
    runStatus === 'blocked' ||
    runStatus === 'needs_input';
  const timerStart = pendingTurnStartedAt ?? (isDispatching ? dispatchStartedAt : null);
  const statusLabel = getSdkStatusLabel(activeRun);
  const latestPricingSnapshot = pricingSnapshots?.[0]?.payload?.queueSummary ?? null;
  const latestEvent = latestRunEvents?.[0] ?? null;
  const statusDetail = getSdkStatusDetail(activeRun, latestPricingSnapshot, latestEvent);
  const elapsedMs = timerStart ? Math.max(0, nowMs - timerStart) : 0;
  const isStale = !!activeRun?.updatedAt && runStatus === 'running' && nowMs - activeRun.updatedAt > 90_000;
  const isRegenRunning = manualRegenBusy || activeRun?.regenStatus === 'running';
  const unresolvedCount = Number(sdkQuestionSet?.unresolvedCount ?? 0);
  const plannedEntitiesCount =
    Number((finalizeContext as any)?.elements?.length ?? 0) +
    Number((finalizeContext as any)?.tasks?.length ?? 0) +
    Number((finalizeContext as any)?.materialLines?.length ?? 0) +
    Number((finalizeContext as any)?.workLines?.length ?? 0);
  const canFinalizeNow =
    Boolean(activeRun?._id) &&
    !finalizeBusy;

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, showProgress]);

  useEffect(() => {
    if (!showProgress) return;
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [showProgress]);

  const handleCreate = async () => {
    if (!projectId) return;
    const id = await createConversation({ projectId, title: 'New SDK Session' });
    setSelectedConvId(id);
    if (isVnextUiEnabled) {
      const started = await startVnextRun({ projectId, conversationId: id });
      if (started?.runId) {
        await bootstrapFastPlan({
          projectId,
          conversationId: id,
          runId: started.runId,
        });
      }
    } else {
      await startRun({ projectId, conversationId: id });
    }
  };

  const handleStartRun = async (shadowMode = false) => {
    if (!projectId || !effectiveConvId) return;
    if (isVnextUiEnabled) {
      const started = await startVnextRun({ projectId, conversationId: effectiveConvId, shadowMode });
      if (started?.runId) {
        await bootstrapFastPlan({
          projectId,
          conversationId: effectiveConvId,
          runId: started.runId,
        });
      }
    } else {
      await startRun({ projectId, conversationId: effectiveConvId, shadowMode });
    }
  };

  const handleRenameStart = (conversationId: Id<'agentConversations'>, currentTitle?: string) => {
    setEditingConvId(conversationId);
    setEditingTitle(currentTitle ?? '');
  };

  const handleRenameSave = async () => {
    if (!editingConvId) return;
    const nextTitle = editingTitle.trim();
    if (!nextTitle) return;

    setSavingTitleId(editingConvId);
    try {
      await renameConversation({
        conversationId: editingConvId,
        title: nextTitle,
      });
      setEditingConvId(null);
      setEditingTitle('');
    } finally {
      setSavingTitleId(null);
    }
  };

  const handleRenameCancel = () => {
    setEditingConvId(null);
    setEditingTitle('');
  };

  const handleDeleteConversation = async (conversationId: Id<'agentConversations'>) => {
    const confirmed = window.confirm('Delete this conversation and all related messages/runs?');
    if (!confirmed) return;

    setDeletingConvId(conversationId);
    try {
      await deleteConversation({ conversationId });
      if (selectedConvId === conversationId) {
        setSelectedConvId(null);
      }
      if (editingConvId === conversationId) {
        setEditingConvId(null);
        setEditingTitle('');
      }
    } finally {
      setDeletingConvId(null);
    }
  };

  const handleGenerateTitle = async (conversationId: Id<'agentConversations'>) => {
    if (!projectId) return;
    setGeneratingTitleId(conversationId);
    try {
      await generateConversationTitle({ conversationId, projectId });
      if (editingConvId === conversationId) {
        setEditingConvId(null);
        setEditingTitle('');
      }
    } finally {
      setGeneratingTitleId(null);
    }
  };

  const handleSend = async () => {
    if (!projectId || !effectiveConvId || !activeRun || !input.trim()) return;
    setIsDispatching(true);
    setDispatchStartedAt(Date.now());
    try {
      await runNext({
        projectId,
        conversationId: effectiveConvId,
        runId: activeRun._id,
        userMessage: input.trim(),
      });
      setInput('');
    } finally {
      setIsDispatching(false);
    }
  };

  const handleSuggestionSubmit = async (text: string, payload?: any) => {
    if (!projectId || !effectiveConvId || !activeRun) return;

    // Handle vNext continue action
    if (payload?.action === 'sdk.vnext.continue') {
      setIsDispatching(true);
      setDispatchStartedAt(Date.now());
      try {
        await continueVnext({
          projectId,
          conversationId: effectiveConvId,
          runId: activeRun._id,
        });
      } finally {
        setIsDispatching(false);
      }
      return;
    }

    // Default: runNext with key text
    setIsDispatching(true);
    setDispatchStartedAt(Date.now());
    try {
      await runNext({
        projectId,
        conversationId: effectiveConvId,
        runId: activeRun._id,
        userMessage: text,
      });
    } finally {
      setIsDispatching(false);
    }
  };

  const handleSubmitSdkQuestionSet = async (answersById: Record<string, string>, answerSources?: Record<string, AnswerSource>) => {
    if (!activeRun?._id || isRegenRunning) return;
    const answers = Object.entries(answersById).map(([qaPairId, answer]) => ({
      qaPairId: qaPairId as Id<'qaPairs'>,
      answer,
      answerSource: answerSources?.[qaPairId] as any,
    }));
    if (answers.length === 0) return;

    setIsDispatching(true);
    setDispatchStartedAt(Date.now());
    try {
      await submitSdkAnswers({
        runId: activeRun._id,
        answers,
        intent: 'answer',
      });
      if (projectId && effectiveConvId) {
        await continueVnext({
          projectId,
          conversationId: effectiveConvId,
          runId: activeRun._id,
        });
      }
    } finally {
      setIsDispatching(false);
    }
  };

  const handleManualRegen = async () => {
    if (!projectId || !activeRun?._id || isRegenRunning) return;
    setManualRegenBusy(true);
    setManualRegenNotice(null);
    try {
      const result = await regenerateQuestionsManual({
        projectId,
        runId: activeRun._id,
        conversationId: effectiveConvId ?? undefined,
      });
      if (result?.status === 'already_running') {
        setManualRegenNotice('Regeneration is already running.');
        return;
      }
      if (!result?.ok) {
        setManualRegenNotice('Regeneration failed. Retry.');
        return;
      }
      const added = Number(result?.summary?.added ?? 0);
      const dismissed = Number(result?.summary?.dismissed ?? 0);
      const promoted = Number(result?.summary?.promoted ?? 0);
      setManualRegenNotice(`Updated: +${added} new questions, ${dismissed} dismissed, ${promoted} promoted to blockers.`);
    } catch {
      setManualRegenNotice('Regeneration failed. Retry.');
    } finally {
      setManualRegenBusy(false);
    }
  };

  const handleFinalizeNow = async () => {
    if (!projectId || !activeRun?._id) return;
    setFinalizeBusy(true);
    setFinalizeNotice(null);
    try {
      const pkg = await finalizeNow({
        projectId,
        conversationId: effectiveConvId ?? activeRun.conversationId,
        runId: activeRun._id,
        includeAssumptions: true,
      });
      const counts = pkg?.counts ?? {
        elements: 0,
        tasks: 0,
        unresolved: 0,
      };
      setFinalizeNotice(
        `Finalized package ready. Elements: ${Number(counts.elements ?? 0)}, Tasks: ${Number(counts.tasks ?? 0)}, Unresolved: ${Number(counts.unresolved ?? 0)}`
      );
    } catch (error: any) {
      setFinalizeNotice(`Finalize failed: ${String(error?.message ?? 'unknown error')}`);
    } finally {
      setFinalizeBusy(false);
    }
  };

  if (!isEnabled) {
    return <div className="p-8">SDK Agent Tab is disabled via Feature Flags.</div>;
  }

  if (!projectId) {
    return <div className="p-8 text-slate-400">Loading project...</div>;
  }

  return (
    <div className="flex h-full bg-slate-50">
      {/* Left Sidebar */}
      <div className="w-64 border-r border-slate-200 bg-white flex flex-col">
        <div className="p-4 border-b border-slate-100 flex justify-between items-center">
          <h2 className="font-semibold text-sm text-slate-700">SDK Sessions</h2>
          <button
            onClick={handleCreate}
            className="text-blue-600 hover:bg-blue-50 p-1 rounded"
            title="New Session"
          >
            + New
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {!conversations ? (
            <div className="text-xs text-slate-400 p-2">Loading...</div>
          ) : conversations.length === 0 ? (
            <div className="text-xs text-slate-400 p-2">No history yet</div>
          ) : (
            conversations.map((c) => (
              <div
                key={c._id}
                className={`group flex items-center w-full rounded-md text-xs transition-colors ${effectiveConvId === c._id
                  ? 'bg-blue-50 text-blue-700 font-medium'
                  : 'text-slate-600 hover:bg-slate-50'
                  }`}
                onClick={() => setSelectedConvId(c._id)}
              >
                <div className="flex-1 flex justify-between items-center gap-2 p-2 cursor-pointer">
                  <div className="flex flex-col min-w-0 flex-1">
                    {editingConvId === c._id ? (
                      <input
                        autoFocus
                        value={editingTitle}
                        onClick={(event) => event.stopPropagation()}
                        onChange={(event) => setEditingTitle(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault();
                            handleRenameSave();
                          }
                          if (event.key === 'Escape') {
                            event.preventDefault();
                            handleRenameCancel();
                          }
                        }}
                        className="w-full rounded border border-blue-200 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-200"
                      />
                    ) : (
                      <span className="truncate">{c.title || 'Untitled'}</span>
                    )}
                    <span className="text-[10px] text-slate-400 font-normal">
                      {new Date(c.updatedAt).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    {editingConvId === c._id ? (
                      <>
                        <button
                          onClick={(event) => {
                            event.stopPropagation();
                            handleRenameSave();
                          }}
                          disabled={!editingTitle.trim() || savingTitleId === c._id}
                          className="p-1 rounded text-green-600 hover:bg-green-50 disabled:opacity-50"
                          title="Save name"
                        >
                          <Check size={14} />
                        </button>
                        <button
                          onClick={(event) => {
                            event.stopPropagation();
                            handleRenameCancel();
                          }}
                          className="p-1 rounded text-slate-500 hover:bg-slate-100"
                          title="Cancel"
                        >
                          <X size={14} />
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={(event) => {
                            event.stopPropagation();
                            handleRenameStart(c._id, c.title);
                          }}
                          className="p-1 rounded text-slate-500 hover:bg-slate-100"
                          title="Edit name"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={(event) => {
                            event.stopPropagation();
                            handleGenerateTitle(c._id);
                          }}
                          disabled={generatingTitleId === c._id}
                          className="p-1 rounded text-indigo-600 hover:bg-indigo-50 disabled:opacity-50"
                          title="Generate title"
                        >
                          <Sparkles size={14} />
                        </button>
                        <button
                          onClick={(event) => {
                            event.stopPropagation();
                            handleDeleteConversation(c._id);
                          }}
                          disabled={deletingConvId === c._id}
                          className="p-1 rounded text-red-600 hover:bg-red-50 disabled:opacity-50"
                          title="Delete conversation"
                        >
                          <Trash2 size={14} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Center: Chat */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="border-b border-slate-200 bg-white px-6 py-3 flex items-center justify-between">
          <div className="text-sm font-semibold text-slate-700">SDK Agent Workspace</div>
          {activeRun ? (
            <div className="text-xs text-slate-500">
              Run {activeRun._id.slice(-6)} • {activeRun.status} • {activeRun.stageKey ?? 'intake'}
            </div>
          ) : (
            <div className="text-xs text-slate-400">No active run</div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {activeRun?._id && (
            <SdkDeterministicQuestionsPanel
              questions={sdkQuestionSet?.questions ?? []}
              onSubmit={handleSubmitSdkQuestionSet}
              loading={isDispatching || isRegenRunning}
              regenStatus={activeRun?.regenStatus ?? 'idle'}
              dirtyAnswersCount={Number(activeRun?.dirtyAnswersCount ?? 0)}
              onRegenerate={handleManualRegen}
              notice={manualRegenNotice}
            />
          )}
          {!messages ? (
            <div className="text-xs text-slate-400">Loading history...</div>
          ) : messages.length === 0 ? (
            <div className="text-center py-20">
              <div className="text-sm font-semibold text-slate-700">Ready to help</div>
              <div className="text-xs text-slate-400 mt-1">Start a session to begin.</div>
            </div>
          ) : (
            messages.map((msg) => (
              <div key={msg._id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-2xl ${msg.role === 'user' ? 'bg-blue-600 text-white rounded-lg p-3 text-sm' : 'w-full'}`}>
                  {msg.role === 'user' ? (
                    <div className="whitespace-pre-wrap">{msg.text}</div>
                  ) : (
                    <div className="space-y-4">
                      {(msg.blocks ?? []).map((rawBlock: any, idx: number) => {
                        const block = normalizeBlock(rawBlock);
                        return (
                          <SdkBlockRenderer
                            key={idx}
                            block={block}
                            conversationId={effectiveConvId}
                            projectId={projectId}
                            activeRunId={activeRun?._id ?? null}
                            suppressQuestionBlocks={Boolean(isVnextUiEnabled)}
                            onReviewChangeSet={(id) => setReviewChangeSetId(id)}
                            onAnswerVnext={answerVnext}
                            onContinueVnext={continueVnext}
                            onSubmit={handleSuggestionSubmit}
                          />
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
          {showProgress && (
            <div className="flex justify-start">
              <div className="bg-white rounded-lg p-3 text-sm border border-slate-100 shadow-sm flex items-center gap-3 text-slate-600">
                <div className="w-4 h-4 rounded-full border-2 border-slate-200 border-t-blue-600 animate-spin" />
                <div className="flex flex-col">
                  <div className="flex items-center gap-2">
                    <span>{statusLabel}</span>
                    <span className="text-xs font-mono text-slate-400">{formatElapsed(elapsedMs)}</span>
                  </div>
                  {statusDetail && (
                    <span className="text-xs text-slate-400">{statusDetail}</span>
                  )}
                  {isStale && (
                    <span className="text-xs text-amber-600">No new progress detected yet. Continue stage or add input.</span>
                  )}
                </div>
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>

        {/* Input */}
        <div className="p-4 bg-white border-t border-slate-200">
          <div className="flex gap-2">
            <textarea
              className="flex-1 border border-slate-300 rounded-lg p-3 text-sm focus:ring-2 focus:ring-blue-100 outline-none resize-none"
              rows={1}
              placeholder="Type a message..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
            />
            <button
              onClick={handleSend}
              disabled={runStatus !== 'running' || !input.trim() || !isBackendEnabled}
              className="bg-blue-600 text-white p-3 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Send size={18} />
            </button>
          </div>
        </div>
      </div>

      {/* Right: Run Controls */}
      <div className="w-80 border-l border-slate-200 bg-white p-4 space-y-4">
        <div>
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Run Controls</div>
          {activeRun ? (
            <div className="mt-2 space-y-2 text-sm">
              <div>Status: {activeRun.status}</div>
              <div>Agent: {activeRun.currentAgentName ?? 'orchestrator'}</div>
              <div>Stage: {activeRun.stageKey ?? 'intake'}</div>
              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => pauseRun({ runId: activeRun._id })}
                  disabled={!isBackendEnabled || activeRun.status !== 'running'}
                  className="px-3 py-1 rounded border text-xs disabled:opacity-50"
                >
                  Pause
                </button>
                <button
                  onClick={() => resumeRun({ runId: activeRun._id })}
                  disabled={!isBackendEnabled || activeRun.status !== 'paused'}
                  className="px-3 py-1 rounded border text-xs disabled:opacity-50"
                >
                  Resume
                </button>
                <button
                  onClick={() => cancelRun({ runId: activeRun._id })}
                  disabled={!isBackendEnabled}
                  className="px-3 py-1 rounded border text-xs text-red-600 disabled:opacity-50"
                >
                  Cancel
                </button>
                {isVnextUiEnabled && (activeRun.status === 'blocked' || activeRun.status === 'needs_input') && (
                  <button
                    onClick={() =>
                      continueVnext({
                        projectId,
                        conversationId: effectiveConvId!,
                        runId: activeRun._id,
                      })
                    }
                    disabled={!isBackendEnabled || !effectiveConvId || isRegenRunning}
                    className="px-3 py-1 rounded border text-xs text-blue-700 disabled:opacity-50"
                  >
                    Continue Stage
                  </button>
                )}
              </div>
              <div className="pt-2">
                <button
                  onClick={handleFinalizeNow}
                  disabled={!canFinalizeNow}
                  className="px-3 py-1 rounded border text-xs text-emerald-700 disabled:opacity-50"
                >
                  {finalizeBusy ? 'Finalizing...' : 'Finalize now'}
                </button>
                <div className="mt-1 text-[11px] text-slate-500">
                  Finalize runs immediately and auto-completes missing inputs when needed.
                </div>
                {finalizeNotice && (
                  <div className="mt-1 text-[11px] text-slate-600">
                    {finalizeNotice}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="mt-2 text-xs text-slate-400 space-y-2">
              <div>Start a run to enable controls.</div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleStartRun(false)}
                  disabled={!isBackendEnabled}
                  className="px-3 py-1 rounded border text-xs disabled:opacity-50"
                >
                  Start Run
                </button>
                <button
                  onClick={() => handleStartRun(true)}
                  disabled={!isBackendEnabled}
                  className="px-3 py-1 rounded border text-xs disabled:opacity-50"
                >
                  Start Shadow
                </button>
              </div>
            </div>
          )}
        </div>

        {activeRun?.status === 'awaiting_approval' && activeRun.pendingChangeSetId && (
          <div className="border rounded-lg p-3 bg-amber-50 border-amber-200">
            <div className="text-xs font-semibold text-amber-700 uppercase tracking-wider">
              Approval Required
            </div>
            <div className="text-sm text-amber-900 mt-2">
              ChangeSet {activeRun.pendingChangeSetId.slice(-6)} is awaiting approval.
            </div>
            <button
              onClick={() =>
                approveChangeSet({
                  runId: activeRun._id,
                  approvalToken: activeRun.approvalToken ?? '',
                })
              }
              disabled={!isBackendEnabled || !activeRun.approvalToken}
              className="mt-3 px-3 py-2 rounded bg-amber-600 text-white text-xs hover:bg-amber-700 disabled:opacity-50"
            >
              Approve & Apply
            </button>
          </div>
        )}

        {activeRun?.shadowMode && (
          <div className="border rounded-lg p-3 bg-slate-50 border-slate-200">
            <div className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
              Shadow Eval
            </div>
            <button
              onClick={() =>
                shadowEvaluate({
                  projectId,
                  runId: activeRun._id,
                })
              }
              disabled={!isBackendEnabled}
              className="mt-3 px-3 py-2 rounded bg-slate-700 text-white text-xs hover:bg-slate-800 disabled:opacity-50"
            >
              Run Eval Snapshot
            </button>
          </div>
        )}
      </div>

      {reviewChangeSetId && (
        <ChangeSetReviewDrawer
          open={!!reviewChangeSetId}
          onClose={() => setReviewChangeSetId(null)}
          changeSetId={reviewChangeSetId}
          projectId={projectId}
        />
      )}
    </div>
  );
}

function formatElapsed(ms: number) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
  const seconds = (totalSeconds % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
}

function getSdkStatusLabel(
  run:
    | {
      status: string;
      stageKey?: string;
      currentAgentName?: string;
      pendingChangeSetId?: string;
    }
    | null
    | undefined
) {
  if (!run) return 'Waiting to start';
  if (run.status === 'awaiting_approval') return 'Awaiting approval';
  if (run.status === 'needs_input') return 'Needs input';
  if (run.status === 'blocked') return 'Blocked on input';
  if (run.status === 'paused') return 'Paused';
  if (run.status === 'completed') return 'Completed';
  if (run.status === 'failed') return 'Run failed';
  if (run.status === 'cancelled') return 'Cancelled';
  if (run.stageKey === 'brief') return 'Collecting brief';
  if (run.stageKey === 'scope') return 'Locking scope';
  if (run.stageKey === 'tasks') return 'Building tasks';
  if (run.stageKey === 'budget') return 'Preparing budget';
  if (run.stageKey === 'pricing') return 'Resolving pricing';
  if (run.stageKey === 'ops') return 'Building ops plan';
  if (run.stageKey === 'quote') return 'Drafting quote';
  if (run.stageKey === 'audit') return 'Running audit';
  if (run.stageKey === 'compile') return 'Compiling approval package';
  if (run.stageKey === 'plan.elements') return 'Building elements';
  if (run.stageKey === 'plan.tasks') return 'Breaking down tasks';
  if (run.pendingChangeSetId) return 'Creating change set';
  return 'Running SDK agent';
}

function getSdkStatusDetail(
  run:
    | {
      stageKey?: string;
      currentAgentName?: string;
      pendingChangeSetId?: string;
      lastError?: string;
      progressCount?: number;
      noProgressCount?: number;
      lastProgressAt?: number;
    }
    | null
    | undefined
  ,
  pricingSummary?: {
    total?: number;
    priced?: number;
    estimated?: number;
    pending?: number;
    failed?: number;
  } | null,
  latestEvent?: {
    type?: string;
    payload?: any;
    createdAt?: number;
  } | null
) {
  if (!run) return null;
  if (run.stageKey === 'pricing' && pricingSummary) {
    const resolved = Number(pricingSummary.priced ?? 0) + Number(pricingSummary.estimated ?? 0);
    return `pricing ${resolved}/${Number(pricingSummary.total ?? 0)} • pending ${Number(pricingSummary.pending ?? 0)} • failed ${Number(pricingSummary.failed ?? 0)}`;
  }
  if (run.lastError) return run.lastError;
  if (latestEvent?.type === 'vnext_stage_budget_checkpoint') {
    const stage = String(latestEvent?.payload?.stageKey ?? run.stageKey ?? 'stage');
    return `${stage} checkpointed due to cycle budget; continue to resume`;
  }
  if (latestEvent?.type === 'vnext_no_progress_guard') {
    const stage = String(latestEvent?.payload?.stageKey ?? run.stageKey ?? 'stage');
    return `${stage} is waiting for user input after repeated no-progress cycles`;
  }
  if (latestEvent?.type === 'vnext_stage_transition') {
    const from = String(latestEvent?.payload?.fromStage ?? '');
    const to = String(latestEvent?.payload?.toStage ?? run.stageKey ?? '');
    return `advanced from ${from || 'previous'} to ${to || 'next'} stage`;
  }
  if (typeof run.progressCount === 'number' || typeof run.noProgressCount === 'number') {
    return `progress ${run.progressCount ?? 0} • no-progress ${run.noProgressCount ?? 0}`;
  }
  if (run.pendingChangeSetId) return `ChangeSet ${run.pendingChangeSetId.slice(-6)} pending`;
  if (run.stageKey && run.currentAgentName) return `${run.currentAgentName} • ${run.stageKey}`;
  if (run.stageKey) return run.stageKey;
  if (run.currentAgentName) return run.currentAgentName;
  return null;
}

function normalizeBlock(block: any) {
  if (!block || typeof block !== 'object') return block;
  if (!block.type) {
    if (block.QuestionsBlock && Array.isArray(block.QuestionsBlock)) {
      return {
        type: 'QuestionsBlock',
        questions: block.QuestionsBlock.map((q: any, i: number) => {
          if (typeof q === 'string') return { id: `q${i}`, textHe: q };
          return q;
        }),
      };
    }
    if (block.ChatBlock) return { type: 'ChatBlock', markdownHe: block.ChatBlock };
    if (block.SuggestionBlock) return { type: 'SuggestionBlock', ...block.SuggestionBlock };
    if (block.ChangeSetBlock) return { type: 'ChangeSetBlock', ...block.ChangeSetBlock };
  }
  if (block.type === 'ChatBlock' && block.contentHe && !block.markdownHe) {
    return { ...block, markdownHe: block.contentHe };
  }
  return block;
}

function SdkDeterministicQuestionsPanel({
  questions,
  onSubmit,
  loading,
  regenStatus,
  dirtyAnswersCount,
  onRegenerate,
  notice,
}: {
  questions: Array<{
    id: string;
    questionHe?: string;
    questionText?: string;
    blockingLevel?: string;
    options?: Array<{ value: string; labelHe?: string }>;
    suggestedAnswers?: Array<{ value: string; labelHe?: string }>;
    allowDontKnow?: boolean;
  }>;
  onSubmit: (answersById: Record<string, string>, answerSources?: Record<string, AnswerSource>) => Promise<void>;
  loading: boolean;
  regenStatus: 'idle' | 'running' | 'failed' | string;
  dirtyAnswersCount: number;
  onRegenerate: () => Promise<void>;
  notice: string | null;
}) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [answerSources, setAnswerSources] = useState<Record<string, AnswerSource>>({});
  const [chipSelections, setChipSelections] = useState<Record<string, string>>({});
  const isRunning = loading || regenStatus === 'running';
  const isFailed = regenStatus === 'failed';
  const pillText =
    dirtyAnswersCount > 0 ? `Not refreshed (${dirtyAnswersCount} answers)` : 'Up to date';

  const handleChipSelect = (questionId: string, value: string, source: AnswerSource) => {
    const currentSel = chipSelections[questionId];
    if (currentSel === value) {
      // Deselect
      setChipSelections((prev) => ({ ...prev, [questionId]: '' }));
      setAnswers((prev) => ({ ...prev, [questionId]: '' }));
      setAnswerSources((prev) => { const n = { ...prev }; delete n[questionId]; return n; });
    } else {
      setChipSelections((prev) => ({ ...prev, [questionId]: value }));
      setAnswers((prev) => ({ ...prev, [questionId]: value }));
      setAnswerSources((prev) => ({ ...prev, [questionId]: source }));
    }
  };

  const handleTextChange = (questionId: string, text: string) => {
    setAnswers((prev) => ({ ...prev, [questionId]: text }));
    if (text) {
      setChipSelections((prev) => ({ ...prev, [questionId]: '' }));
      setAnswerSources((prev) => ({ ...prev, [questionId]: 'typed' }));
    }
  };

  const submit = async () => {
    if (isRunning) return;
    await onSubmit(answers, Object.keys(answerSources).length > 0 ? answerSources : undefined);
    setAnswers({});
    setChipSelections({});
    setAnswerSources({});
  };

  return (
    <div className="rounded-xl border border-blue-200 bg-white p-4 shadow-sm relative">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="text-xs font-semibold text-slate-700">Current Questions</div>
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${dirtyAnswersCount > 0 ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>
            {isFailed ? 'Regeneration failed' : pillText}
          </span>
          <button
            onClick={onRegenerate}
            disabled={isRunning}
            className="rounded border border-blue-300 px-2 py-1 text-[11px] font-semibold text-blue-700 disabled:opacity-50"
          >
            {isRunning ? 'Generating...' : 'Generate new set'}
          </button>
          {isFailed && (
            <button
              onClick={onRegenerate}
              disabled={isRunning}
              className="rounded border border-rose-300 px-2 py-1 text-[11px] font-semibold text-rose-700 disabled:opacity-50"
            >
              Retry
            </button>
          )}
        </div>
      </div>
      {notice && (
        <div className="mb-3 rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] text-slate-600">
          {notice}
        </div>
      )}
      <div className="space-y-3">
        {questions.length === 0 && (
          <div className="rounded border border-slate-200 bg-slate-50 px-2 py-2 text-xs text-slate-500">
            No open questions right now.
          </div>
        )}
        {questions.map((q, idx) => {
          const id = q.id ?? `q_${idx + 1}`;
          const chipOptions = (q.options ?? []).map((o) => ({
            value: o.value,
            labelHe: o.labelHe ?? o.value,
          }));
          const chipSuggestions = (q.suggestedAnswers ?? []).map((s) => ({
            value: String(s.value ?? s),
            labelHe: String(s.labelHe ?? s.value ?? s),
          }));
          return (
            <div key={id} className="space-y-1">
              <div className="text-[11px] text-slate-400 uppercase">{q.blockingLevel ?? 'helpful'}</div>
              <div className="text-xs text-slate-700">{q.questionHe ?? q.questionText ?? 'Question'}</div>
              <input
                className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
                value={answers[id] ?? ''}
                disabled={isRunning}
                onChange={(event) => handleTextChange(id, event.target.value)}
              />
              <AnswerChips
                options={chipOptions.length > 0 ? chipOptions : undefined}
                suggestedAnswers={chipSuggestions.length > 0 ? chipSuggestions : undefined}
                allowDontKnow={q.allowDontKnow !== false}
                selected={chipSelections[id]}
                onSelect={(value, source) => handleChipSelect(id, value, source)}
              />
            </div>
          );
        })}
      </div>
      <button
        onClick={submit}
        disabled={isRunning}
        className="mt-3 rounded bg-blue-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
      >
        {isRunning ? 'Working...' : 'Submit answers'}
      </button>
      {isRunning && (
        <div className="absolute inset-0 rounded-xl bg-white/70 backdrop-blur-[1px] flex items-center justify-center">
          <div className="text-xs font-semibold text-slate-700">
            Generating updated plan + questions...
          </div>
        </div>
      )}
    </div>
  );
}

function SdkBlockRenderer({
  block,
  conversationId,
  projectId,
  activeRunId,
  suppressQuestionBlocks,
  onReviewChangeSet,
  onAnswerVnext,
  onContinueVnext,
  onSubmit,
}: {
  block: any;
  conversationId: Id<'agentConversations'> | null;
  projectId: Id<'projects'>;
  activeRunId: Id<'sdkRuns'> | null;
  suppressQuestionBlocks: boolean;
  onReviewChangeSet: (id: Id<'changeSets'>) => void;
  onAnswerVnext: (args: {
    runId: Id<'sdkRuns'>;
    answersById: Record<string, string>;
    freeText?: string;
  }) => Promise<any>;
  onContinueVnext: (args: {
    projectId: Id<'projects'>;
    conversationId: Id<'agentConversations'>;
    runId: Id<'sdkRuns'>;
    note?: string;
  }) => Promise<any>;
  onSubmit: (text: string, payload?: any) => void;
}) {
  if (!block || !conversationId) return null;

  if (block.type === 'ChatBlock') return <ChatBlock block={block} />;
  if (block.type === 'QuestionsBlock') {
    if (suppressQuestionBlocks) return null;
    if (block.sdkVnext) {
      return (
        <SdkVnextQuestionsBlock
          block={block}
          projectId={projectId}
          conversationId={conversationId}
          runId={activeRunId}
          onAnswerVnext={onAnswerVnext}
          onContinueVnext={onContinueVnext}
        />
      );
    }
    return <QuestionsBlock block={block} conversationId={conversationId} projectId={projectId} />;
  }
  if (block.type === 'SuggestionBlock' || block.type === 'SuggestionsBlock') {
    return <SuggestionBlock block={block} onSubmit={onSubmit} />;
  }
  if (block.type === 'ChangeSetBlock') {
    return (
      <ChangeSetBlock
        block={block}
        onReview={() => block.changeSetId && onReviewChangeSet(block.changeSetId)}
      />
    );
  }
  if (block.type === 'ReviewBlock') return <ReviewBlock block={block} />;
  if (block.type === 'ShoppingPlanBlock') return <ShoppingPlanBlock block={block} />;
  if (block.type === 'PrintQaBlock') return <PrintQaBlock block={block} />;
  if (block.type === 'ReceiptBlock') return <ReceiptBlock block={block} />;
  if (block.type === 'RunbookBlock') return <RunbookBlock block={block} projectId={projectId} />;
  if (block.type === 'DailyPlanBlock') return <DailyPlanBlock block={block} />;

  return (
    <div className="text-xs border border-gray-200 bg-gray-50 p-2 rounded overflow-hidden">
      <div className="text-[10px] text-gray-400 font-mono mb-1 uppercase">{block.type}</div>
      <pre className="whitespace-pre-wrap font-mono text-gray-600">
        {JSON.stringify(block, null, 2)}
      </pre>
    </div>
  );
}

function SdkVnextQuestionsBlock({
  block,
  projectId,
  conversationId,
  runId,
  onAnswerVnext,
  onContinueVnext,
}: {
  block: any;
  projectId: Id<'projects'>;
  conversationId: Id<'agentConversations'>;
  runId: Id<'sdkRuns'> | null;
  onAnswerVnext: (args: {
    runId: Id<'sdkRuns'>;
    answersById: Record<string, string>;
    freeText?: string;
    answerSources?: Record<string, string>;
  }) => Promise<any>;
  onContinueVnext: (args: {
    projectId: Id<'projects'>;
    conversationId: Id<'agentConversations'>;
    runId: Id<'sdkRuns'>;
    note?: string;
  }) => Promise<any>;
}) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [answerSources, setAnswerSources] = useState<Record<string, AnswerSource>>({});
  const [chipSelections, setChipSelections] = useState<Record<string, string>>({});
  const [freeText, setFreeText] = useState('');
  const [loading, setLoading] = useState(false);

  const questions = Array.isArray(block.questions) ? block.questions : [];

  const handleChipSelect = (questionId: string, value: string, source: AnswerSource) => {
    const currentSel = chipSelections[questionId];
    if (currentSel === value) {
      // Deselect
      setChipSelections((prev) => ({ ...prev, [questionId]: '' }));
      setAnswers((prev) => ({ ...prev, [questionId]: '' }));
      setAnswerSources((prev) => { const n = { ...prev }; delete n[questionId]; return n; });
    } else {
      setChipSelections((prev) => ({ ...prev, [questionId]: value }));
      setAnswers((prev) => ({ ...prev, [questionId]: value }));
      setAnswerSources((prev) => ({ ...prev, [questionId]: source }));
    }
  };

  const handleTextChange = (questionId: string, text: string) => {
    setAnswers((prev) => ({ ...prev, [questionId]: text }));
    if (text) {
      setChipSelections((prev) => ({ ...prev, [questionId]: '' }));
      setAnswerSources((prev) => ({ ...prev, [questionId]: 'typed' }));
    }
  };

  const submit = async () => {
    if (!runId) return;
    setLoading(true);
    try {
      await onAnswerVnext({
        runId,
        answersById: answers,
        freeText: freeText.trim() ? freeText.trim() : undefined,
        answerSources: Object.keys(answerSources).length > 0 ? answerSources : undefined,
      });
      await onContinueVnext({
        projectId,
        conversationId,
        runId,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-xl border border-blue-200 bg-white p-4 shadow-sm">
      <div className="text-xs font-semibold text-slate-700 mb-3">{block.titleHe ?? 'שאלות להמשך'}</div>
      <div className="space-y-3">
        {questions.map((q: any, idx: number) => {
          const id = q.id ?? `q_${idx + 1}`;
          const chipOptions = (q.options ?? []).map((o: any) => ({
            value: String(o.value ?? o),
            labelHe: String(o.labelHe ?? o.value ?? o),
          }));
          const chipSuggestions = (q.suggestedAnswers ?? []).map((s: any) => ({
            value: String(s.value ?? s),
            labelHe: String(s.labelHe ?? s.value ?? s),
          }));
          return (
            <div key={id}>
              <div className="text-xs text-slate-700 mb-1">{q.textHe ?? 'שאלה'}</div>
              <input
                className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
                type={q.type === 'date' ? 'date' : q.type === 'number' ? 'number' : 'text'}
                value={answers[id] ?? ''}
                onChange={(e) => handleTextChange(id, e.target.value)}
              />
              <AnswerChips
                options={chipOptions.length > 0 ? chipOptions : undefined}
                optionsHe={!chipOptions.length && q.optionsHe ? q.optionsHe : undefined}
                suggestedAnswers={chipSuggestions.length > 0 ? chipSuggestions : undefined}
                allowDontKnow={q.allowDontKnow !== false}
                selected={chipSelections[id]}
                onSelect={(value, source) => handleChipSelect(id, value, source)}
              />
            </div>
          );
        })}
      </div>
      <textarea
        className="mt-3 w-full rounded border border-slate-300 px-2 py-1 text-xs"
        rows={2}
        placeholder="הערות נוספות"
        value={freeText}
        onChange={(e) => setFreeText(e.target.value)}
      />
      <button
        onClick={submit}
        disabled={loading || !runId}
        className="mt-3 rounded bg-blue-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
      >
        {loading ? 'Submitting...' : 'שמור והמשך'}
      </button>
    </div>
  );
}
