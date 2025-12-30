"use client";

import { useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";
import { use } from "react";
import { AlertTriangle, Layers, Wallet, ClipboardCheck } from "lucide-react";

export default function OverviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const projectId = id as Id<"projects">;
  const overview = useQuery(api.projects.getOverview, { id: projectId });

  if (!overview) {
    return <div className="p-8 text-gray-500">Loading overview...</div>;
  }

  const baselineSell = Number(overview.baseline?.totals?.grandTotal ?? 0);
  const approvedCO = Number(overview.approvedCO?.sellPrice ?? 0);
  const effectiveBudget = baselineSell + approvedCO;

  return (
    <div className="p-8 max-w-6xl mx-auto text-black">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-3xl font-bold">{overview.project.name}</h2>
          <p className="text-sm text-gray-500 mt-1">
            Status: <span className="font-medium text-gray-700">{overview.project.status}</span>
          </p>
        </div>
        <div className="px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider bg-gray-100 text-gray-600">
          {overview.project.currency}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-10">
        <StatCard
          title="Elements"
          value={overview.counts.elementCount}
          icon={Layers}
        />
        <StatCard
          title="Graveyard"
          value={overview.counts.graveyardCount}
          icon={AlertTriangle}
        />
        <StatCard
          title="Baseline"
          value={formatMoney(baselineSell, overview.project.currency)}
          icon={ClipboardCheck}
        />
        <StatCard
          title="Effective Budget"
          value={formatMoney(effectiveBudget, overview.project.currency)}
          icon={Wallet}
        />
      </div>

      <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
          <h3 className="font-semibold text-gray-900">Elements</h3>
          <span className="text-xs text-gray-400">
            {overview.counts.elementCount} total
          </span>
        </div>
        <div className="divide-y">
          {overview.elements.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              No elements yet. Use Studio Agent to create the first element.
            </div>
          ) : (
            overview.elements.map((element) => (
              <div key={element.id} className="p-6 flex items-center justify-between">
                <div>
                  <div className="font-semibold text-gray-900">{element.title}</div>
                  <div className="text-xs text-gray-500 mt-1">
                    {element.type} · {element.status}
                  </div>
                </div>
                <div className="text-xs text-gray-400">
                  Updated {new Date(element.updatedAt).toLocaleDateString()}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({
  title,
  value,
  icon: Icon,
}: {
  title: string;
  value: number | string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}) {
  return (
    <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-gray-100 text-gray-700">
          <Icon size={18} />
        </div>
        <div className="text-xs font-semibold uppercase tracking-wider text-gray-400">
          {title}
        </div>
      </div>
      <div className="mt-4 text-2xl font-bold text-gray-900">{value}</div>
    </div>
  );
}

function formatMoney(value: number, currency: string) {
  if (!Number.isFinite(value)) return "--";
  return `${value.toLocaleString()} ${currency}`;
}
