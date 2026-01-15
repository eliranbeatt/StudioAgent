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
  projectId
}: {
  activeConversationId: Id<"agentConversations"> | null;
  projectId: Id<"projects">;
}) {
  const messages = useQuery(api.skills.runner.listAgentMessages,
    activeConversationId ? { conversationId: activeConversationId } : "skip"
  );
  const sendMessageAndRun = useAction(api.skills.runner.sendMessageAndRun);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [reviewChangeSetId, setReviewChangeSetId] = useState<Id<"changeSets"> | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || !activeConversationId) return;
    setIsSending(true);
    try {
      await sendMessageAndRun({
        projectId,
        conversationId: activeConversationId,
        text: input
      });
      setInput("");
    } finally {
      setIsSending(false);
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
            disabled={isSending || !input.trim()}
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
            skillId: typeof skillId === "string" ? skillId : undefined
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
  if (block.type === "RunbookBlock") return <RunbookBlock block={block} />;
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
