"use client";

import { useQuery, useMutation } from "convex/react";
import { useParams } from "next/navigation";
import { useState, useEffect } from "react";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";
import { SkillsDock } from "./_components/SkillsDock";
import { AgentChat } from "./_components/AgentChat";
import { Plus } from "lucide-react";

import { ElementsRail } from "./_components/ElementsRail";

export default function AgentPage() {
  const params = useParams();
  const rawId = params.id as string;
  const resolved = useQuery(api.projects.resolveProjectId, { id: rawId });
  const projectId = resolved?.projectId;
  
  const conversations = useQuery(api.skills.runner.listAgentConversations as any, 
    projectId ? { projectId } : "skip"
  );
  const createConversation = useMutation(api.skills.runner.createAgentConversation);

  const [activeConversationId, setActiveConversationId] = useState<Id<"agentConversations"> | null>(null);
  const [selectedElementIds, setSelectedElementIds] = useState<string[]>([]);

  useEffect(() => {
    if (conversations && conversations.length > 0 && !activeConversationId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setActiveConversationId(conversations[0]._id);
    }
  }, [conversations, activeConversationId]);

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
  }

  if (!projectId) return <div className="p-8 text-slate-400">Loading project...</div>;

  return (
    <div className="flex h-full bg-slate-50">
      {/* Left Sidebar: Conversations */}
      <div className="w-64 border-r border-slate-200 bg-white flex flex-col">
        <div className="p-4 border-b border-slate-100 flex justify-between items-center">
          <h2 className="font-semibold text-sm text-slate-700">Conversations</h2>
          <button 
            onClick={handleNewSession}
            className="text-blue-600 hover:bg-blue-50 p-1 rounded"
            title="New Session"
          >
            <Plus size={16} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {!conversations ? (
                <div className="text-xs text-slate-400 p-2">Loading...</div>
            ) : conversations.length === 0 ? (
                <div className="text-xs text-slate-400 p-2">No history yet</div>
            ) : (
                conversations.map((c: any) => (
                    <button
                        key={c._id}
                        onClick={() => setActiveConversationId(c._id)}
                        className={`w-full text-left px-3 py-2 rounded-md text-xs transition-colors ${
                            activeConversationId === c._id
                            ? "bg-blue-50 text-blue-700 font-medium"
                            : "text-slate-600 hover:bg-slate-50"
                        }`}
                    >
                        {c.title}
                        <div className="text-[10px] text-slate-400 mt-0.5">
                            {new Date(c.updatedAt).toLocaleDateString()}
                        </div>
                    </button>
                ))
            )}
        </div>
      </div>

      {/* Center: Chat */}
      <div className="flex-1 flex flex-col min-w-0">
         <AgentChat activeConversationId={activeConversationId} projectId={projectId} />
      </div>

      {/* Right: Skills Dock */}
      <div className="w-80 border-l border-slate-200 bg-white overflow-y-auto">
        <SkillsDock 
            projectId={projectId} 
            activeConversationId={activeConversationId}
            onEnsureConversation={handleEnsureConversation}
            selectedElementIds={selectedElementIds}
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