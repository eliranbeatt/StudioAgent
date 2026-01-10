"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";
import { use, useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Send } from "lucide-react";
import { ACTIVE_AGENT_PROMPT_ID } from "../../../../lib/agentPrompts";

type Stage = "IDEATION" | "QUOTE" | "BREAKDOWN";
type Mode = "CHAT" | "QUESTIONS" | "SUGGESTIONS";

type ConversationMessage = {
  _id: Id<"conversationMessages">;
  role: "user" | "assistant" | "event";
  text_he?: string;
  block?: any;
  eventType?: string;
  eventPayload?: any;
  changeSetId?: Id<"changeSets">;
  createdAt: number;
};

export default function StudioAgentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const projectId = id as Id<"projects">;

  const [activeConversationId, setActiveConversationId] = useState<Id<"conversations"> | null>(null);
  const [input, setInput] = useState("");
  const [selectedElementIds, setSelectedElementIds] = useState<Id<"elements">[]>([]);
  const [isWaiting, setIsWaiting] = useState(false);
  const [model, setModel] = useState<string>("gpt-4o");
  const user = useQuery(api.users.getViewer);

  useEffect(() => {
    if (user?.preferredModel) {
      setModel(user.preferredModel);
    }
  }, [user]);

  const conversations = useQuery(api.agent.listConversations, { projectId });
  const messages = useQuery(
    api.agent.listConversationMessages,
    activeConversationId ? { conversationId: activeConversationId, limit: 60 } : "skip"
  ) as ConversationMessage[] | undefined;
  const overview = useQuery(api.projects.getOverview, { id: projectId });

  const createConversation = useMutation(api.agent.createConversation);
  const setConversationStage = useMutation(api.agent.setConversationStageV1);
  const setConversationMode = useMutation(api.agent.setConversationMode);
  const appendUserMessage = useMutation(api.agent.appendUserMessage);
  const appendEventMessage = useMutation(api.agent.appendEventMessage);
  const applyChangeSet = useMutation(api.changeSets.applyChangeSet);
  const discardChangeSet = useMutation(api.changeSets.discardChangeSet);
  const agentRespond = useAction(api.agent.agentRespond);

  const activeConversation = useMemo(() => {
    if (!conversations || !activeConversationId) return null;
    return conversations.find((item) => item._id === activeConversationId) ?? null;
  }, [conversations, activeConversationId]);

  useEffect(() => {
    if (!conversations) return;
    if (activeConversationId) return;
    if (conversations.length > 0) {
      setActiveConversationId(conversations[0]._id);
      return;
    }
    createConversation({ projectId }).then((convId) => setActiveConversationId(convId));
  }, [conversations, activeConversationId, createConversation, projectId]);

  useEffect(() => {
    if (!overview?.elements?.length) return;
    if (selectedElementIds.length > 0) return;
    setSelectedElementIds([overview.elements[0].id as Id<"elements">]);
  }, [overview?.elements, selectedElementIds.length]);

  const handleSend = async () => {
    if (!activeConversationId || isWaiting) return;
    const text = input.trim();
    if (!text) return;
    setInput("");
    setIsWaiting(true);
    try {
      await appendUserMessage({ conversationId: activeConversationId, text_he: text });
      await agentRespond({
        conversationId: activeConversationId,
        uiContext: { selectedElementIds },
        model,
      });
    } finally {
      setIsWaiting(false);
    }
  };

  const handleEventSubmit = async (eventType: string, eventPayload: any) => {
    if (!activeConversationId || isWaiting) return;
    setIsWaiting(true);
    try {
      await appendEventMessage({
        conversationId: activeConversationId,
        eventType,
        eventPayload,
      });
      await agentRespond({
        conversationId: activeConversationId,
        uiContext: { selectedElementIds },
        model,
      });
    } finally {
      setIsWaiting(false);
    }
  };

  const handleImmediateChangeSetAction = async (action: "apply" | "discard", changeSetId?: Id<"changeSets">) => {
    if (!changeSetId || !activeConversationId) return;

    try {
      if (action === "apply") {
        await applyChangeSet({ changeSetId });
        await appendEventMessage({
          conversationId: activeConversationId,
          eventType: "changeset_applied",
          eventPayload: { changeSetId },
        });
      } else {
        await discardChangeSet({ changeSetId });
        await appendEventMessage({
          conversationId: activeConversationId,
          eventType: "changeset_discarded",
          eventPayload: { changeSetId },
        });
      }
    } catch (e) {
      console.error("Failed to apply/discard changeset", e);
    }
  };

  const handleSuggestionSubmit = async (payload: any) => {
    if (!activeConversationId || isWaiting) return;
    setIsWaiting(true);
    try {
      await appendEventMessage({
        conversationId: activeConversationId,
        eventType: "suggestions_selected",
        eventPayload: payload,
      });
      await agentRespond({
        conversationId: activeConversationId,
        uiContext: { selectedElementIds },
        model,
      });
    } finally {
      setIsWaiting(false);
    }
  };

  const stageValue = (activeConversation?.stage ?? "IDEATION") as Stage;
  const modeValue = (activeConversation?.mode ?? "CHAT") as Mode;

  return (
    <div className="flex h-full bg-white">
      <aside className="w-64 border-r border-gray-200 bg-gray-50">
        <div className="px-4 py-4 border-b border-gray-200 flex items-center justify-between">
          <div className="text-xs font-semibold uppercase tracking-widest text-gray-500">Conversations</div>
        </div>
        <div className="p-3 space-y-2">
          {!conversations ? (
            <div className="text-xs text-gray-400">Loading...</div>
          ) : conversations.length === 0 ? (
            <div className="text-xs text-gray-400">No conversations yet.</div>
          ) : (
            conversations.map((conversation) => (
              <button
                key={conversation._id}
                onClick={() => setActiveConversationId(conversation._id)}
                className={`w-full rounded-lg border px-3 py-2 text-left text-xs transition ${conversation._id === activeConversationId
                  ? "border-gray-900 bg-white shadow"
                  : "border-gray-200 bg-white/70 hover:border-gray-300"
                  }`}
              >
                <div className="font-semibold text-gray-800">
                  {conversation.title_he ?? "שיחה חדשה"}
                </div>
                <div className="mt-1 text-[10px] uppercase tracking-wider text-gray-400">
                  {String(conversation.stage).toUpperCase()} · {String(conversation.mode ?? "CHAT").toUpperCase()}
                </div>
              </button>
            ))
          )}
        </div>
      </aside>

      <main className="flex-1 flex flex-col">
        <header className="h-16 border-b border-gray-200 flex items-center justify-between px-6 bg-white">
          <div className="flex items-center gap-4">
            <div className="text-lg font-semibold text-gray-900">Flowing Assistant</div>
            <span className="text-[10px] uppercase tracking-widest bg-gray-100 border border-gray-200 text-gray-500 px-2 py-1 rounded-full">
              {ACTIVE_AGENT_PROMPT_ID}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-1 text-xs text-gray-700 bg-white"
            >
              <option value="gpt-4o">GPT-4o</option>
              <option value="gpt-5-nano">GPT-5 Nano</option>
              <option value="gpt-5-mini">GPT-5 Mini</option>
              <option value="gpt-5.2">GPT-5.2</option>
              <option value="gpt-5.2-thinking">GPT-5.2 (Thinking)</option>
            </select>
            <select
              value={stageValue}
              onChange={(e) => {
                const stage = e.target.value as Stage;
                if (activeConversationId) {
                  setConversationStage({ id: activeConversationId, stage });
                }
              }}
              className="border border-gray-200 rounded-lg px-3 py-1 text-xs text-gray-700 bg-white"
            >
              <option value="IDEATION">Ideation</option>
              <option value="QUOTE">Quote</option>
              <option value="BREAKDOWN">Breakdown</option>
            </select>
            <select
              value={modeValue}
              onChange={(e) => {
                const mode = e.target.value as Mode;
                if (activeConversationId) {
                  setConversationMode({ id: activeConversationId, mode });
                }
              }}
              className="border border-gray-200 rounded-lg px-3 py-1 text-xs text-gray-700 bg-white"
            >
              <option value="CHAT">Chat</option>
              <option value="QUESTIONS">Questions</option>
              <option value="SUGGESTIONS">Suggestions</option>
            </select>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto bg-gray-50">
          <div className="max-w-3xl mx-auto px-6 py-6 space-y-6">
            {!messages ? (
              <div className="flex items-center justify-center text-gray-400">
                <Loader2 size={20} className="animate-spin" />
              </div>
            ) : messages.length === 0 ? (
              <div className="text-sm text-gray-400">Start the conversation by sending a message.</div>
            ) : (
              messages.map((msg) => (
                <MessageBubble
                  key={msg._id}
                  message={msg}
                  onClarificationSubmit={handleEventSubmit}
                  onSuggestionsSubmit={handleSuggestionSubmit}
                  onApplyChangeSet={(changeSetId) => handleImmediateChangeSetAction("apply", changeSetId)}
                  onDiscardChangeSet={(changeSetId) => handleImmediateChangeSetAction("discard", changeSetId)}
                  disabled={isWaiting}
                />
              ))
            )}
          </div>
        </div>

        <div className="border-t border-gray-200 bg-white px-6 py-4">
          <div className="max-w-3xl mx-auto flex items-center gap-3">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              rows={2}
              placeholder="כתוב כאן..."
              className="flex-1 resize-none rounded-xl border border-gray-200 px-4 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-200"
            />
            <button
              onClick={handleSend}
              disabled={isWaiting || !input.trim()}
              className="inline-flex items-center gap-2 rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              <Send size={16} />
              שלח
            </button>
          </div>
        </div>
      </main>

      <aside className="w-72 border-l border-gray-200 bg-gray-50">
        <div className="px-4 py-4 border-b border-gray-200">
          <div className="text-xs font-semibold uppercase tracking-widest text-gray-500">Elements</div>
        </div>
        <div className="p-3 space-y-2">
          {!overview?.elements ? (
            <div className="text-xs text-gray-400">Loading...</div>
          ) : overview.elements.length === 0 ? (
            <div className="text-xs text-gray-400">No elements yet.</div>
          ) : (
            overview.elements.map((element) => {
              const selected = selectedElementIds.includes(element.id as Id<"elements">);
              return (
                <label
                  key={element.id}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs ${selected ? "border-gray-900 bg-white" : "border-gray-200 bg-white/70"
                    }`}
                >
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={() => {
                      setSelectedElementIds((prev) =>
                        selected
                          ? prev.filter((item) => item !== element.id)
                          : [...prev, element.id as Id<"elements">]
                      );
                    }}
                  />
                  <div className="flex-1">
                    <div className="font-semibold text-gray-800">{element.title}</div>
                    <div className="text-[10px] uppercase tracking-wider text-gray-400">{element.status}</div>
                  </div>
                </label>
              );
            })
          )}
        </div>
      </aside>
    </div>
  );
}

function MessageBubble({
  message,
  onClarificationSubmit,
  onSuggestionsSubmit,
  onApplyChangeSet,
  onDiscardChangeSet,
  disabled,
}: {
  message: ConversationMessage;
  onClarificationSubmit: (eventType: string, payload: any) => void;
  onSuggestionsSubmit: (payload: any) => void;
  onApplyChangeSet: (changeSetId?: Id<"changeSets">) => void;
  onDiscardChangeSet: (changeSetId?: Id<"changeSets">) => void;
  disabled: boolean;
}) {
  const isUser = message.role === "user";
  const align = isUser ? "items-end" : "items-start";
  const bubble = isUser ? "bg-black text-white" : "bg-white border border-gray-200 text-gray-800";

  const normalized =
    message.role === "assistant"
      ? normalizeStructuredMessage(message.text_he)
      : { text: message.text_he, blocks: undefined as any };
  const displayText = normalized.text ?? message.text_he;
  const displayBlocks = message.block ?? (message.role === "assistant" ? normalized.blocks : undefined);

  // Handle "Thinking..." state
  const isThinking = message.role === "assistant" && !displayText && !displayBlocks;

  return (
    <div className={`flex flex-col ${align} gap-3`}>
      {isThinking ? (
        <div className="flex items-center gap-2 text-xs text-gray-400 animate-pulse px-2">
          <Loader2 size={12} className="animate-spin" />
          <span>Thinking...</span>
        </div>
      ) : null}

      {displayText ? (
        <div
          className={`max-w-xl rounded-2xl px-4 py-3 text-sm shadow-sm ${bubble} whitespace-pre-wrap`}
          dir="auto"
          style={{ textAlign: "start" }}
        >
          <RichTextRenderer text={displayText} />
        </div>
      ) : null}

      {displayBlocks ? (
        (Array.isArray(displayBlocks) ? displayBlocks : [displayBlocks]).map((block, index) => (
          <BlockRenderer
            key={block?.type ?? index}
            block={block}
            changeSetId={message.changeSetId}
            onClarificationSubmit={onClarificationSubmit}
            onSuggestionsSubmit={onSuggestionsSubmit}
            onApplyChangeSet={onApplyChangeSet}
            onDiscardChangeSet={onDiscardChangeSet}
            disabled={disabled}
          />
        ))
      ) : null}
    </div>
  );
}

function tryParseJson(text: string) {
  try {
    // First try: strictly inside ```json block
    const jsonBlockMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonBlockMatch && jsonBlockMatch[1]) {
      const parsed = JSON.parse(jsonBlockMatch[1]);
      if (parsed && typeof parsed === "object") return parsed;
    }

    // Second try: strictly inside ``` block
    const codeBlockMatch = text.match(/```\s*([\s\S]*?)\s*```/);
    if (codeBlockMatch && codeBlockMatch[1]) {
      const parsed = JSON.parse(codeBlockMatch[1]);
      if (parsed && typeof parsed === "object") return parsed;
    }

    // Third try: just try parsing the whole thing (cleaning potential start/end markers if the regex missed)
    const cleaned = text.replace(/^```json\s*/, "").replace(/^```\s*/, "").replace(/\s*```$/, "");
    const parsed = JSON.parse(cleaned);
    if (parsed && typeof parsed === "object") {
      return parsed;
    }
  } catch {
    return null;
  }
  return null;
}

function isStructuredBlock(payload: any) {
  return (
    payload?.type === "ClarificationBlock" ||
    payload?.type === "QuestionsBlock" ||
    payload?.type === "SuggestionBlock" ||
    payload?.type === "ChangeSetBlock" ||
    payload?.type === "PlanBlock"
  );
}

function extractJsonBlock(text: string) {
  const match = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (!match) return null;
  return {
    json: match[1],
    textPart: text.slice(0, match.index ?? 0).trim(),
  };
}

function normalizeStructuredMessage(text?: string) {
  if (!text) return { text, blocks: undefined as any };
  const fenced = extractJsonBlock(text);
  const parsed = fenced ? tryParseJson(fenced.json) : tryParseJson(text);
  if (!parsed) return { text, blocks: undefined as any };

  const blocks = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed.blocks)
      ? parsed.blocks
      : isStructuredBlock(parsed)
        ? [parsed]
        : isStructuredBlock(parsed.block)
          ? [parsed.block]
          : undefined;

  const parsedText = isStructuredBlock(parsed)
    ? fenced?.textPart
    : parsed.assistantText_he ?? parsed.text_he ?? parsed.text;

  return {
    text: parsedText ?? fenced?.textPart ?? text,
    blocks,
  };
}

function RichTextRenderer({ text }: { text: string }) {
  // Handle basic markdown: bold (**text**) and bullet points/numbered lists by mostly respecting newlines
  const lines = text.split("\n");
  return (
    <div className="space-y-1">
      {lines.map((line, i) => (
        <div key={i} className="min-h-[1.2em]">
          {renderLine(line)}
        </div>
      ))}
    </div>
  );
}

function renderLine(text: string) {
  const parts = text.split(/(\*\*.*?\*\*)/g);
  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }
    return <span key={index}>{part}</span>;
  });
}

function BlockRenderer({
  block,
  changeSetId,
  onClarificationSubmit,
  onSuggestionsSubmit,
  onApplyChangeSet,
  onDiscardChangeSet,
  disabled,
}: {
  block: any;
  changeSetId?: Id<"changeSets">;
  onClarificationSubmit: (eventType: string, payload: any) => void;
  onSuggestionsSubmit: (payload: any) => void;
  onApplyChangeSet: (changeSetId?: Id<"changeSets">) => void;
  onDiscardChangeSet: (changeSetId?: Id<"changeSets">) => void;
  disabled: boolean;
}) {
  if (!block?.type) return null;
  if (block.type === "ClarificationBlock") {
    return (
      <ClarificationBlock
        block={block}
        onSubmit={(payload) => onClarificationSubmit("clarification_submitted", payload)}
        disabled={disabled}
      />
    );
  }
  if (block.type === "QuestionsBlock") {
    const normalizedBlock = normalizeQuestionsBlock(block);
    return (
      <ClarificationBlock
        block={normalizedBlock}
        onSubmit={(payload) => onClarificationSubmit("clarification_submitted", payload)}
        disabled={disabled}
      />
    );
  }
  if (block.type === "SuggestionBlock") {
    return (
      <SuggestionBlock
        block={block}
        onSubmit={onSuggestionsSubmit}
        disabled={disabled}
      />
    );
  }
  if (block.type === "ChangeSetBlock") {
    return (
      <ChangeSetBlock
        block={block}
        changeSetId={changeSetId}
        onApply={onApplyChangeSet}
        onDiscard={onDiscardChangeSet}
        disabled={disabled}
      />
    );
  }
  if (block.type === "PlanBlock") {
    return <PlanBlock block={block} />;
  }
  return null;
}

function normalizeQuestionsBlock(block: any) {
  if (!block || block.type !== "QuestionsBlock") return block;
  return {
    type: "ClarificationBlock",
    title_he: block.title_he,
    submitLabel_he: block.submitLabel_he,
    questions: (block.questions ?? []).map((question: any) => ({
      id: question.id,
      text_he: question.question_he ?? question.text_he,
      inputType: question.type ?? question.inputType ?? "text",
      options_he: question.options_he,
      placeholder_he: question.placeholder_he,
      freeTextPrompt_he: question.freeTextPrompt_he,
    })),
  };
}

function ClarificationBlock({
  block,
  onSubmit,
  disabled,
}: {
  block: any;
  onSubmit: (payload: any) => void;
  disabled: boolean;
}) {
  const [selections, setSelections] = useState<Record<string, string[]>>({});
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});

  const handleToggleOption = (
    qid: string,
    option: string,
    mode: "single" | "multi" | "toggle"
  ) => {
    setSelections((prev) => {
      const current = prev[qid] ?? [];
      if (mode === "single" || mode === "toggle") {
        // If clicking the same option in single mode, keep it (or toggle off? usually radio keeps on)
        // Let's allow toggle off if it's the same one, or just switch. 
        // User asked for "checkbox" behavior which implies toggleability.
        return current.includes(option) ? { ...prev, [qid]: [] } : { ...prev, [qid]: [option] };
      } else {
        // multi
        if (current.includes(option)) {
          return { ...prev, [qid]: current.filter((x) => x !== option) };
        } else {
          return { ...prev, [qid]: [...current, option] };
        }
      }
    });
  };

  const submit = () => {
    const answers: Record<string, string> = {};
    (block.questions ?? []).forEach((q: any) => {
      const parts = [];
      const sel = selections[q.id];
      if (sel?.length) parts.push(sel.join(", "));

      const inp = inputs[q.id];
      if (inp) parts.push(inp);

      const note = notes[q.id];
      if (note) parts.push(note);

      answers[q.id] = parts.join(" ");
    });
    onSubmit({ answersById: answers });
  };

  return (
    <div
      className="max-w-xl rounded-2xl border border-gray-200 bg-white p-4 shadow-sm"
      dir="auto"
      style={{ textAlign: "start" }}
    >
      <div className="text-sm font-semibold text-gray-900">{block.title_he}</div>
      <div className="mt-3 space-y-4">
        {(block.questions ?? []).map((question: any) => {
          const inputType = question.inputType ?? "text";

          let options: string[] = [];
          if (inputType === "toggle") {
            options = Array.isArray(question.options_he) && question.options_he.length > 0
              ? question.options_he
              : ["כן", "לא"];
          } else if ((inputType === "single" || inputType === "multi") && Array.isArray(question.options_he)) {
            options = question.options_he;
          }

          const hasOptions = options.length > 0;
          const currentSelections = selections[question.id] ?? [];

          return (
            <div key={question.id} className="text-xs text-gray-600">
              <div className="mb-2 font-semibold text-gray-700">{question.text_he}</div>

              {hasOptions && (
                <div className="flex flex-wrap gap-2 mb-2">
                  {options.map((opt) => {
                    const isSelected = currentSelections.includes(opt);
                    return (
                      <button
                        key={opt}
                        onClick={() => handleToggleOption(question.id, opt, inputType)}
                        className={`rounded-lg border px-3 py-1.5 transition flex items-center gap-2 ${isSelected
                          ? "border-gray-900 bg-gray-900 text-white"
                          : "border-gray-200 bg-white text-gray-700 hover:border-gray-300"
                          }`}
                      >
                        <div className={`w-3 h-3 rounded-sm border ${isSelected ? "border-white bg-white" : "border-gray-400"}`} />
                        {opt}
                      </button>
                    )
                  })}
                </div>
              )}

              {!hasOptions && (
                <input
                  type={inputType === "date" ? "date" : inputType === "number" ? "number" : "text"}
                  value={inputs[question.id] ?? ""}
                  onChange={(e) => setInputs(prev => ({ ...prev, [question.id]: e.target.value }))}
                  placeholder={question.placeholder_he ?? ""}
                  className="w-full rounded-lg border border-gray-200 px-2 py-1.5 mb-2"
                />
              )}

              <input
                type="text"
                value={notes[question.id] ?? ""}
                onChange={(e) => setNotes(prev => ({ ...prev, [question.id]: e.target.value }))}
                placeholder={hasOptions ? (question.freeTextPrompt_he ?? `פרטים נוספים / ${options.length > 0 ? "אחר" : "הערות"}`) : "הערות..."}
                className="w-full rounded-lg border border-gray-200 px-2 py-1.5 bg-gray-50 focus:bg-white transition"
              />
            </div>
          );
        })}
      </div>
      <button
        onClick={submit}
        disabled={disabled}
        className="mt-4 w-full rounded-lg bg-black px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
      >
        {block.submitLabel_he ?? "שלח"}
      </button>
    </div>
  );
}

function SuggestionBlock({
  block,
  onSubmit,
  disabled,
}: {
  block: any;
  onSubmit: (payload: any) => void;
  disabled: boolean;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const selectionMode = block.selectionMode ?? "single";

  const toggle = (id: string) => {
    if (selectionMode === "single") {
      setSelected([id]);
      return;
    }
    setSelected((prev) => {
      return prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id];
    });
  };

  const handleSubmit = () => {
    onSubmit({
      selectedIds: selected,
      selectedItems: (block.items ?? []).filter((item: any) => selected.includes(item.id)),
      note_he: note,
    });
  };

  return (
    <div
      className="max-w-xl rounded-2xl border border-gray-200 bg-white p-4 shadow-sm"
      dir="auto"
      style={{ textAlign: "start" }}
    >
      <div className="text-sm font-semibold text-gray-900">{block.title_he}</div>
      {block.subtitle_he ? <div className="text-xs text-gray-500 mt-1">{block.subtitle_he}</div> : null}
      <div className="mt-3 space-y-2">
      {(block.items ?? []).map((item: any) => {
        const active = selected.includes(item.id);
        return (
          <button
            key={item.id}
            onClick={() => toggle(item.id)}
            className={`w-full rounded-xl border px-3 py-2 text-start text-xs transition ${active ? "border-gray-900 bg-gray-900 text-white" : "border-gray-200 bg-white"}`}
          >
            <div className="font-semibold">{item.label_he}</div>
            <div className={`mt-1 ${active ? "text-gray-200" : "text-gray-500"}`}>{item.why_he}</div>
            <div className={`mt-1 text-[10px] ${active ? "text-gray-300" : "text-gray-400"}`}>{item.details_he}</div>
          </button>
        );
      })}
      </div>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder={block.freeTextPrompt_he ?? "הערה חופשית"}
        rows={2}
        className="mt-3 w-full rounded-lg border border-gray-200 px-2 py-1 text-xs"
      />
      <button
        onClick={handleSubmit}
        disabled={disabled || selected.length === 0}
        className="mt-3 w-full rounded-lg bg-black px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
      >
        {block.submitLabel_he ?? "שלח בחירה"}
      </button>
    </div>
  );
}

function ChangeSetBlock({
  block,
  changeSetId,
  onApply,
  onDiscard,
  disabled,
}: {
  block: any;
  changeSetId?: Id<"changeSets">;
  onApply: (changeSetId?: Id<"changeSets">) => void;
  onDiscard: (changeSetId?: Id<"changeSets">) => void;
  disabled: boolean;
}) {
  const rawChanges = block.changes ?? {};
  const diff = block.diffPreview_he ?? {};

  // Normalize changes to array of { label, value }
  const changesList = Array.isArray(rawChanges)
    ? rawChanges
    : Object.entries(rawChanges).map(([key, value]) => ({ label: key, value }));
  const formatChangeValue = (value: unknown) => {
    if (value === null || value === undefined) return "";
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      return String(value);
    }
    if (typeof value === "object") {
      if ("patch" in (value as Record<string, unknown>)) return "patch";
      try {
        return JSON.stringify(value);
      } catch {
        return "[object]";
      }
    }
    return String(value);
  };

  return (
    <div
      className="relative max-w-xl rounded-2xl border border-gray-200 bg-white p-4 shadow-sm"
      dir="auto"
      style={{ textAlign: "start" }}
    >
      <div className="text-sm font-semibold text-gray-900">{block.title_he}</div>
      {block.summary_he ? <div className="text-xs text-gray-500 mt-1">{block.summary_he}</div> : null}
      <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-gray-500">
        {changesList.map((item: any, idx: number) => (
          <div key={idx} className="flex items-center justify-between rounded-md border border-gray-100 px-2 py-1">
            <span>{item.label}</span>
            <span className="font-semibold text-gray-700">{formatChangeValue(item.value)}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 space-y-2 text-[11px] text-gray-600">
        {(diff.elements ?? []).length ? (
          <div>
            <div className="font-semibold text-gray-700">Elements</div>
            <ul className="list-disc pl-4">
              {diff.elements.map((line: string, idx: number) => (
                <li key={`el-${idx}`}>{line}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {(diff.tasks ?? []).length ? (
          <div>
            <div className="font-semibold text-gray-700">Tasks</div>
            <ul className="list-disc pl-4">
              {diff.tasks.map((line: string, idx: number) => (
                <li key={`task-${idx}`}>{line}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {(diff.accounting ?? []).length ? (
          <div>
            <div className="font-semibold text-gray-700">Accounting</div>
            <ul className="list-disc pl-4">
              {diff.accounting.map((line: string, idx: number) => (
                <li key={`acc-${idx}`}>{line}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {(diff.printing ?? []).length ? (
          <div>
            <div className="font-semibold text-gray-700">Printing</div>
            <ul className="list-disc pl-4">
              {diff.printing.map((line: string, idx: number) => (
                <li key={`print-${idx}`}>{line}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {(diff.purchases ?? []).length ? (
          <div>
            <div className="font-semibold text-gray-700">Purchases</div>
            <ul className="list-disc pl-4">
              {diff.purchases.map((line: string, idx: number) => (
                <li key={`purchase-${idx}`}>{line}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
      <div className="mt-4 flex gap-2">
        <button
          onClick={() => onApply(changeSetId)}
          disabled={disabled || !changeSetId}
          className="flex-1 rounded-lg bg-black px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
        >
          {block.actions?.find((action: any) => action.id === "apply")?.label_he ?? "Apply"}
        </button>
        <button
          onClick={() => onDiscard(changeSetId)}
          disabled={disabled}
          className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 disabled:opacity-50"
        >
          {block.actions?.find((action: any) => action.id === "discard")?.label_he ?? "Discard"}
        </button>
        {!changeSetId && (
          <div className="absolute bottom-full mb-1 left-0 right-0 text-center text-[10px] text-red-500 bg-white border border-red-200 rounded px-1 py-0.5 shadow-sm">
            Not saved to DB (view only)
          </div>
        )}
      </div>
    </div>
  );
}

function PlanBlock({ block }: { block: any }) {
  const tasks = block?.tasksSummary ?? {};
  const bom = block?.bomSummary ?? {};
  return (
    <div
      className="max-w-xl rounded-2xl border border-gray-200 bg-white p-4 shadow-sm"
      dir="auto"
      style={{ textAlign: "start" }}
    >
      <div className="text-sm font-semibold text-gray-900">{block.title_he ?? "Plan"}</div>
      {block.summary_he ? <div className="mt-1 text-xs text-gray-500">{block.summary_he}</div> : null}
      <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-gray-600">
        <div className="rounded-md border border-gray-100 px-2 py-1">
          <div className="font-semibold text-gray-700">Tasks</div>
          <div>Count: {Number(tasks.taskCount ?? 0)}</div>
          <div>Dates: {tasks.hasDates ? "Yes" : "No"}</div>
          <div>Checklist: {tasks.hasChecklists ? "Yes" : "No"}</div>
        </div>
        <div className="rounded-md border border-gray-100 px-2 py-1">
          <div className="font-semibold text-gray-700">BOM</div>
          <div>Materials: {Number(bom.materialLines ?? 0)}</div>
          <div>Labor: {Number(bom.laborLines ?? 0)}</div>
          <div>Confidence: {Number(bom.confidenceAvg ?? 0).toFixed(2)}</div>
        </div>
      </div>
    </div>
  );
}
