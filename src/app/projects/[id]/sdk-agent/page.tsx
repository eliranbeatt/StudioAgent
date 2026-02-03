'use client';

import { useAction, useMutation, useQuery } from 'convex/react';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
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
import { Send } from 'lucide-react';

export default function SdkAgentPage() {
  const params = useParams();
  const rawId = params.id as string;
  const resolved = useQuery(api.projects.resolveProjectId, { id: rawId });
  const projectId = resolved?.projectId ?? null;

  const featureFlags = useQuery(api.featureFlags.getAll);
  const isEnabled = featureFlags?.ff_sdk_agent_tab;
  const isBackendEnabled = featureFlags?.ff_sdk_agent_backend;

  const conversations = useQuery(
    api.sdk.api.listConversations,
    projectId ? { projectId } : 'skip'
  );
  const [selectedConvId, setSelectedConvId] = useState<Id<'agentConversations'> | null>(null);
  const [reviewChangeSetId, setReviewChangeSetId] = useState<Id<'changeSets'> | null>(null);

  useEffect(() => {
    if (!selectedConvId && conversations && conversations.length > 0) {
      setSelectedConvId(conversations[0]._id);
    }
  }, [conversations, selectedConvId]);

  const runs = useQuery(
    api.sdk.api.listRuns,
    selectedConvId ? { conversationId: selectedConvId } : 'skip'
  );
  const activeRun = runs && runs.length > 0 ? runs[0] : null;

  const messages = useQuery(
    api.sdk.api.listMessages,
    selectedConvId ? { conversationId: selectedConvId, limit: 100 } : 'skip'
  );

  const createConversation = useMutation(api.sdk.api.createConversation);
  const startRun = useMutation(api.sdk.api.startRun);
  const pauseRun = useMutation(api.sdk.api.pauseRun);
  const resumeRun = useMutation(api.sdk.api.resumeRun);
  const cancelRun = useMutation(api.sdk.api.cancelRun);
  const approveChangeSet = useAction(api.sdk.api.approveChangeSet);
  const shadowEvaluate = useAction(api.sdk.api.shadowEvaluate);
  const runNext = useAction(api.sdk.dispatch.runNext);

  const [input, setInput] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isRunning]);

  const handleCreate = async () => {
    if (!projectId) return;
    const id = await createConversation({ projectId, title: 'New SDK Session' });
    setSelectedConvId(id);
    await startRun({ projectId, conversationId: id });
  };

  const handleStartRun = async (shadowMode = false) => {
    if (!projectId || !selectedConvId) return;
    await startRun({ projectId, conversationId: selectedConvId, shadowMode });
  };

  const handleSend = async () => {
    if (!projectId || !selectedConvId || !activeRun || !input.trim()) return;
    setIsRunning(true);
    try {
      await runNext({
        projectId,
        conversationId: selectedConvId,
        runId: activeRun._id,
        userMessage: input.trim(),
      });
      setInput('');
    } finally {
      setIsRunning(false);
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
                className={`group flex items-center w-full rounded-md text-xs transition-colors ${
                  selectedConvId === c._id
                    ? 'bg-blue-50 text-blue-700 font-medium'
                    : 'text-slate-600 hover:bg-slate-50'
                }`}
                onClick={() => setSelectedConvId(c._id)}
              >
                <div className="flex-1 flex justify-between items-center p-2 cursor-pointer">
                  <div className="flex flex-col truncate">
                    <span className="truncate">{c.title || 'Untitled'}</span>
                    <span className="text-[10px] text-slate-400 font-normal">
                      {new Date(c.updatedAt).toLocaleDateString()}
                    </span>
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
                            conversationId={selectedConvId}
                            projectId={projectId}
                            onReviewChangeSet={(id) => setReviewChangeSetId(id)}
                          />
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
          {isRunning && (
            <div className="flex justify-start">
              <div className="bg-white rounded-lg p-3 text-sm border border-slate-100 shadow-sm flex items-center gap-2 text-slate-500">
                <div className="w-4 h-4 rounded-full border-2 border-slate-200 border-t-blue-600 animate-spin" />
                <span>Thinking...</span>
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
              disabled={isRunning || !input.trim() || !isBackendEnabled}
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

function SdkBlockRenderer({
  block,
  conversationId,
  projectId,
  onReviewChangeSet,
}: {
  block: any;
  conversationId: Id<'agentConversations'> | null;
  projectId: Id<'projects'>;
  onReviewChangeSet: (id: Id<'changeSets'>) => void;
}) {
  if (!block || !conversationId) return null;

  if (block.type === 'ChatBlock') return <ChatBlock block={block} />;
  if (block.type === 'QuestionsBlock') {
    return <QuestionsBlock block={block} conversationId={conversationId} projectId={projectId} />;
  }
  if (block.type === 'SuggestionBlock' || block.type === 'SuggestionsBlock') {
    return <SuggestionBlock block={block} onSubmit={() => null} />;
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
