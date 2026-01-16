"use client";

import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import Link from "next/link";
import { DollarSign, Hammer, Calculator, TrendingUp } from "lucide-react";

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(amount);
}

function SummaryCard({ title, value, icon: Icon, colorClass }: any) {
  return (
    <div className="bg-white p-6 rounded-lg border shadow-sm flex items-center gap-4">
      <div className={`w-12 h-12 rounded-full flex items-center justify-center ${colorClass}`}>
        <Icon size={24} />
      </div>
      <div>
        <p className="text-sm font-medium text-gray-500">{title}</p>
        <p className="text-2xl font-bold text-gray-900">{formatCurrency(value)}</p>
      </div>
    </div>
  );
}

export default function GlobalAccountingPage() {
  const data = useQuery(api.accountingStudio.getGlobalSummary, {});

  return (
    <div className="p-8 max-w-[1600px] mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Studio Accounting</h1>
        <p className="text-gray-500">Financial overview across all active projects</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <SummaryCard 
          title="Planned Materials" 
          value={data?.global.plannedMaterialsTotal || 0} 
          icon={Calculator} 
          colorClass="bg-blue-100 text-blue-600"
        />
        <SummaryCard 
          title="Planned Labor" 
          value={data?.global.plannedLaborTotal || 0} 
          icon={Hammer} 
          colorClass="bg-orange-100 text-orange-600"
        />
        <SummaryCard 
          title="Direct Cost (Mat + Lab)" 
          value={data?.global.plannedCostTotal || 0} 
          icon={DollarSign} 
          colorClass="bg-gray-100 text-gray-600"
        />
        <SummaryCard 
          title="Total Sell (Forecast)" 
          value={data?.global.sellTotal || 0} 
          icon={TrendingUp} 
          colorClass="bg-green-100 text-green-600"
        />
      </div>

      {/* Projects Table */}
      <div className="bg-white border rounded-lg overflow-hidden shadow-sm">
        <div className="px-6 py-4 border-b">
          <h3 className="font-semibold text-gray-900">Project Financials</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-6 py-3 font-medium text-gray-500">Project</th>
                <th className="px-6 py-3 font-medium text-gray-500 text-right">Materials</th>
                <th className="px-6 py-3 font-medium text-gray-500 text-right">Labor</th>
                <th className="px-6 py-3 font-medium text-gray-500 text-right bg-gray-50/50">Direct Cost</th>
                <th className="px-6 py-3 font-medium text-gray-500 text-center">Margins</th>
                <th className="px-6 py-3 font-medium text-gray-500 text-right">Sell Total</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {data === undefined ? (
                <tr><td colSpan={6} className="px-6 py-8 text-center text-gray-500">Loading financials...</td></tr>
              ) : data.projects.length === 0 ? (
                <tr><td colSpan={6} className="px-6 py-8 text-center text-gray-500">No active projects found.</td></tr>
              ) : (
                data.projects.map((p) => (
                  <tr key={p.projectId} className="hover:bg-gray-50">
                    <td className="px-6 py-4 font-medium text-gray-900">
                      <Link href={`/projects/${p.projectId}/accounting`} className="hover:text-indigo-600">
                        <div className="font-medium">{p.projectName}</div>
                        <div className="text-xs text-gray-500 font-normal">{p.customerName}</div>
                      </Link>
                    </td>
                    <td className="px-6 py-4 text-right text-gray-600">{formatCurrency(p.materialsTotal)}</td>
                    <td className="px-6 py-4 text-right text-gray-600">{formatCurrency(p.laborTotal)}</td>
                    <td className="px-6 py-4 text-right font-medium text-gray-800 bg-gray-50/30">{formatCurrency(p.directCost)}</td>
                    <td className="px-6 py-4 text-center text-xs text-gray-500">
                      <div className="flex justify-center gap-2">
                        <span title="Overhead">O: {Math.round((p.overheadPct || 0) * 100)}%</span>
                        <span title="Risk">R: {Math.round((p.riskPct || 0) * 100)}%</span>
                        <span title="Profit">P: {Math.round((p.profitPct || 0) * 100)}%</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right font-bold text-green-700">{formatCurrency(p.sellTotal)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
