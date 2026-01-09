"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import { useEffect, useMemo, useState } from "react";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";
import {
  Activity,
  Archive,
  Check,
  ChevronDown,
  ChevronUp,
  Pencil,
  Plus,
  Send,
  X,
} from "lucide-react";

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

type AgentActivityDrawerProps = {
  open: boolean;
  onClose: () => void;
  projectId: Id<"projects">;
};

const instructionChips = ["Cheaper", "Faster", "More Premium", "No PVC"];
const suggestedSkills = ["Research Vendors", "Draft Budget", "Build Timeline"];

export default function AgentActivityDrawer({
  open,
  onClose,
  projectId,
}: AgentActivityDrawerProps) {
  const [activeConversationId, setActiveConversationId] = useState<Id<"conversations"> | null>(null);
  const [input, setInput] = useState("");
  const [isWaiting, setIsWaiting] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [renamingId, setRenamingId] = useState<Id<"conversations"> | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [rightTab, setRightTab] = useState<"overview" | "suggestions" | "element">("overview");
  const [selectedElementId, setSelectedElementId] = useState<Id<"elements"> | null>(null);
  const [editingOverview, setEditingOverview] = useState(false);
  const [overviewDraft, setOverviewDraft] = useState("");
  const [logsOpen, setLogsOpen] = useState(false);

  const conversations = useQuery(
    api.agent.listConversations,
    open ? { projectId } : "skip"
  );
  const overview = useQuery(api.projects.getOverview, open ? { id: projectId } : "skip");
  const suggestions = useQuery(
    api.suggestions.listSuggested,
    open ? { projectId } : "skip"
  ) as any[] | undefined;

  const createConversation = useMutation(api.agent.createConversation);
  const setConversationStage = useMutation(api.agent.setConversationStageV1);
  const setConversationMode = useMutation(api.agent.setConversationMode);
  const setConversationTitle = useMutation(api.agent.setConversationTitle);
  const setConversationStatus = useMutation(api.agent.setConversationStatus);
  const appendUserMessage = useMutation(api.agent.appendUserMessage);
  const appendEventMessage = useMutation(api.agent.appendEventMessage);
  const applyChangeSet = useMutation(api.changeSets.applyChangeSet);
  const discardChangeSet = useMutation(api.changeSets.discardChangeSet);
  const approveSuggested = useMutation(api.suggestions.approveSuggestedElement);
  const rejectSuggested = useMutation(api.suggestions.rejectSuggestedElement);
  const updateProjectSummary = useMutation(api.projects.updateProjectSummary);
  const agentRespond = useAction(api.agent.agentRespond);

  const activeConversation = useMemo(() => {
    if (!conversations || !activeConversationId) return null;
    return conversations.find((item) => item._id === activeConversationId) ?? null;
  }, [conversations, activeConversationId]);

  const messages = useQuery(
    api.agent.listConversationMessages,
    open && activeConversationId
      ? { conversationId: activeConversationId, limit: 80 }
      : "skip"
  ) as ConversationMessage[] | undefined;

  const normalizedMessages = useMemo(() => {
    if (!messages) return [];
    return messages.map((msg) => {
      if (msg.role !== "assistant" || !msg.text_he) return msg;
      const normalized = normalizeStructuredMessage(msg.text_he);
      if (!normalized.block && !normalized.text) return msg;
      return {
        ...msg,
        text_he: normalized.text ?? msg.text_he,
        block: msg.block ?? normalized.block,
      };
    });
  }, [messages]);

  useEffect(() => {
    if (!conversations || !open) return;
    if (activeConversationId) return;
    if (conversations.length > 0) {
      setActiveConversationId(conversations[0]._id);
      return;
    }
    createConversation({ projectId }).then((convId) => setActiveConversationId(convId));
  }, [conversations, activeConversationId, createConversation, projectId, open]);

  useEffect(() => {
    if (!overview?.elements?.length) return;
    if (selectedElementId) return;
    setSelectedElementId(overview.elements[0].id as Id<"elements">);
  }, [overview?.elements, selectedElementId]);

  useEffect(() => {
    if (!overview?.project) return;
    if (editingOverview) return;
    setOverviewDraft(overview.project.overviewSummary ?? "");
  }, [overview?.project, editingOverview]);

  const activeMessages = useMemo(() => {
    return normalizedMessages.filter((msg) => msg.role !== "event");
  }, [normalizedMessages]);

  const eventLogs = useMemo(() => {
    return normalizedMessages.filter((msg) => msg.role === "event").slice(-12).reverse();
  }, [normalizedMessages]);

  const latestBlockMessage = useMemo(() => {
    for (let i = normalizedMessages.length - 1; i >= 0; i -= 1) {
      if (normalizedMessages[i].block) return normalizedMessages[i];
    }
    return null;
  }, [normalizedMessages]);

  const activeBlock = latestBlockMessage?.block;
  const activeBlockType = activeBlock?.type;

  const panelMode: Mode =
    activeBlockType === "ClarificationBlock" || activeBlockType === "QuestionsBlock"
      ? "QUESTIONS"
      : activeBlockType === "SuggestionBlock" || activeBlockType === "ChangeSetBlock"
        ? "SUGGESTIONS"
        : "CHAT";

  const changeSetCards = useMemo(() => {
    if (!normalizedMessages.length) return [];
    const applied = new Set<string>();
    const discarded = new Set<string>();
    normalizedMessages.forEach((msg) => {
      if (msg.role !== "event") return;
      const id = msg.eventPayload?.changeSetId;
      if (!id) return;
      if (msg.eventType === "changeset_applied") applied.add(String(id));
      if (msg.eventType === "changeset_discarded") discarded.add(String(id));
    });
    return normalizedMessages
      .filter((msg) => msg.block?.type === "ChangeSetBlock" && msg.changeSetId)
      .map((msg) => ({
        id: msg.changeSetId as Id<"changeSets">,
        title: msg.block?.title_he ?? "Draft ChangeSet",
        summary: msg.block?.summary_he,
        diff: msg.block?.diffPreview_he ?? {},
        changes: msg.block?.changes ?? {},
        status: applied.has(String(msg.changeSetId))
          ? "applied"
          : discarded.has(String(msg.changeSetId))
            ? "discarded"
            : "pending",
      }));
  }, [messages]);

  const stageValue = (activeConversation?.stage ?? "IDEATION") as Stage;
  const modeValue = (activeConversation?.mode ?? panelMode ?? "CHAT") as Mode;

  const handleSend = async () => {
    if (!input.trim() || !activeConversationId || isWaiting) return;
    const text = input.trim();
    setInput("");
    setIsWaiting(true);
    try {
      await appendUserMessage({ conversationId: activeConversationId, text_he: text });
      await agentRespond({
        conversationId: activeConversationId,
        uiContext: { selectedElementIds: selectedElementId ? [selectedElementId] : [] },
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
        uiContext: { selectedElementIds: selectedElementId ? [selectedElementId] : [] },
      });
    } finally {
      setIsWaiting(false);
    }
  };

  const handleApplyChangeSet = async (changeSetId?: Id<"changeSets">) => {
    if (!changeSetId || !activeConversationId || isWaiting) return;
    setIsWaiting(true);
    try {
      await applyChangeSet({ changeSetId });
      await appendEventMessage({
        conversationId: activeConversationId,
        eventType: "changeset_applied",
        eventPayload: { changeSetId },
      });
      await agentRespond({
        conversationId: activeConversationId,
        uiContext: { selectedElementIds: selectedElementId ? [selectedElementId] : [] },
      });
    } finally {
      setIsWaiting(false);
    }
  };

  const handleDiscardChangeSet = async (changeSetId?: Id<"changeSets">) => {
    if (!changeSetId || !activeConversationId || isWaiting) return;
    setIsWaiting(true);
    try {
      await discardChangeSet({ changeSetId });
      await appendEventMessage({
        conversationId: activeConversationId,
        eventType: "changeset_discarded",
        eventPayload: { changeSetId },
      });
      await agentRespond({
        conversationId: activeConversationId,
        uiContext: { selectedElementIds: selectedElementId ? [selectedElementId] : [] },
      });
    } finally {
      setIsWaiting(false);
    }
  };

  const handleRename = async (id: Id<"conversations">) => {
    const value = renameDraft.trim();
    if (!value) {
      setRenamingId(null);
      return;
    }
    await setConversationTitle({ id, title_he: value });
    setRenamingId(null);
  };

  const handleArchive = async (id: Id<"conversations">) => {
    await setConversationStatus({ id, status: "archived" });
    if (activeConversationId === id) {
      setActiveConversationId(null);
    }
  };

  const handleSaveOverview = async () => {
    if (!overview?.project?._id) return;
    await updateProjectSummary({ id: overview.project._id, overviewSummary: overviewDraft });
    setEditingOverview(false);
  };

  const activeConversations = (conversations ?? []).filter((item) => item.status === "active");
  const archivedConversations = (conversations ?? []).filter((item) => item.status === "archived");
  const pendingSuggestions = (suggestions ?? []).filter((item) => item.status === "pending");

  return (
    <div className={`fixed inset-0 z-50 ${open ? "pointer-events-auto" : "pointer-events-none"}`}>
      <div
        className={`absolute inset-0 bg-slate-900/20 transition-opacity ${open ? "opacity-100" : "opacity-0"}`}
        onClick={onClose}
      />
      <div
        className={`absolute left-0 top-0 h-full w-full max-w-6xl bg-slate-50 border-r border-blue-200 shadow-2xl transition-transform duration-300 ${open ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="h-full flex flex-col">
          <header className="h-14 px-5 border-b border-blue-200 flex items-center justify-between bg-white">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-700">
                <Activity size={16} />
              </div>
              <div>
                <div className="text-sm font-semibold text-gray-900">Agent Activity</div>
                <div className="text-[10px] uppercase tracking-widest text-gray-400">AgenticEshet Console</div>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-md border border-blue-200 text-blue-700 hover:bg-blue-50"
              aria-label="Close Agent Activity"
            >
              <X size={16} />
            </button>
          </header>

          <div className="flex-1 grid grid-cols-[240px_minmax(0,1fr)_300px]">
            <aside className="border-r border-blue-200 bg-white flex flex-col">
              <div className="p-4 border-b border-blue-200 flex items-center justify-between">
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-gray-400">Thread History</div>
                  <div className="text-xs font-semibold text-gray-900">Sessions</div>
                </div>
                <button
                  onClick={() =>
                    createConversation({ projectId }).then((convId) => setActiveConversationId(convId))
                  }
                  className="inline-flex items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-[10px] font-semibold text-blue-700 hover:bg-blue-100"
                >
                  <Plus size={12} /> New
                </button>
              </div>
              <div className="px-4 pt-3 pb-2">
                <button
                  onClick={() => setShowArchived((prev) => !prev)}
                  className="text-[10px] uppercase tracking-widest text-gray-400 flex items-center gap-1"
                >
                  {showArchived ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                  {showArchived ? "Hide archived" : "Show archived"}
                </button>
              </div>
              <div className="flex-1 overflow-y-auto px-3 pb-4 space-y-2">
                {(showArchived ? archivedConversations : activeConversations).length === 0 ? (
                  <div className="text-[11px] text-gray-400 px-2 py-6">No conversations yet.</div>
                ) : (
                  (showArchived ? archivedConversations : activeConversations).map((conversation) => {
                    const isActive = conversation._id === activeConversationId;
                    const isEditing = renamingId === conversation._id;
                    return (
                      <div
                        key={conversation._id}
                        className={`rounded-lg border px-2 py-2 text-left text-[11px] transition ${isActive
                          ? "border-blue-500 bg-blue-50"
                          : "border-blue-100 bg-white hover:bg-blue-50/60"
                          }`}
                      >
                        <button
                          onClick={() => setActiveConversationId(conversation._id)}
                          className="w-full text-left"
                        >
                          {isEditing ? (
                            <input
                              value={renameDraft}
                              onChange={(e) => setRenameDraft(e.target.value)}
                              onBlur={() => handleRename(conversation._id)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") handleRename(conversation._id);
                                if (e.key === "Escape") setRenamingId(null);
                              }}
                              className="w-full rounded-md border border-blue-200 px-2 py-1 text-[11px]"
                              autoFocus
                            />
                          ) : (
                            <div className="font-semibold text-gray-900">
                              {conversation.title_he ?? "New Thread"}
                            </div>
                          )}
                        </button>
                        <div className="mt-1 flex items-center justify-between text-[10px] uppercase tracking-wide text-gray-400">
                          <span>{String(conversation.stage).toUpperCase()}</span>
                          <span>{formatTimestamp(conversation.updatedAt)}</span>
                        </div>
                        <div className="mt-2 flex items-center gap-2">
                          <button
                            onClick={() => {
                              setRenamingId(conversation._id);
                              setRenameDraft(conversation.title_he ?? "");
                            }}
                            className="inline-flex items-center gap-1 rounded-md border border-blue-200 px-2 py-0.5 text-[10px] text-blue-700 hover:bg-blue-50"
                          >
                            <Pencil size={10} /> Rename
                          </button>
                          {!showArchived ? (
                            <button
                              onClick={() => handleArchive(conversation._id)}
                              className="inline-flex items-center gap-1 rounded-md border border-blue-200 px-2 py-0.5 text-[10px] text-blue-700 hover:bg-blue-50"
                            >
                              <Archive size={10} /> Archive
                            </button>
                          ) : null}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </aside>

            <section className="flex flex-col border-r border-blue-200 bg-slate-50">
              <div className="h-14 px-6 border-b border-blue-200 flex items-center justify-between bg-white">
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-gray-400">Active Brain</div>
                  <div className="text-sm font-semibold text-gray-900">
                    {activeConversation?.title_he ?? "Live Session"}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={stageValue}
                    onChange={(e) => {
                      const stage = e.target.value as Stage;
                      if (activeConversationId) {
                        setConversationStage({ id: activeConversationId, stage });
                      }
                    }}
                    className="border border-blue-200 rounded-md px-2 py-1 text-[11px] text-gray-700 bg-white"
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
                    className="border border-blue-200 rounded-md px-2 py-1 text-[11px] text-gray-700 bg-white"
                  >
                    <option value="CHAT">Chat</option>
                    <option value="QUESTIONS">Questions</option>
                    <option value="SUGGESTIONS">Suggestions</option>
                  </select>
                  {isWaiting ? (
                    <span className="text-[10px] uppercase tracking-widest text-blue-600 animate-pulse">
                      Running...
                    </span>
                  ) : null}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto px-6 py-6">
                {panelMode === "QUESTIONS" && activeBlock ? (
                  <ClarificationPanel
                    block={normalizeQuestionsBlock(activeBlock)}
                    disabled={isWaiting}
                    onSubmit={(payload) => handleEventSubmit("clarification_submitted", payload)}
                  />
                ) : null}

                {panelMode === "SUGGESTIONS" && activeBlock ? (
                  activeBlock.type === "SuggestionBlock" ? (
                    <SuggestionReviewPanel
                      block={activeBlock}
                      disabled={isWaiting}
                      onSubmit={(payload) => handleEventSubmit("suggestions_selected", payload)}
                    />
                  ) : (
                    <ChangeSetReviewPanel
                      block={activeBlock}
                      changeSetId={latestBlockMessage?.changeSetId}
                      disabled={isWaiting}
                      onApply={handleApplyChangeSet}
                      onDiscard={handleDiscardChangeSet}
                    />
                  )
                ) : null}

                {panelMode === "CHAT" ? (
                  <div className="space-y-4">
                    {activeMessages.length === 0 ? (
                      <div className="text-xs text-gray-400">No messages yet.</div>
                    ) : (
                      activeMessages.map((msg) => (
                        <div key={msg._id} className="text-xs space-y-2">
                          <div className="text-[10px] uppercase tracking-wide text-gray-400">
                            {msg.role === "user" ? "You" : "Agent"}
                          </div>
                          <div
                            className={`mt-1 rounded-lg px-3 py-2 border text-[11px] ${msg.role === "user"
                              ? "bg-blue-600 text-white border-blue-600"
                              : "bg-white border-blue-200 text-gray-800"
                              }`}
                            dir="auto"
                            style={{ textAlign: "start" }}
                          >
                            {msg.text_he ?? "..."}
                          </div>
                          {msg.block?.type === "PlanBlock" ? <PlanBlockCard block={msg.block} /> : null}
                        </div>
                      ))
                    )}
                  </div>
                ) : null}

                <div className="mt-8">
                  <button
                    onClick={() => setLogsOpen((prev) => !prev)}
                    className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-gray-400"
                  >
                    {logsOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                    Agent Activity Logs
                  </button>
                  {logsOpen ? (
                    <div className="mt-3 rounded-lg border border-blue-200 bg-white p-3 space-y-2 text-[11px]">
                      {eventLogs.length === 0 ? (
                        <div className="text-gray-400">No activity logs yet.</div>
                      ) : (
                        eventLogs.map((log) => (
                          <div key={log._id} className="flex items-start justify-between gap-2">
                            <div>
                              <div className="font-semibold text-gray-800">{log.eventType ?? "event"}</div>
                              <div className="text-[10px] text-gray-400">
                                {formatTimestamp(log.createdAt)}
                              </div>
                            </div>
                            <span className="text-[10px] uppercase tracking-wide text-blue-600">Info</span>
                          </div>
                        ))
                      )}
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="border-t border-blue-200 bg-white px-6 py-4">
                <div className="flex items-center gap-2 mb-3">
                  {suggestedSkills.map((skill) => (
                    <button
                      key={skill}
                      onClick={() => setInput((prev) => (prev ? `${prev}\n${skill}` : skill))}
                      className="text-[10px] uppercase tracking-widest px-2 py-1 border border-blue-200 rounded-md text-blue-700 hover:bg-blue-50"
                    >
                      {skill}
                    </button>
                  ))}
                </div>
                <div className="flex items-end gap-3">
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
                    placeholder="Send a command or note..."
                    className="flex-1 resize-none rounded-lg border border-blue-200 px-3 py-2 text-xs text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-100"
                  />
                  <button
                    onClick={handleSend}
                    disabled={isWaiting || !input.trim()}
                    className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                  >
                    <Send size={14} />
                    Send
                  </button>
                </div>
              </div>
            </section>

            <aside className="flex flex-col bg-white">
              <div className="border-b border-blue-200 px-4 py-3">
                <div className="flex items-center gap-2">
                  {[
                    { key: "overview", label: "Overview" },
                    { key: "suggestions", label: "Suggestions" },
                    { key: "element", label: "Element" },
                  ].map((tab) => {
                    const active = rightTab === tab.key;
                    return (
                      <button
                        key={tab.key}
                        onClick={() => setRightTab(tab.key as typeof rightTab)}
                        className={`text-[10px] uppercase tracking-widest px-2 py-1 rounded-md border ${active
                          ? "border-blue-500 bg-blue-50 text-blue-700"
                          : "border-blue-200 text-gray-500 hover:bg-blue-50"
                          }`}
                      >
                        {tab.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {rightTab === "overview" ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-[10px] uppercase tracking-widest text-gray-400">Running Memory</div>
                        <div className="text-xs font-semibold text-gray-900">Project Summary</div>
                      </div>
                      {editingOverview ? (
                        <button
                          onClick={handleSaveOverview}
                          className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-2 py-1 text-[10px] font-semibold text-white"
                        >
                          <Check size={12} /> Save
                        </button>
                      ) : (
                        <button
                          onClick={() => setEditingOverview(true)}
                          className="inline-flex items-center gap-1 rounded-md border border-blue-200 px-2 py-1 text-[10px] text-blue-700 hover:bg-blue-50"
                        >
                          <Pencil size={10} /> Edit
                        </button>
                      )}
                    </div>
                    {editingOverview ? (
                      <textarea
                        value={overviewDraft}
                        onChange={(e) => setOverviewDraft(e.target.value)}
                        rows={10}
                        className="w-full rounded-lg border border-blue-200 px-3 py-2 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-100"
                      />
                    ) : (
                      <div className="rounded-lg border border-blue-200 bg-slate-50 px-3 py-2 text-xs text-gray-700 whitespace-pre-wrap min-h-[120px]">
                        {overview?.project?.overviewSummary || "No summary yet. Ask the agent to build one."}
                      </div>
                    )}
                  </div>
                ) : null}

                {rightTab === "suggestions" ? (
                  <div className="space-y-4">
                    <div>
                      <div className="text-[10px] uppercase tracking-widest text-gray-400">Draft Revisions</div>
                      <div className="text-xs font-semibold text-gray-900">ChangeSets</div>
                    </div>
                    {changeSetCards.length === 0 ? (
                      <div className="text-xs text-gray-400">No pending change sets.</div>
                    ) : (
                      changeSetCards.map((item) => (
                        <div key={item.id} className="rounded-lg border border-blue-200 bg-white p-3">
                          <div className="flex items-center justify-between">
                            <div className="text-xs font-semibold text-gray-900">{item.title}</div>
                            <span
                              className={`text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full ${item.status === "pending"
                                ? "bg-yellow-100 text-yellow-700"
                                : item.status === "applied"
                                  ? "bg-green-100 text-green-700"
                                  : "bg-red-100 text-red-700"
                                }`}
                            >
                              {item.status}
                            </span>
                          </div>
                          {item.summary ? (
                            <div className="mt-1 text-[11px] text-gray-500">{item.summary}</div>
                          ) : null}
                          <div className="mt-2 grid grid-cols-2 gap-2 text-[10px] text-gray-500">
                            {Object.entries(item.changes ?? {}).map(([key, value]) => (
                              <div key={key} className="flex items-center justify-between rounded-md border border-blue-100 px-2 py-1">
                                <span>{key}</span>
                                <span className="font-semibold text-gray-700">{value as number}</span>
                              </div>
                            ))}
                          </div>
                          <div className="mt-3 flex gap-2">
                            <button
                              onClick={() => handleApplyChangeSet(item.id)}
                              disabled={item.status !== "pending" || isWaiting}
                              className="flex-1 rounded-md bg-green-600 px-2 py-1 text-[10px] font-semibold text-white disabled:opacity-50"
                            >
                              Approve
                            </button>
                            <button
                              onClick={() => handleDiscardChangeSet(item.id)}
                              disabled={item.status !== "pending" || isWaiting}
                              className="flex-1 rounded-md border border-blue-200 px-2 py-1 text-[10px] font-semibold text-gray-600 disabled:opacity-50"
                            >
                              Discard
                            </button>
                          </div>
                        </div>
                      ))
                    )}

                    <div className="pt-3 border-t border-blue-200">
                      <div className="text-[10px] uppercase tracking-widest text-gray-400">Suggestion Queue</div>
                      <div className="text-xs font-semibold text-gray-900">Suggested Elements</div>
                      {pendingSuggestions.length === 0 ? (
                        <div className="mt-2 text-xs text-gray-400">No pending suggestions.</div>
                      ) : (
                        <div className="mt-2 space-y-2">
                          {pendingSuggestions.map((item: any) => (
                            <div key={item._id} className="rounded-lg border border-blue-200 bg-white p-3">
                              <div className="text-xs font-semibold text-gray-900">{item.title}</div>
                              <div className="text-[10px] uppercase tracking-wide text-gray-400">{item.type}</div>
                              <div className="mt-2 flex gap-2">
                                <button
                                  onClick={() => approveSuggested({ suggestionId: item._id })}
                                  className="flex-1 rounded-md bg-green-600 px-2 py-1 text-[10px] font-semibold text-white"
                                >
                                  Approve
                                </button>
                                <button
                                  onClick={() => rejectSuggested({ suggestionId: item._id })}
                                  className="flex-1 rounded-md border border-blue-200 px-2 py-1 text-[10px] font-semibold text-gray-600"
                                >
                                  Reject
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ) : null}

                {rightTab === "element" ? (
                  <div className="space-y-3">
                    <div className="text-[10px] uppercase tracking-widest text-gray-400">Element Focus</div>
                    <select
                      value={selectedElementId ?? ""}
                      onChange={(e) =>
                        setSelectedElementId(e.target.value as Id<"elements">)
                      }
                      className="w-full rounded-md border border-blue-200 px-2 py-1 text-xs"
                    >
                      {(overview?.elements ?? []).map((el) => (
                        <option key={el.id} value={el.id}>
                          {el.title}
                        </option>
                      ))}
                    </select>
                    {selectedElementId ? (
                      <div className="rounded-lg border border-blue-200 bg-slate-50 px-3 py-3 space-y-2 text-xs">
                        {overview?.elements?.map((el) => {
                          if (el.id !== selectedElementId) return null;
                          return (
                            <div key={el.id} className="space-y-2">
                              <div className="text-sm font-semibold text-gray-900">{el.title}</div>
                              <div className="flex flex-wrap gap-2 text-[10px] uppercase tracking-wide">
                                <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                                  {el.type}
                                </span>
                                <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                                  {el.status}
                                </span>
                              </div>
                              {el.status === "drafting" ? (
                                <div className="rounded-md border border-yellow-200 bg-yellow-50 px-2 py-1 text-[11px] text-yellow-700">
                                  Pending changes detected for this element.
                                </div>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="text-xs text-gray-400">No elements available.</div>
                    )}
                  </div>
                ) : null}
              </div>
            </aside>
          </div>
        </div>
      </div>
    </div>
  );
}

function tryParseJson(text: string) {
  try {
    const jsonBlockMatch = text.match(/```json\s*([\s\S]*?)\s*```/i) || text.match(/```json\s*([\s\S]*)$/i);
    if (jsonBlockMatch && jsonBlockMatch[1]) {
      const parsed = JSON.parse(jsonBlockMatch[1]);
      if (parsed && typeof parsed === "object") return parsed;
    }

    const codeBlockMatch = text.match(/```\s*([\s\S]*?)\s*```/) || text.match(/```\s*([\s\S]*)$/);
    if (codeBlockMatch && codeBlockMatch[1]) {
      const parsed = JSON.parse(codeBlockMatch[1]);
      if (parsed && typeof parsed === "object") return parsed;
    }

    const cleaned = text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/, "");
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
  const match = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i) || text.match(/```(?:json)?\s*([\s\S]*)$/i);
  if (!match) return null;
  return {
    json: match[1],
    textPart: text.slice(0, match.index ?? 0).trim(),
  };
}

function normalizeStructuredMessage(text?: string) {
  if (!text) return { text, block: undefined as any };
  const fenced = extractJsonBlock(text);
  const parsed = fenced ? tryParseJson(fenced.json) : tryParseJson(text);
  if (!parsed) return { text, block: undefined as any };

  const block = isStructuredBlock(parsed) ? parsed : parsed.block;
  const parsedText = isStructuredBlock(parsed)
    ? fenced?.textPart
    : parsed.assistantText_he ?? parsed.text_he ?? parsed.text;

  return {
    text: parsedText ?? fenced?.textPart ?? text,
    block,
  };
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

function ClarificationPanel({
  block,
  disabled,
  onSubmit,
}: {
  block: any;
  disabled: boolean;
  onSubmit: (payload: any) => void;
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
        return current.includes(option) ? { ...prev, [qid]: [] } : { ...prev, [qid]: [option] };
      }
      if (current.includes(option)) {
        return { ...prev, [qid]: current.filter((x) => x !== option) };
      }
      return { ...prev, [qid]: [...current, option] };
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
      className="rounded-xl border border-blue-200 bg-white p-4 shadow-sm"
      dir="auto"
      style={{ textAlign: "start" }}
    >
      <div className="text-xs font-semibold text-gray-900">
        {block.title_he ?? "Questions"}
      </div>
      <div className="mt-3 space-y-3">
        {(block.questions ?? []).map((question: any) => {
          const inputType = question.inputType ?? "text";
          let options: string[] = [];
          if (inputType === "toggle") {
            options = Array.isArray(question.options_he) && question.options_he.length > 0
              ? question.options_he
              : ["Yes", "No"];
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
                        className={`rounded-md border px-3 py-1 transition ${isSelected
                          ? "border-blue-500 bg-blue-600 text-white"
                          : "border-blue-200 bg-white text-gray-700 hover:bg-blue-50"
                          }`}
                      >
                        {opt}
                      </button>
                    );
                  })}
                </div>
              )}

              {!hasOptions && (
                <input
                  type={inputType === "date" ? "date" : inputType === "number" ? "number" : "text"}
                  value={inputs[question.id] ?? ""}
                  onChange={(e) => setInputs((prev) => ({ ...prev, [question.id]: e.target.value }))}
                  placeholder={question.placeholder_he ?? ""}
                  className="w-full rounded-md border border-blue-200 px-2 py-1 mb-2"
                />
              )}

              <input
                type="text"
                value={notes[question.id] ?? ""}
                onChange={(e) => setNotes((prev) => ({ ...prev, [question.id]: e.target.value }))}
                placeholder={question.freeTextPrompt_he ?? "Notes..."}
                className="w-full rounded-md border border-blue-200 px-2 py-1 bg-blue-50 focus:bg-white transition"
              />
            </div>
          );
        })}
      </div>
      <button
        onClick={submit}
        disabled={disabled}
        className="mt-4 w-full rounded-md bg-blue-600 px-3 py-2 text-[11px] font-semibold text-white disabled:opacity-50"
      >
        {block.submitLabel_he ?? "Send answers & continue"}
      </button>
    </div>
  );
}

