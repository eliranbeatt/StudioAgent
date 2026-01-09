import { LayoutGrid, ChevronRight } from "lucide-react";
import Link from "next/link";
import { Id } from "../../../../../convex/_generated/dataModel";

interface ElementBreakdownTableProps {
    projectId: Id<"projects">;
    accounting: any;
    margins: {
        riskPct: number;
        overheadPct: number;
        profitPct: number;
    };
}

export function ElementBreakdownTable({
    projectId,
    accounting,
    margins
}: ElementBreakdownTableProps) {
    if (!accounting?.elements) return null;

    return (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                    <thead className="text-xs text-gray-500 bg-gray-50/75 uppercase tracking-wider border-b border-gray-200">
                        <tr>
                            <th className="px-6 py-4 font-semibold text-gray-900">Element</th>
                            <th className="px-4 py-4 font-medium text-right">Materials</th>
                            <th className="px-4 py-4 font-medium text-right">Labor</th>
                            <th className="px-4 py-4 font-normal text-right text-gray-500">
                                Risk <span className="text-gray-400 text-[10px] ml-0.5">{Math.round(margins.riskPct * 100)}%</span>
                            </th>
                            <th className="px-4 py-4 font-normal text-right text-gray-500">
                                Overhead <span className="text-gray-400 text-[10px] ml-0.5">{Math.round(margins.overheadPct * 100)}%</span>
                            </th>
                            <th className="px-4 py-4 font-normal text-right text-gray-500">
                                Profit <span className="text-gray-400 text-[10px] ml-0.5">{Math.round(margins.profitPct * 100)}%</span>
                            </th>
                            <th className="px-6 py-4 font-bold text-right text-gray-900 bg-gray-50/30">Total (Customer)</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {accounting.elements.map((element: any) => (
                            <ElementRow
                                key={element.elementId}
                                projectId={projectId}
                                title={element.title}
                                materials={element.totals.materials}
                                labor={element.totals.labor}
                                margins={margins}
                                elementId={element.elementId}
                            />
                        ))}

                        {accounting.projectCosts && (
                            <ElementRow
                                projectId={projectId}
                                title="Project Level Costs"
                                subtitle="Global overhead logic"
                                materials={accounting.projectCosts.totals.materials}
                                labor={accounting.projectCosts.totals.labor}
                                margins={margins}
                                elementId="GLOBAL"
                                isGlobal
                            />
                        )}
                    </tbody>
                </table>
            </div>

            <div className="p-4 bg-gray-50 border-t border-gray-200 text-center">
                <p className="text-xs text-gray-400 mb-2">Rows expand to show breakdown (coming next)</p>
            </div>
        </div>
    );
}

function ElementRow({
    projectId,
    title,
    subtitle,
    materials,
    labor,
    margins,
    elementId,
    isGlobal
}: {
    projectId: string;
    title: string;
    subtitle?: string;
    materials: number;
    labor: number;
    margins: { riskPct: number, overheadPct: number, profitPct: number };
    elementId: string;
    isGlobal?: boolean;
}) {
    const base = materials + labor;
    const risk = base * margins.riskPct;
    const overhead = base * margins.overheadPct;
    const profit = base * margins.profitPct; // New non-compounding formula
    const total = base + risk + overhead + profit;

    return (
        <tr className="hover:bg-gray-50/50 transition-colors group">
            <td className="px-6 py-4">
                <div className="flex items-center gap-3">
                    <div className={`p-1.5 rounded-md ${isGlobal ? 'bg-indigo-50 text-indigo-600' : 'bg-gray-100 text-gray-500'}`}>
                        <LayoutGrid size={16} />
                    </div>
                    <div>
                        <div className="font-medium text-gray-900">{title}</div>
                        {subtitle && <div className="text-xs text-gray-400">{subtitle}</div>}
                    </div>
                </div>
            </td>
            <td className="px-4 py-4 text-right font-mono text-gray-700">{Math.round(materials).toLocaleString()}</td>
            <td className="px-4 py-4 text-right font-mono text-gray-700">{Math.round(labor).toLocaleString()}</td>
            <td className="px-4 py-4 text-right font-mono text-gray-500 text-xs">{Math.round(risk).toLocaleString()}</td>
            <td className="px-4 py-4 text-right font-mono text-gray-500 text-xs">{Math.round(overhead).toLocaleString()}</td>
            <td className="px-4 py-4 text-right font-mono text-gray-500 text-xs">{Math.round(profit).toLocaleString()}</td>
            <td className="px-6 py-4 text-right font-mono font-bold text-gray-900 bg-gray-50/30">
                {Math.round(total).toLocaleString()}
            </td>
        </tr>
    )
}
