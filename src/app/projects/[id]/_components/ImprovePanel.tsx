"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import { useState, useMemo } from "react";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";
import {
    BrainCircuit,
    Check,
    ChevronDown,
    ChevronRight,
    Loader2,
    Sparkles,
    X,
    Zap
} from "lucide-react";

type ImprovePanelProps = {
    open: boolean;
    onClose: () => void;
    projectId: Id<"projects">;
    currentTabContext?: string; // e.g. "tasks", "elements"
};

type RunStep = "config" | "running" | "results";

const SCOPES = [
    { id: "tasks", label: "Tasks" },
    { id: "accounting", label: "Accounting" },
    { id: "elements", label: "Elements" },
    { id: "project", label: "Project Wide" },
];

const MODULES = [
    { id: "critique", label: "Critique & Logic" },
    { id: "risks", label: "Risk Analysis" },
    { id: "gaps", label: "Gap Detection" },
    { id: "assumptions", label: "Assumptions Check" },
    { id: "links", label: "Web Search" },
    { id: "images", label: "Generate Images" },
];

export default function ImprovePanel({
    open,
    onClose,
    projectId,
    currentTabContext = "tasks"
}: ImprovePanelProps) {
    const [step, setStep] = useState<RunStep>("config");
    const [scope, setScope] = useState<string>(currentTabContext);
    const [selectedModules, setSelectedModules] = useState<string[]>(["critique", "risks", "gaps"]);
    const [allowWeb, setAllowWeb] = useState(false);
    const [createImages, setCreateImages] = useState(false);
    const [modelPreset, setModelPreset] = useState("gpt-5-nano"); // default fast
    const [resultChangeSetId, setResultChangeSetId] = useState<Id<"changeSets"> | null>(null);

    const runAgent = useAction(api.agent_improve.runImproveAgent);
    const applyGroups = useMutation(api.changeSets.applyChangeGroups);

    // Fetch result if available
    const changeSet = useQuery(api.changeSets.get, resultChangeSetId ? { id: resultChangeSetId } : "skip");

    const [appliedGroupIds, setAppliedGroupIds] = useState<string[]>([]);
    const [applying, setApplying] = useState(false);

    const handleRun = async () => {
        setStep("running");
        try {
            const res = await runAgent({
                projectId,
                scope,
                runConfig: {
                    modelPreset,
                    allowWeb,
                    createImages,
                    selectedModules,
                    tabContext: currentTabContext
                }
            });
            if (res.changeSetId) {
                setResultChangeSetId(res.changeSetId);
                setStep("results");
            }
        } catch (e) {
            console.error(e);
            setStep("config"); // Reset on error
            // TODO: Show error toast
        }
    };

    const handleApplyGroup = async (groupId: string) => {
        if (!resultChangeSetId) return;
        setApplying(true);
        try {
            await applyGroups({
                changeSetId: resultChangeSetId,
                groupIds: [groupId]
            });
            setAppliedGroupIds(prev => [...prev, groupId]);
        } finally {
            setApplying(false);
        }
    };

    const handleApplyAll = async () => {
        if (!resultChangeSetId || !changeSet?.changeGroups) return;
        setApplying(true);
        try {
            const allIds = changeSet.changeGroups.map((g: any) => g.id);
            await applyGroups({
                changeSetId: resultChangeSetId,
                groupIds: allIds
            });
            setAppliedGroupIds(allIds);
        } finally {
            setApplying(false);
        }
    };

    // Render Helpers
    const renderConfig = () => (
        <div className="space-y-6">
            <div className="space-y-3">
                <label className="text-xs font-semibold uppercase tracking-wider text-gray-500">Preset Strategy</label>
                <div className="grid grid-cols-3 gap-2">
                    <button
                        onClick={() => { setModelPreset("gpt-5-nano"); setSelectedModules(["gaps"]); setAllowWeb(false); }}
                        className={`p-3 rounded-lg border text-left transition-all ${modelPreset === "gpt-5-nano" ? "border-blue-500 bg-blue-50 ring-1 ring-blue-500" : "border-gray-200 hover:border-blue-300"}`}
                    >
                        <div className="flex items-center gap-2 mb-1">
                            <Zap size={16} className="text-amber-500" />
                            <span className="font-semibold text-sm">Quick Fix</span>
                        </div>
                        <p className="text-[10px] text-gray-500 leading-tight">Fast scan for obvious gaps and missing fields.</p>
                    </button>

                    <button
                        onClick={() => { setModelPreset("gpt-5.2"); setSelectedModules(["critique", "risks", "gaps"]); setAllowWeb(false); }}
                        className={`p-3 rounded-lg border text-left transition-all ${modelPreset === "gpt-5.2" ? "border-blue-500 bg-blue-50 ring-1 ring-blue-500" : "border-gray-200 hover:border-blue-300"}`}
                    >
                        <div className="flex items-center gap-2 mb-1">
                            <BrainCircuit size={16} className="text-blue-600" />
                            <span className="font-semibold text-sm">Deep Improve</span>
                        </div>
                        <p className="text-[10px] text-gray-500 leading-tight">Detailed critique, risk analysis and logic checks.</p>
                    </button>

                    <button
                        onClick={() => { setModelPreset("gpt-5.2-thinking-high"); setSelectedModules(MODULES.map(m => m.id)); setAllowWeb(true); }}
                        className={`p-3 rounded-lg border text-left transition-all ${modelPreset === "gpt-5.2-thinking-high" ? "border-purple-500 bg-purple-50 ring-1 ring-purple-500" : "border-gray-200 hover:border-purple-300"}`}
                    >
                        <div className="flex items-center gap-2 mb-1">
                            <Sparkles size={16} className="text-purple-600" />
                            <span className="font-semibold text-sm">Finalize Plan</span>
                        </div>
                        <p className="text-[10px] text-gray-500 leading-tight">Exhaustive reasoning, web research, and validation.</p>
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-6">
                <div className="space-y-3">
                    <label className="text-xs font-semibold uppercase tracking-wider text-gray-500">Scope</label>
                    <div className="space-y-2">
                        {SCOPES.map(s => (
                            <label key={s.id} className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="radio"
                                    name="scope"
                                    value={s.id}
                                    checked={scope === s.id}
                                    onChange={(e) => setScope(e.target.value)}
                                    className="w-4 h-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                                />
                                <span className="text-sm text-gray-700">{s.label}</span>
                            </label>
                        ))}
                    </div>
                </div>

                <div className="space-y-3">
                    <label className="text-xs font-semibold uppercase tracking-wider text-gray-500">Modules</label>
                    <div className="grid grid-cols-1 gap-2">
                        {MODULES.map(m => {
                            const isChecked = selectedModules.includes(m.id);
                            if (m.id === "links") {
                                return (
                                    <label key={m.id} className="flex items-center gap-2 cursor-pointer">
                                        <input type="checkbox" checked={allowWeb} onChange={e => setAllowWeb(e.target.checked)} className="rounded border-gray-300 text-blue-600" />
                                        <span className="text-sm text-gray-700">{m.label}</span>
                                    </label>
                                );
                            }
                            if (m.id === "images") {
                                return (
                                    <label key={m.id} className="flex items-center gap-2 cursor-pointer">
                                        <input type="checkbox" checked={createImages} onChange={e => setCreateImages(e.target.checked)} className="rounded border-gray-300 text-blue-600" />
                                        <span className="text-sm text-gray-700">{m.label}</span>
                                    </label>
                                );
                            }
                            return (
                                <label key={m.id} className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={isChecked}
                                        onChange={e => {
                                            if (e.target.checked) setSelectedModules([...selectedModules, m.id]);
                                            else setSelectedModules(selectedModules.filter(x => x !== m.id));
                                        }}
                                        className="rounded border-gray-300 text-blue-600"
                                    />
                                    <span className="text-sm text-gray-700">{m.label}</span>
                                </label>
                            );
                        })}
                    </div>
                </div>
            </div>

            <div className="pt-4 border-t border-gray-100 flex justify-end">
                <button
                    onClick={handleRun}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-lg font-semibold shadow-sm flex items-center gap-2 transition-transform active:scale-95"
                >
                    <Sparkles size={18} />
                    Start Improvement Run
                </button>
            </div>
        </div>
    );

    const renderRunning = () => (
        <div className="flex flex-col items-center justify-center p-12 space-y-4">
            <Loader2 size={48} className="animate-spin text-blue-600" />
            <div className="text-center">
                <h3 className="text-lg font-semibold text-gray-900">AI is thinking...</h3>
                <p className="text-sm text-gray-500">Analyzing project data, reasoning, and generating improvements.</p>
                <p className="text-xs text-gray-400 mt-2">This may take up to 60 seconds.</p>
            </div>
        </div>
    );

    const renderResults = () => {
        if (!changeSet) return <div className="text-center p-8">Loading results...</div>;

        // De-structure result data
        const report = changeSet.report_he || {};
        const gaps = changeSet.gaps || {};
        const groups = changeSet.changeGroups || [];
        const links = changeSet.links || [];

        const appliedSet = new Set([...(changeSet.appliedGroupIds ?? []), ...appliedGroupIds]);

        return (
            <div className="space-y-6 h-full flex flex-col">
                {/* Header Summary */}
                <div className="flex items-start gap-4 p-4 bg-slate-50 rounded-lg border border-slate-200">
                    <div className="flex-1 space-y-2">
                        <h3 className="font-bold text-gray-900 flex items-center gap-2">
                            <Zap size={16} className="text-yellow-500" />
                            Analysis Report
                        </h3>
                        <ul className="text-sm text-gray-700 list-disc list-inside space-y-1">
                            {(report.whatIWouldChange ?? []).slice(0, 3).map((item: string, i: number) => (
                                <li key={i}>{item}</li>
                            ))}
                        </ul>
                        {report.risks?.length > 0 && (
                            <div className="mt-2 text-xs text-red-600 bg-red-50 p-2 rounded border border-red-100">
                                <strong>Risks:</strong> {report.risks.join(", ")}
                            </div>
                        )}
                    </div>

                    <div className="w-64 space-y-2 text-xs">
                        {gaps.counts && Object.entries(gaps.counts).map(([k, v]) => (
                            <div key={k} className="flex justify-between border-b pb-1 last:border-0">
                                <span className="text-gray-500">{k.replace(/([A-Z])/g, ' $1').trim()}</span>
                                <span className="font-mono font-bold">{v as number}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Change Groups */}
                <div className="flex-1 overflow-y-auto space-y-4 pr-2">
                    <h4 className="text-sm font-semibold uppercase tracking-wider text-gray-500">Proposed Improvements</h4>
                    {groups.length === 0 ? (
                        <div className="text-center py-8 text-gray-400">No changes proposed.</div>
                    ) : groups.map((group: any) => {
                        const isApplied = appliedSet.has(group.id);
                        return (
                            <div key={group.id} className={`border rounded-lg p-4 transition-all ${isApplied ? "bg-green-50 border-green-200 opacity-75" : "bg-white border-blue-100 hover:border-blue-300"}`}>
                                <div className="flex items-start justify-between gap-4">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2">
                                            <h5 className="font-bold text-gray-900">{group.title_he}</h5>
                                            {group.riskLevel === "high" && <span className="bg-red-100 text-red-700 text-[10px] px-1.5 py-0.5 rounded uppercase font-bold">High Risk</span>}
                                        </div>
                                        <p className="text-sm text-gray-600 mt-1">{group.rationale_he}</p>
                                        <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-gray-400">
                                            <span className="bg-gray-100 px-2 py-1 rounded">{group.operations?.length ?? 0} Ops</span>
                                            <span className="bg-gray-100 px-2 py-1 rounded">Scope: {group.scope}</span>
                                        </div>
                                    </div>

                                    <button
                                        onClick={() => handleApplyGroup(group.id)}
                                        disabled={isApplied || applying}
                                        className={`px-4 py-2 rounded-lg font-semibold text-xs flex items-center gap-1.5 transition-colors ${isApplied
                                                ? "bg-green-100 text-green-700 cursor-default"
                                                : "bg-blue-600 text-white hover:bg-blue-700 shadow-sm"
                                            }`}
                                    >
                                        {isApplied ? <><Check size={14} /> Applied</> : "Apply"}
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Footer Actions */}
                <div className="pt-4 border-t border-gray-100 flex justify-between items-center bg-white sticky bottom-0">
                    <button onClick={() => setStep("config")} className="text-sm text-gray-500 hover:text-gray-900 underline">
                        Start Over
                    </button>
                    <div className="flex gap-3">
                        <button onClick={onClose} className="text-gray-600 px-4 py-2 rounded hover:bg-gray-100">Close</button>
                        <button
                            onClick={handleApplyAll}
                            disabled={applying || groups.every((g: any) => appliedSet.has(g.id))}
                            className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg font-semibold shadow flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <Check size={16} /> Apply All Remaining
                        </button>
                    </div>
                </div>
            </div>
        );
    };

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 sm:p-6">
            <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity" onClick={onClose} />

            <div className="relative bg-white w-full max-w-4xl h-[85vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-white shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center shadow-md">
                            <BrainCircuit size={20} />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-gray-900 tracking-tight">AI Thinking Improver</h2>
                            <p className="text-xs text-gray-500">Autonomous optimization & reasoning engine</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
                        <X size={20} />
                    </button>
                </div>

                <div className="flex-1 overflow-auto p-6 bg-white safe-area-bottom">
                    {step === "config" && renderConfig()}
                    {step === "running" && renderRunning()}
                    {step === "results" && renderResults()}
                </div>
            </div>
        </div>
    );
}
