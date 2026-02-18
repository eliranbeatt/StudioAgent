'use client';

import { useQuery } from 'convex/react';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { api } from '../../../../../convex/_generated/api';
import { ProjectPlanningTab } from './_components/ProjectPlanningTab';
import { AgentTab } from './_components/AgentTab';

export default function SdkAgentPage() {
  const params = useParams();
  const rawId = params.id as string;
  const resolved = useQuery(api.projects.resolveProjectId, { id: rawId });
  const projectId = resolved?.projectId ?? null;

  const featureFlags = useQuery(api.featureFlags.getAll);
  const isEnabled = featureFlags?.ff_sdk_agent_tab;

  const [activeTab, setActiveTab] = useState<'planning' | 'agent'>('agent');

  if (!isEnabled) {
    return (
      <div className="flex items-center justify-center h-full bg-slate-50">
        <div className="p-8 bg-white rounded-lg shadow-sm border border-slate-200">
          <h2 className="text-lg font-semibold text-slate-700 mb-2">Agent Tab</h2>
          <p className="text-slate-600">This feature is currently disabled via Feature Flags.</p>
          <p className="text-xs text-slate-400 mt-2">Enable ff_sdk_agent_tab to access this feature.</p>
        </div>
      </div>
    );
  }

  if (!projectId) {
    return (
      <div className="flex items-center justify-center h-full bg-slate-50">
        <div className="p-8 text-slate-400">
          <div className="w-8 h-8 rounded-full border-2 border-slate-200 border-t-blue-600 animate-spin mb-4 mx-auto" />
          Loading project...
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* Tab Navigation */}
      <div className="flex border-b border-slate-200 bg-white px-6 shadow-sm">
        <button
          onClick={() => setActiveTab('planning')}
          className={`px-6 py-4 text-sm font-semibold border-b-2 transition-all relative ${
            activeTab === 'planning'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-600 hover:text-slate-800 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center gap-2">
            <span className="text-lg">📋</span>
            <span>Project Planning</span>
          </div>
          {activeTab === 'planning' && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />
          )}
        </button>
        <button
          onClick={() => setActiveTab('agent')}
          className={`px-6 py-4 text-sm font-semibold border-b-2 transition-all relative ${
            activeTab === 'agent'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-600 hover:text-slate-800 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center gap-2">
            <span className="text-lg">🤖</span>
            <span>Agent</span>
          </div>
          {activeTab === 'agent' && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />
          )}
        </button>
      </div>

      {/* Tab Description Bar */}
      <div className="bg-slate-100 border-b border-slate-200 px-6 py-3">
        {activeTab === 'planning' ? (
          <div className="text-xs text-slate-600">
            <span className="font-semibold">Structured Planning Flow:</span> Context check → brain dump → questions → finalize → validation → report
          </div>
        ) : (
          <div className="text-xs text-slate-600">
            <span className="font-semibold">Conversational Agent:</span> Dynamic orchestrator that selects tools based on your requests
          </div>
        )}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'planning' ? (
          <ProjectPlanningTab projectId={projectId} />
        ) : (
          <AgentTab projectId={projectId} />
        )}
      </div>
    </div>
  );
}
