"use client";

import { useQuery, useMutation, useAction } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { api } from "../../../../../../convex/_generated/api";
import { Id } from "../../../../../../convex/_generated/dataModel";
import { ChatBlock } from "./Blocks/ChatBlock";
import { QuestionsBlock } from "./Blocks/QuestionsBlock";
import { SuggestionBlock } from "./Blocks/SuggestionBlock";
import { ChangeSetBlock } from "./Blocks/ChangeSetBlock";
import { ReviewBlock } from "./Blocks/ReviewBlock";
import { ShoppingPlanBlock } from "./Blocks/ShoppingPlanBlock";
import { PrintQaBlock } from "./Blocks/PrintQaBlock";
import { ReceiptBlock } from "./Blocks/ReceiptBlock";
import { RunbookBlock } from "./Blocks/RunbookBlock";
import { DailyPlanBlock } from "./Blocks/DailyPlanBlock";
import { Send } from "lucide-react";
import ChangeSetReviewDrawer from "./ChangeSetReviewDrawer";

export function AgentChat({
  activeConversationId,
  projectId,
  isThinking,
  onSetThinking
}: {
  activeConversationId: Id<"agentConversations"> | null;
  projectId: Id<"projects">;
  isThinking: boolean;
  onSetThinking: (thinking: boolean) => void;
}) {
  const messages = useQuery(api.skills.runner.listAgentMessages,
    activeConversationId ? { conversationId: activeConversationId } : "skip"
  );
  const activeRun = useQuery(
    api.skills.runner.getActiveConversationRun,
    activeConversationId ? { conversationId: activeConversationId } : "skip"
  );
  const sendMessageAndRun = useAction(api.skills.runner.sendMessageAndRun);
  const [input, setInput] = useState("");
  const [reviewChangeSetId, setReviewChangeSetId] = useState<Id<"changeSets"> | null>(null);
  const [nowMs, setNowMs] = useState(0);
  const [thinkingStartedAt, setThinkingStartedAt] = useState<number | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const isRunActive = !!activeRun && activeRun.status === "running";

  const statusLabel = activeRun?.phaseLabel ?? (isThinking ? "Working..." : null);
  const statusDetail = activeRun?.phaseDetail ?? (
    activeRun?.skillId ? skillDetailFromSkillId(activeRun.skillId) : null
  );
  const timerStart = activeRun?.startedAt ?? thinkingStartedAt;
  const elapsedMs = timerStart ? Math.max(0, nowMs - timerStart) : 0;
  const isStale = !!activeRun?.updatedAt && nowMs - activeRun.updatedAt > 90_000;

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!isThinking) {
      setThinkingStartedAt(null);
      return;
    }
    setThinkingStartedAt((prev) => prev ?? Date.now());
  }, [isThinking]);

  useEffect(() => {
    if (!isRunActive && !isThinking) return;
    setNowMs(Date.now());
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [isRunActive, isThinking]);

  const handleSend = async () => {
    if (!input.trim() || !activeConversationId) return;
    onSetThinking(true);
    try {
      await sendMessageAndRun({
        projectId,
        conversationId: activeConversationId,
        text: input
      });
      setInput("");
    } finally {
      onSetThinking(false);
    }
  };

  if (!activeConversationId) return <div className="p-8 text-slate-400 text-sm">Initializing session...</div>;

  return (
    <div className="flex flex-col h-full bg-slate-50">
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {!messages ? (
          <div className="text-xs text-slate-400">Loading history...</div>
        ) : messages.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-sm font-semibold text-slate-700">Ready to help</div>
            <div className="text-xs text-slate-400 mt-1">Select a skill from the right to start.</div>
          </div>
        ) : (
          messages.map((msg: any) => (
            <div key={msg._id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-2xl ${msg.role === "user" ? "bg-blue-600 text-white rounded-lg p-3 text-sm" : "w-full"}`}>
                {msg.role === "user" ? (
                  <div className="whitespace-pre-wrap">{msg.text}</div>
                ) : (
                  <div className="space-y-4">
                    {(msg.blocks ?? []).map((rawBlock: any, idx: number) => {
                      const block = normalizeBlock(rawBlock);
                      return (
                        <BlockRenderer
                          key={idx}
                          block={block}
                          conversationId={activeConversationId}
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
        {(isRunActive || isThinking) && (
          <div className="flex justify-start">
            <div className="bg-white rounded-lg p-3 text-sm border border-slate-100 shadow-sm flex items-center gap-3 text-slate-600">
              <div className="w-4 h-4 rounded-full border-2 border-slate-200 border-t-blue-600 animate-spin" />
              <div className="flex flex-col">
                <div className="flex items-center gap-2">
                  <span>{statusLabel ?? "Working..."}</span>
                  <span className="text-xs font-mono text-slate-400">{formatElapsed(elapsedMs)}</span>
                </div>
                {statusDetail && (
                  <span className="text-xs text-slate-400">{statusDetail}</span>
                )}
                {isStale && (
                  <span className="text-xs text-amber-600">This step is taking longer than usual</span>
                )}
              </div>
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Input Area */}
      <div className="p-4 bg-white border-t border-slate-200">
        <div className="flex gap-2">
          <textarea
            className="flex-1 border border-slate-300 rounded-lg p-3 text-sm focus:ring-2 focus:ring-blue-100 outline-none resize-none"
            rows={1}
            placeholder="Type a message..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
          />
          <button
            onClick={handleSend}
            disabled={isRunActive || isThinking || !input.trim()}
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
    </div>
  );
}

function formatElapsed(ms: number) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function skillDetailFromSkillId(skillId: string) {
  const map: Record<string, string> = {
    ELEMENTS_BUILDER_FULL: "Building elements",
    TASKS_BUILDER_FULL: "Breaking down tasks",
    CONTEXT_GENERATION: "Building context and questions",
    CONSULTANT_CHAT: "Drafting response",
    RESEARCH_PRICING_ESTIMATES_WEB: "Collecting web pricing data",
  };
  return map[skillId] ?? null;
}

function normalizeBlock(block: any) {
  if (!block || typeof block !== "object") return block;

  // Handle { "QuestionsBlock": [...] } pattern
  if (!block.type) {
    if (block.QuestionsBlock && Array.isArray(block.QuestionsBlock)) {
      return {
        type: "QuestionsBlock",
        questions: block.QuestionsBlock.map((q: any, i: number) => {
          if (typeof q === "string") return { id: `q${i}`, textHe: q };
          return q;
        })
      };
    }
    if (block.ChatBlock) return { type: "ChatBlock", markdownHe: block.ChatBlock };
    if (block.SuggestionBlock) return { type: "SuggestionBlock", ...block.SuggestionBlock };
    if (block.ChangeSetBlock) return { type: "ChangeSetBlock", ...block.ChangeSetBlock };
  }
  return block;
}

function BlockRenderer({
  block,
  conversationId,
  projectId,
  onReviewChangeSet
}: {
  block: any,
  conversationId: Id<"agentConversations">,
  projectId: Id<"projects">,
  onReviewChangeSet: (id: Id<"changeSets">) => void
}) {
  const applyChangeSet = useMutation(api.changeSets.applyChangeSet);
  const discardChangeSet = useMutation(api.changeSets.discardChangeSet);
  const sendMessageAndRun = useAction(api.skills.runner.sendMessageAndRun);

  if (block.type === "ChatBlock") return <ChatBlock block={block} />;
  if (block.type === "QuestionsBlock") return <QuestionsBlock block={block} conversationId={conversationId} projectId={projectId} />;
  if (block.type === "SuggestionBlock" || block.type === "SuggestionsBlock") {
    return (
      <SuggestionBlock
        block={block}
        onSubmit={(text, payload) => {
          // Extract skill ID from payload if present
          const skillId = payload?.targetSkillId ?? payload?.skillId ?? payload?.action;
          sendMessageAndRun({
            projectId,
            conversationId,
            text,
            skillId: typeof skillId === "string" ? skillId : undefined,
            params: payload?.params
          });
        }}
      />
    );
  }
  if (block.type === "ChangeSetBlock") {
    return (
      <ChangeSetBlock
        block={block}
        onApply={() => block.changeSetId && applyChangeSet({ changeSetId: block.changeSetId })}
        onDiscard={() => block.changeSetId && discardChangeSet({ changeSetId: block.changeSetId })}
        onReview={() => block.changeSetId && onReviewChangeSet(block.changeSetId)}
      />
    );
  }
  if (block.type === "ReviewBlock") return <ReviewBlock block={block} />;
  if (block.type === "ShoppingPlanBlock") return <ShoppingPlanBlock block={block} />;
  if (block.type === "PrintQaBlock") return <PrintQaBlock block={block} />;
  if (block.type === "ReceiptBlock") return <ReceiptBlock block={block} />;
  if (block.type === "RunbookBlock") return <RunbookBlock block={block} projectId={projectId} />;
  if (block.type === "DailyPlanBlock") return <DailyPlanBlock block={block} />;

  // Fallback for unknown blocks (e.g. ShoppingPlanBlock, ReviewBlock)
  return (
    <div className="text-xs border border-gray-200 bg-gray-50 p-2 rounded overflow-hidden">
      <div className="text-[10px] text-gray-400 font-mono mb-1 uppercase">{block.type}</div>
      <pre className="whitespace-pre-wrap font-mono text-gray-600">
        {JSON.stringify(block, null, 2)}
      </pre>
    </div>
  );
}
