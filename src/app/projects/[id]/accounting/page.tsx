"use client";

import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
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
    <div className="p-8 max-w-6xl mx-auto">
      <h2 className="text-2xl font-bold mb-8 text-black">Project Financials</h2>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-12 text-black">
        {stats.map((stat) => (
          <div key={stat.label} className="bg-white p-6 rounded-xl border shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <stat.icon size={18} className={stat.color} />
              <span className="text-sm font-medium text-gray-500">{stat.label}</span>
            </div>
            <div className="text-2xl font-bold">
               {stat.value.toLocaleString()} ₪
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white border rounded-xl overflow-hidden shadow-sm">
            <div className="p-4 bg-gray-50 border-b font-bold text-black">Cost Breakdown (Forecast)</div>
            <div className="p-6">
                <div className="space-y-4">
                    <div className="flex justify-between items-center text-black">
                        <span className="text-gray-600">Direct Materials</span>
                        <span className="font-mono">-- ₪</span>
                    </div>
                    <div className="flex justify-between items-center text-black">
                        <span className="text-gray-600">Labor & Production</span>
                        <span className="font-mono">-- ₪</span>
                    </div>
                    <div className="flex justify-between items-center text-black">
                        <span className="text-gray-600">Subcontractors</span>
                        <span className="font-mono">-- ₪</span>
                    </div>
                    <div className="h-px bg-gray-100 my-2" />
                    <div className="flex justify-between items-center font-bold text-black">
                        <span>Total Direct Cost</span>
                        <span className="font-mono">{summary.effectiveBudget.directCost.toLocaleString()} ₪</span>
                    </div>
                </div>
            </div>
        </div>

        <div className="bg-white border rounded-xl overflow-hidden shadow-sm">
            <div className="p-4 bg-gray-50 border-b font-bold text-black">Margin & Profit Analysis</div>
             <div className="p-6">
                <div className="space-y-4">
                    <div className="flex justify-between items-center text-black">
                        <span className="text-gray-600">Total Direct Cost</span>
                        <span className="font-mono">{summary.effectiveBudget.directCost.toLocaleString()} ₪</span>
                    </div>
                    <div className="flex justify-between items-center text-black">
                        <span className="text-gray-600">Overhead & Risk</span>
                        <span className="font-mono">{(summary.effectiveBudget.sellPrice - summary.effectiveBudget.directCost).toLocaleString()} ₪</span>
                    </div>
                    <div className="h-px bg-gray-100 my-2" />
                    <div className="flex justify-between items-center font-bold text-black">
                        <span className="text-purple-700">Effective Sell Price</span>
                        <span className="font-mono">{summary.effectiveBudget.sellPrice.toLocaleString()} ₪</span>
                    </div>
                </div>
            </div>
        </div>
      </div>
    </div>
  );
}