"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";
import { useMemo, useState } from "react";

type Props = {
  projectId: Id<"projects">;
  elementId: Id<"elements">;
  elementTitle: string;
};

type RunbookBundle = {
  runbook: any;
  items: any[];
  listItems: any[];
} | null;

export function ElementRunbookTemplatePanel({ projectId, elementId, elementTitle }: Props) {
  const activeTemplate = useQuery(api.runbooks.getActiveTemplateForElement, {
    projectId,
    elementId,
  }) as RunbookBundle;

  const templates = useQuery(api.runbooks.listForProject, {
    projectId,
    scope: "element",
    elementId,
  }) as any[] | undefined;

  const conversations = useQuery(api.skills.runner.listAgentConversations, { projectId });
  const createConversation = useMutation(api.skills.runner.createAgentConversation);
  const runSkill = useAction(api.skills.runner.runSkill);

  const createFromRunbookBlock = useMutation(api.runbooks.createFromRunbookBlock);
  const setActiveElementTemplate = useMutation(api.runbooks.setActiveElementTemplate);

  const [draftRunbookBlock, setDraftRunbookBlock] = useState<any | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const active = activeTemplate?.runbook ?? null;

  const phases = useMemo(() => {
    const items = activeTemplate?.items ?? [];
    const byPhase = new Map<string, { phaseNameHe: string; phaseOrder: number; items: any[] }>();

    for (const item of items) {
      const phaseId = item.phaseId as string;
      const existing = byPhase.get(phaseId);
      if (existing) {
        existing.items.push(item);
      } else {
        byPhase.set(phaseId, {
          phaseNameHe: item.phaseNameHe ?? "",
          phaseOrder: item.phaseOrder ?? 0,
          items: [item],
        });
      }
    }

    return Array.from(byPhase.values())
      .map((p) => ({
        ...p,
        items: [...p.items].sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0)),
      }))
      .sort((a, b) => a.phaseOrder - b.phaseOrder);
  }, [activeTemplate?.items]);

  const listsByType = useMemo(() => {
    const listItems = activeTemplate?.listItems ?? [];
    const map = new Map<string, any[]>();
    for (const li of listItems) {
      const type = li.listType as string;
      const existing = map.get(type) ?? [];
      existing.push(li);
      map.set(type, existing);
    }

    for (const [k, v] of map.entries()) {
      map.set(k, v.sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0)));
    }

    return map;
  }, [activeTemplate?.listItems]);

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      let conversationId = conversations?.[0]?._id as Id<"agentConversations"> | undefined;
      if (!conversationId) {
        conversationId = (await createConversation({
          projectId,
          title: `Element Template: ${elementTitle}`,
        })) as Id<"agentConversations">;
      }

      const blocks = await runSkill({
        projectId,
        conversationId,
        skillId: "INSTALL_RUNBOOK_BUILDER",
        params: { source: "element_template", elementId },
      });

      const runbookBlock = Array.isArray(blocks)
        ? blocks.find((b: any) => b?.type === "RunbookBlock")
        : null;

      if (!runbookBlock) {
        alert("No RunbookBlock returned from skill.");
        return;
      }

      setDraftRunbookBlock(runbookBlock);
    } catch (e: any) {
      console.error(e);
      alert(e?.message ?? "Failed to generate template");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSaveDraftAsTemplate = async () => {
    if (!draftRunbookBlock) return;

    setIsSaving(true);
    try {
      const { runbookId } = await createFromRunbookBlock({
        projectId,
        scope: "element",
        elementId,
        runbookBlock: draftRunbookBlock,
        source: "ai",
      });

      await setActiveElementTemplate({ projectId, elementId, runbookId });
      setDraftRunbookBlock(null);
    } catch (e: any) {
      console.error(e);
      alert(e?.message ?? "Failed to save template");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSetActive = async (runbookId: Id<"runbooks">) => {
    try {
      await setActiveElementTemplate({ projectId, elementId, runbookId });
    } catch (e: any) {
      console.error(e);
      alert(e?.message ?? "Failed to set active template");
    }
  };

  const handlePrint = () => {
    if (!activeTemplate?.runbook) return;
    const content = document.getElementById("element-runbook-template-print")?.innerHTML;
    if (!content) return;

    const w = window.open("", "_blank");
    if (!w) return;

    w.document.write(`<!doctype html><html><head><title>${activeTemplate.runbook.titleHe ?? "Runbook"}</title></head><body>${content}</body></html>`);
    w.document.close();
    w.focus();
    w.print();
  };

  return (
    <div className="space-y-4" id="element-runbook-template-print">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-gray-900">Install Runbook Template</div>
          <div className="text-xs text-gray-500">
            {active ? `${active.titleHe ?? "Template"} (v${active.version ?? "-"})` : "No active template"}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleGenerate}
            disabled={isGenerating}
            className="px-3 py-2 text-xs font-semibold rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-50"
          >
            {isGenerating ? "Generating…" : "Generate Template"}
          </button>

          <button
            onClick={handleSaveDraftAsTemplate}
            disabled={!draftRunbookBlock || isSaving}
            className="px-3 py-2 text-xs font-semibold rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-50"
          >
            {isSaving ? "Saving…" : "Save Template"}
          </button>

          <button
            onClick={handlePrint}
            disabled={!active}
            className="px-3 py-2 text-xs font-semibold rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-50"
          >
            Print / Export
          </button>
        </div>
      </div>

      {draftRunbookBlock && (
        <div className="rounded-lg border border-blue-200 bg-blue-50/40 p-3 text-xs text-blue-900">
          Draft generated. Click “Save Template” to persist it on this element.
        </div>
      )}

      {!active && (
        <div className="rounded-lg border border-gray-100 bg-gray-50 p-4 text-sm text-gray-600">
          Generate a template to store reusable install instructions for this element.
        </div>
      )}

      {active && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 space-y-3">
            {phases.map((phase, idx) => (
              <div key={`${phase.phaseNameHe}-${idx}`} className="rounded-lg border border-gray-100 bg-white p-4">
                <div className="text-xs font-semibold text-gray-900 mb-2">{phase.phaseNameHe}</div>
                <div className="space-y-1">
                  {phase.items.map((item) => (
                    <div key={item._id} className="text-sm text-gray-800">
                      - {item.textHe}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="space-y-3">
            <MiniList title="Bring List" items={listsByType.get("bringList") ?? []} />
            <MiniList title="Safety" items={listsByType.get("safety") ?? []} />
            <MiniList title="Checkpoints" items={listsByType.get("checkpoints") ?? []} />
            <MiniList title="Quick Fix Kit" items={listsByType.get("quickFixKit") ?? []} />
            <MiniAssumptions items={listsByType.get("assumptions") ?? []} />
          </div>
        </div>
      )}

      {templates && templates.length > 1 && (
        <div className="rounded-lg border border-gray-100 bg-white p-4">
          <div className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Versions</div>
          <div className="space-y-2">
            {templates.slice(0, 10).map((t) => {
              const isActive = active && t._id === active._id;
              return (
                <div key={t._id} className="flex items-center justify-between gap-3 text-sm">
                  <div className="min-w-0">
                    <div className="font-medium text-gray-900 truncate">{t.titleHe}</div>
                    <div className="text-xs text-gray-500">v{t.version} • {t.status}</div>
                  </div>
                  <button
                    onClick={() => handleSetActive(t._id)}
                    disabled={isActive}
                    className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-50"
                  >
                    {isActive ? "Active" : "Set Active"}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function MiniList({ title, items }: { title: string; items: any[] }) {
  if (!items.length) return null;
  return (
    <div className="rounded-lg border border-gray-100 bg-white p-4">
      <div className="text-xs font-semibold text-gray-900 mb-2">{title}</div>
      <div className="space-y-1">
        {items.map((item) => (
          <div key={item._id} className="text-sm text-gray-800">- {item.textHe}</div>
        ))}
      </div>
    </div>
  );
}

function MiniAssumptions({ items }: { items: any[] }) {
  if (!items.length) return null;
  return (
    <div className="rounded-lg border border-yellow-200 bg-yellow-50/40 p-4">
      <div className="text-xs font-semibold text-gray-900 mb-2">Assumptions</div>
      <div className="space-y-1">
        {items.map((item) => (
          <div key={item._id} className="text-sm text-gray-900">- {item.textHe}</div>
        ))}
      </div>
    </div>
  );
}
