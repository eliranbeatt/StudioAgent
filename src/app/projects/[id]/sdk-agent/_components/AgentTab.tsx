'use client';

import { useAction, useMutation, useQuery } from 'convex/react';
import { useState, useEffect, useRef } from 'react';
import { api } from '../../../../../../convex/_generated/api';
import { Id } from '../../../../../../convex/_generated/dataModel';
import { ChatBlock } from '../../agent/_components/Blocks/ChatBlock';
import { QuestionsBlock } from '../../agent/_components/Blocks/QuestionsBlock';
import { SuggestionBlock } from '../../agent/_components/Blocks/SuggestionBlock';
import { ChangeSetBlock } from '../../agent/_components/Blocks/ChangeSetBlock';
import { ReviewBlock } from '../../agent/_components/Blocks/ReviewBlock';
import { Send } from 'lucide-react';
import ChangeSetReviewDrawer from '../../agent/_components/ChangeSetReviewDrawer';

export function AgentTab({ projectId }: { projectId: Id<'projects'> }) {
  const [conversationId, setConversationId] = useState<Id<'agentConversations'> | null>(null);
  const [input, setInput] = useState('');
  const [reviewChangeSetId, setReviewChangeSetId] = useState<Id<'changeSets'> | null>(null);
  const [isDispatching, setIsDispatching] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const conversations = useQuery(
    api.sdk.api.listConversations,
    projectId ? { projectId } : 'skip'
  );
  
  const effectiveConvId = conversationId ?? conversations?.[0]?._id ?? null;

  const runs = useQuery(
    api.sdk.api.listRuns,
    effectiveConvId ? { conversationId: effectiveConvId } : 'skip'
  );
  const activeRun = runs && runs.length > 0 ? runs[0] : null;

  const messages = useQuery(
    api.sdk.api.listMessages,
    effectiveConvId ? { conversationId: effectiveConvId, limit: 100 } : 'skip'
  );

  const createConversation = useMutation(api.sdk.api.createConversation);
  const startRun = useMutation(api.sdk.api.startRun);
  const runNext = useAction(api.sdk.dispatch.runNext);
  const approveChangeSet = useAction(api.sdk.api.approveChangeSet);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    // Auto-create conversation if none exists
    if (!conversations || conversations.length === 0) {
      handleCreateConversation();
    }
  }, [conversations]);

  const handleCreateConversation = async () => {
    if (!projectId) return;
    const id = await createConversation({ projectId, title: 'Agent Session' });
    setConversationId(id);
    await startRun({ projectId, conversationId: id });
  };

  const handleSend = async () => {
    if (!projectId || !effectiveConvId || !activeRun || !input.trim()) return;
    setIsDispatching(true);
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
    setIsDispatching(true);
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

  const runStatus = activeRun?.status;
  const isRunActive = runStatus === 'running' || runStatus === 'awaiting_approval';

  return (
    <div className="flex flex-col h-full bg-slate-50">
      <div className="border-b border-slate-200 bg-white px-6 py-3 flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold text-slate-700">Agent Orchestrator</div>
          <div className="text-xs text-slate-500">
            Conversational agent for flexible project management
          </div>
        </div>
        {activeRun && (
          <div className="text-xs text-slate-500">
            Run {activeRun._id.slice(-6)} • {activeRun.status}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {!messages ? (
          <div className="text-xs text-slate-400">Loading history...</div>
        ) : messages.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-sm font-semibold text-slate-700">Agent Ready</div>
            <div className="text-xs text-slate-400 mt-1">
              Ask me anything about your project - I'll figure out which skills to use.
            </div>
          </div>
        ) : (
          messages.map((msg) => (
            <div key={msg._id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-3xl ${msg.role === 'user' ? 'bg-blue-600 text-white rounded-lg p-3 text-sm' : 'w-full'}`}>
                {msg.role === 'user' ? (
                  <div className="whitespace-pre-wrap">{msg.text}</div>
                ) : (
                  <div className="space-y-4">
                    {(msg.blocks ?? []).map((rawBlock: any, idx: number) => {
                      const block = normalizeBlock(rawBlock);
                      return (
                        <BlockRenderer
                          key={idx}
                          block={block}
                          conversationId={effectiveConvId}
                          projectId={projectId}
                          onReviewChangeSet={(id) => setReviewChangeSetId(id)}
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
        {isDispatching && (
          <div className="flex justify-start">
            <div className="bg-white rounded-lg p-3 text-sm border border-slate-100 shadow-sm flex items-center gap-3 text-slate-600">
              <div className="w-4 h-4 rounded-full border-2 border-slate-200 border-t-blue-600 animate-spin" />
              <span>Agent is working...</span>
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="p-4 bg-white border-t border-slate-200">
        <div className="flex gap-2">
          <textarea
            className="flex-1 border border-slate-300 rounded-lg p-3 text-sm focus:ring-2 focus:ring-blue-100 outline-none resize-none"
            rows={1}
            placeholder="Ask me to plan elements, fix issues, answer questions, suggest solutions..."
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
            disabled={!isRunActive || !input.trim()}
            className="bg-blue-600 text-white p-3 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send size={18} />
          </button>
        </div>
      </div>

      {reviewChangeSetId && (
        <ChangeSetReviewDrawer
          open={!!reviewChangeSetId}
          onClose={() => setReviewChangeSetId(null)}
          changeSetId={reviewChangeSetId}
          projectId={projectId}
        />
      )}

      {activeRun?.status === 'awaiting_approval' && activeRun.pendingChangeSetId && (
        <div className="absolute bottom-20 right-4 border rounded-lg p-4 bg-amber-50 border-amber-200 shadow-lg max-w-sm">
          <div className="text-xs font-semibold text-amber-700 uppercase tracking-wider mb-2">
            Approval Required
          </div>
          <div className="text-sm text-amber-900 mb-3">
            ChangeSet {activeRun.pendingChangeSetId.slice(-6)} is awaiting approval.
          </div>
          <button
            onClick={() =>
              approveChangeSet({
                runId: activeRun._id,
                approvalToken: activeRun.approvalToken ?? '',
              })
            }
            disabled={!activeRun.approvalToken}
            className="w-full px-3 py-2 rounded bg-amber-600 text-white text-xs hover:bg-amber-700 disabled:opacity-50"
          >
            Approve & Apply
          </button>
        </div>
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

function BlockRenderer({
  block,
  conversationId,
  projectId,
  onReviewChangeSet,
  onSubmit,
}: {
  block: any;
  conversationId: Id<'agentConversations'> | null;
  projectId: Id<'projects'>;
  onReviewChangeSet: (id: Id<'changeSets'>) => void;
  onSubmit: (text: string, payload?: any) => void;
}) {
  if (!block || !conversationId) return null;

  if (block.type === 'ChatBlock') return <ChatBlock block={block} />;
  if (block.type === 'QuestionsBlock') {
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

  return (
    <div className="text-xs border border-gray-200 bg-gray-50 p-2 rounded overflow-hidden">
      <div className="text-[10px] text-gray-400 font-mono mb-1 uppercase">{block.type}</div>
      <pre className="whitespace-pre-wrap font-mono text-gray-600">
        {JSON.stringify(block, null, 2)}
      </pre>
    </div>
  );
}
