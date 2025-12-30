"use client";

import { useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";
import { DollarSign, TrendingUp, ShieldAlert, FileCheck } from "lucide-react";

export default function AccountingPage({ params }: { params: { id: string } }) {
  const projectId = params.id as Id<"projects">;
  const summary = useQuery(api.financials.getFinancialSummary, { projectId });

  if (!summary) return <div className="p-8">Loading accounting data...</div>;

  const stats = [
    { label: "Baseline Planned", value: summary.baseline.grandTotal, icon: FileCheck, color: "text-blue-600" },
    { label: "Approved COs", value: summary.approvedCO.sellPrice, icon: TrendingUp, color: "text-green-600" },
    { label: "Effective Budget", value: summary.effectiveBudget.sellPrice, icon: DollarSign, color: "text-purple-600" },
    { label: "Internal Variance", value: 0, icon: ShieldAlert, color: "text-amber-600" },
  ];

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-gray-900">Project Financials</h2>
          <p className="text-gray-500 text-sm mt-1">Real-time budget tracking and cost analysis</p>
        </div>
        <div className="px-3 py-1 bg-gray-100 text-gray-600 rounded-lg text-xs font-mono">
          Last reconciled updates only
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-12">
        {stats.map((stat) => (
          <div key={stat.label} className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-all">
            <div className="flex items-center gap-3 mb-4">
              <div className={`p-2 rounded-lg bg-gray-50 ${stat.color.replace('text-', 'text-opacity-80 text-')}`}>
                <stat.icon size={20} className={stat.color} />
              </div>
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">{stat.label}</span>
            </div>
            <div className="text-3xl font-bold text-gray-900">
              {stat.value.toLocaleString()} <span className="text-lg text-gray-400 font-normal">₪</span>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white border border-gray-100 rounded-xl overflow-hidden shadow-sm">
          <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
            <span className="font-bold text-gray-900 text-sm">Cost Breakdown (Forecast)</span>
            <TrendingUp size={16} className="text-gray-400" />
          </div>
          <div className="p-6">
            <div className="space-y-4">
              <div className="flex justify-between items-center text-sm group cursor-pointer hover:bg-gray-50 p-2 rounded transition-colors">
                <span className="text-gray-600 font-medium">Direct Materials</span>
                <span className="font-mono text-gray-900">-- ₪</span>
              </div>
              <div className="flex justify-between items-center text-sm group cursor-pointer hover:bg-gray-50 p-2 rounded transition-colors">
                <span className="text-gray-600 font-medium">Labor & Production</span>
                <span className="font-mono text-gray-900">-- ₪</span>
              </div>
              <div className="flex justify-between items-center text-sm group cursor-pointer hover:bg-gray-50 p-2 rounded transition-colors">
                <span className="text-gray-600 font-medium">Subcontractors</span>
                <span className="font-mono text-gray-900">-- ₪</span>
              </div>
              <div className="h-px bg-gray-100 my-2" />
              <div className="flex justify-between items-center font-bold text-gray-900 p-2">
                <span>Total Direct Cost</span>
                <span className="font-mono text-lg">{summary.effectiveBudget.directCost.toLocaleString()} ₪</span>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white border border-gray-100 rounded-xl overflow-hidden shadow-sm">
          <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
            <span className="font-bold text-gray-900 text-sm">Margin & Profit Analysis</span>
            <DollarSign size={16} className="text-gray-400" />
          </div>
          <div className="p-6">
            <div className="space-y-4">
              <div className="flex justify-between items-center text-sm p-2">
                <span className="text-gray-600 font-medium">Total Direct Cost</span>
                <span className="font-mono text-gray-900">{summary.effectiveBudget.directCost.toLocaleString()} ₪</span>
              </div>
              <div className="flex justify-between items-center text-sm p-2">
                <span className="text-gray-600 font-medium">Overhead & Risk</span>
                <span className="font-mono text-gray-900">{(summary.effectiveBudget.sellPrice - summary.effectiveBudget.directCost).toLocaleString()} ₪</span>
              </div>
              <div className="h-px bg-gray-100 my-2" />
              <div className="flex justify-between items-center font-bold p-2 bg-gray-50 rounded-lg border border-gray-100">
                <span className="text-indigo-600">Effective Sell Price</span>
                <span className="font-mono text-lg text-gray-900">{summary.effectiveBudget.sellPrice.toLocaleString()} ₪</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}