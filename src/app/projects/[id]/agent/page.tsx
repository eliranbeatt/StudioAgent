"use client";

import { useQuery, useMutation, useAction } from "convex/react";
import { useParams, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";
import { SkillsDock } from "./_components/SkillsDock";
import { AgentChat } from "./_components/AgentChat";
import { Bot } from "lucide-react";
import { ConversationsSidebar } from "../_components/ConversationsSidebar";

import { ElementsRail } from "./_components/ElementsRail";

export default function AgentPage() {
  const params = useParams();
  const rawId = params.id as string;
  const resolved = useQuery(api.projects.resolveProjectId, { id: rawId });
  const projectId = resolved?.projectId;
  const router = useRouter();
  
  const conversations = useQuery(api.skills.runner.listAgentConversations as any, 
    projectId ? { projectId } : "skip"
  );
  const elementsData = useQuery(api.elements.listByProject, projectId ? { projectId } : "skip");

  const createConversation = useMutation(api.skills.runner.createAgentConversation);
  const renameConversation = useMutation(api.skills.runner.renameConversation);
  const generateTitle = useAction(api.skills.runner.generateConversationTitle);
  const startFlowRun = useMutation(api.flowRuns.start);

  const [activeConversationId, setActiveConversationId] = useState<Id<"agentConversations"> | null>(null);
  const [selectedElementIds, setSelectedElementIds] = useState<string[]>([]);
  const [hasInitializedSelection, setHasInitializedSelection] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [isStartingFlow, setIsStartingFlow] = useState(false);

  useEffect(() => {
    if (conversations && conversations.length > 0 && !activeConversationId) {
      setActiveConversationId(conversations[0]._id);
    }
  }, [conversations, activeConversationId]);

  useEffect(() => {
    if (!hasInitializedSelection && elementsData?.elements) {
      const allIds = elementsData.elements.map((e: any) => e.id);
      setSelectedElementIds(allIds);
      setHasInitializedSelection(true);
    }
  }, [elementsData, hasInitializedSelection]);

  const handleEnsureConversation = async () => {
    if (activeConversationId) return activeConversationId;
    if (!projectId) throw new Error("No project ID");
    const id = await createConversation({ projectId, title: "New Session" });
    setActiveConversationId(id);
    return id;
  };

  const handleNewSession = async () => {
      if (!projectId) return;
      const id = await createConversation({ projectId, title: "New Session" });
      setActiveConversationId(id);
  };

  const handleRenameConversation = async (conversationId: string, title: string) => {
    await renameConversation({ conversationId: conversationId as Id<"agentConversations">, title });
  };

  const handleGenerateTitle = async (conversationId: string) => {
    if (!projectId) return;
    await generateTitle({ conversationId: conversationId as Id<"agentConversations">, projectId });
  };

  const handleStartFlow = async () => {
    if (!projectId || isStartingFlow) return;
    setIsStartingFlow(true);
    try {
      await startFlowRun({ projectId });
      router.push(`/projects/${projectId}/flow-agent`);
    } finally {
      setIsStartingFlow(false);
    }
  };

  if (!projectId) return <div className="p-8 text-slate-400">Loading project...</div>;

  return (
    <div className="flex h-full bg-slate-50">
      <ConversationsSidebar
        items={conversations as any}
        activeId={activeConversationId as string | null}
        onSelect={(id) => setActiveConversationId(id as Id<"agentConversations">)}
        onCreate={handleNewSession}
        onRename={handleRenameConversation}
        onGenerateTitle={handleGenerateTitle}
      />

      {/* Center: Chat */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="border-b border-slate-200 bg-white px-6 py-3 flex items-center justify-between">
          <div className="text-sm font-semibold text-slate-700">Agent Workspace</div>
          <button
            onClick={handleStartFlow}
            disabled={isStartingFlow}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold uppercase tracking-wider text-slate-600 hover:bg-slate-50 disabled:opacity-60"
          >
            <Bot size={14} /> {isStartingFlow ? "Starting Flow..." : "Open Flow Mode"}
          </button>
        </div>
        <AgentChat 
          activeConversationId={activeConversationId} 
          projectId={projectId} 
          isThinking={isThinking}
          onSetThinking={setIsThinking}
        />
      </div>

      {/* Right: Skills Dock */}
      <div className="w-80 border-l border-slate-200 bg-white overflow-y-auto">
        <SkillsDock 
            projectId={projectId} 
            activeConversationId={activeConversationId}
            onEnsureConversation={handleEnsureConversation}
            selectedElementIds={selectedElementIds}
            onSetThinking={setIsThinking}
        />
      </div>

      {/* Far Right: Elements Rail */}
      <ElementsRail 
        projectId={projectId} 
        selectedIds={selectedElementIds} 
        onSelectionChange={setSelectedElementIds} 
      />
    </div>
  );
}