function SuggestionReviewPanel({
  block,
  disabled,
  onSubmit,
}: {
  block: any;
  disabled: boolean;
  onSubmit: (payload: any) => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const selectionMode = block.selectionMode ?? "single";

  const toggle = (id: string) => {
    if (selectionMode === "single") {
      setSelected([id]);
      return;
    }
    setSelected((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  };

  const addChip = (chip: string) => {
    setNote((prev) => (prev.includes(chip) ? prev : `${prev}${prev ? " " : ""}${chip}`));
  };

  return (
    <div
      className="rounded-xl border border-blue-200 bg-white p-4 shadow-sm space-y-3"
      dir="auto"
      style={{ textAlign: "start" }}
    >
      <div>
        <div className="text-xs font-semibold text-gray-900">
          {block.title_he ?? "Suggestion Review"}
        </div>
        {block.subtitle_he ? <div className="text-[11px] text-gray-500">{block.subtitle_he}</div> : null}
      </div>

      <div className="flex flex-wrap gap-2">
        {instructionChips.map((chip) => (
          <button
            key={chip}
            onClick={() => addChip(chip)}
            className="text-[10px] uppercase tracking-widest px-2 py-1 border border-blue-200 rounded-md text-blue-700 hover:bg-blue-50"
          >
            {chip}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {(block.items ?? []).map((item: any) => {
          const active = selected.includes(item.id);
          return (
            <button
              key={item.id}
              onClick={() => toggle(item.id)}
              className={`w-full rounded-lg border px-3 py-2 text-start text-[11px] transition ${active
                ? "border-blue-500 bg-blue-600 text-white"
                : "border-blue-200 bg-white"
                }`}
            >
              <div className="font-semibold">{item.label_he}</div>
              <div className={`mt-1 ${active ? "text-blue-100" : "text-gray-500"}`}>
                {item.why_he}
              </div>
              <div className={`mt-1 text-[10px] ${active ? "text-blue-200" : "text-gray-400"}`}>
                {item.details_he}
              </div>
            </button>
          );
        })}
      </div>

      <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-[11px] text-gray-700">
        Draft Stats: Items {selected.length} of {(block.items ?? []).length}
      </div>

      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder={block.freeTextPrompt_he ?? "Add direction..."}
        rows={2}
        className="w-full rounded-md border border-blue-200 px-2 py-1 text-xs"
      />

      <button
        onClick={() => onSubmit({ selectedIds: selected, note_he: note })}
        disabled={disabled}
        className="w-full rounded-md bg-blue-600 px-3 py-2 text-[11px] font-semibold text-white disabled:opacity-50"
      >
        {block.submitLabel_he ?? "Send & continue"}
      </button>
    </div>
  );
}

function ChangeSetReviewPanel({
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
  const changes = block.changes ?? {};
  const diff = block.diffPreview_he ?? {};

  return (
    <div
      className="rounded-xl border border-blue-200 bg-white p-4 shadow-sm"
      dir="auto"
      style={{ textAlign: "start" }}
    >
      <div className="text-xs font-semibold text-gray-900">{block.title_he ?? "ChangeSet"}</div>
      {block.summary_he ? <div className="text-[11px] text-gray-500 mt-1">{block.summary_he}</div> : null}
      <div className="mt-3 grid grid-cols-2 gap-2 text-[10px] text-gray-500">
        {Object.entries(changes).map(([key, value]) => (
          <div key={key} className="flex items-center justify-between rounded-md border border-blue-100 px-2 py-1">
            <span>{key}</span>
            <span className="font-semibold text-gray-700">{value as number}</span>
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
      </div>
      <div className="mt-4 flex gap-2">
        <button
          onClick={() => onApply(changeSetId)}
          disabled={disabled}
          className="flex-1 rounded-md bg-green-600 px-3 py-2 text-[11px] font-semibold text-white disabled:opacity-50"
        >
          {block.actions?.find((action: any) => action.id === "apply")?.label_he ?? "Approve"}
        </button>
        <button
          onClick={() => onDiscard(changeSetId)}
          disabled={disabled}
          className="flex-1 rounded-md border border-blue-200 px-3 py-2 text-[11px] font-semibold text-gray-600 disabled:opacity-50"
        >
          {block.actions?.find((action: any) => action.id === "discard")?.label_he ?? "Discard"}
        </button>
      </div>
    </div>
  );
}

function PlanBlockCard({ block }: { block: any }) {
  const tasks = block?.tasksSummary ?? {};
  const bom = block?.bomSummary ?? {};
  return (
    <div
      className="rounded-lg border border-blue-200 bg-white p-3 text-[11px]"
      dir="auto"
      style={{ textAlign: "start" }}
    >
      <div className="font-semibold text-gray-900">{block.title_he ?? "Plan"}</div>
      {block.summary_he ? <div className="mt-1 text-gray-500">{block.summary_he}</div> : null}
      <div className="mt-2 grid grid-cols-2 gap-2 text-[10px] text-gray-600">
        <div className="rounded-md border border-blue-100 px-2 py-1">
          <div className="font-semibold text-gray-700">Tasks</div>
          <div>Count: {Number(tasks.taskCount ?? 0)}</div>
          <div>Dates: {tasks.hasDates ? "Yes" : "No"}</div>
          <div>Checklist: {tasks.hasChecklists ? "Yes" : "No"}</div>
        </div>
        <div className="rounded-md border border-blue-100 px-2 py-1">
          <div className="font-semibold text-gray-700">BOM</div>
          <div>Materials: {Number(bom.materialLines ?? 0)}</div>
          <div>Labor: {Number(bom.laborLines ?? 0)}</div>
          <div>Confidence: {Number(bom.confidenceAvg ?? 0).toFixed(2)}</div>
        </div>
      </div>
    </div>
  );
}

function formatTimestamp(value?: number) {
  if (!value) return "--";
  const date = new Date(value);
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
