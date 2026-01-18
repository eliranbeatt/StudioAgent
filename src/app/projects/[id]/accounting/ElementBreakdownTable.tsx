import { LayoutGrid, ChevronUp, ChevronDown } from "lucide-react";
import Link from "next/link";
import { Id } from "../../../../../convex/_generated/dataModel";
import { useState } from "react";

interface ElementBreakdownTableProps {
    projectId: Id<"projects">;
    accounting: any;
    margins: {
        riskPct: number;
        overheadPct: number;
        profitPct: number;
    };
}

type SortKey = "element" | "materials" | "labor" | "risk" | "overhead" | "profit" | "total";
type SortDirection = "asc" | "desc";

export function ElementBreakdownTable({
    projectId,
    accounting,
    margins
}: ElementBreakdownTableProps) {
    const [sortKey, setSortKey] = useState<SortKey>("element");
    const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

    if (!accounting?.elements) return null;

    const handleSort = (key: SortKey) => {
        if (sortKey === key) {
            setSortDirection(prev => prev === "asc" ? "desc" : "asc");
        } else {
            setSortKey(key);
            setSortDirection("asc");
        }
    };

    const sortedElements = [...accounting.elements].sort((a: any, b: any) => {
        let valA = 0;
        let valB = 0;

        // Helper to calc derived values for sorting
        const getDerived = (item: any, type: "risk" | "overhead" | "profit" | "total") => {
            const base = (item.totals?.materials || 0) + (item.totals?.labor || 0);
            if (type === "risk") return base * margins.riskPct;
            if (type === "overhead") return base * margins.overheadPct;
            if (type === "profit") return base * margins.profitPct;
            if (type === "total") return base + (base * margins.riskPct) + (base * margins.overheadPct) + (base * margins.profitPct);
            return 0;
        };

        switch (sortKey) {
            case "element":
                return sortDirection === "asc"
                    ? a.title.localeCompare(b.title)
                    : b.title.localeCompare(a.title);
            case "materials":
                valA = a.totals?.materials || 0;
                valB = b.totals?.materials || 0;
                break;
            case "labor":
                valA = a.totals?.labor || 0;
                valB = b.totals?.labor || 0;
                break;
            case "risk":
                valA = getDerived(a, "risk");
                valB = getDerived(b, "risk");
                break;
            case "overhead":
                valA = getDerived(a, "overhead");
                valB = getDerived(b, "overhead");
                break;
            case "profit":
                valA = getDerived(a, "profit");
                valB = getDerived(b, "profit");
                break;
            case "total":
                valA = getDerived(a, "total");
                valB = getDerived(b, "total");
                break;
        }

        return sortDirection === "asc" ? valA - valB : valB - valA;
    });

    return (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                    <thead className="text-xs text-gray-500 bg-gray-50/75 uppercase tracking-wider border-b border-gray-200">
                        <tr>
                            <SortHeader label="Element" sortKey="element" currentSort={sortKey} direction={sortDirection} onSort={handleSort} align="left" className="px-6" />
                            <SortHeader label="Materials" sortKey="materials" currentSort={sortKey} direction={sortDirection} onSort={handleSort} align="right" />
                            <SortHeader label="Labor" sortKey="labor" currentSort={sortKey} direction={sortDirection} onSort={handleSort} align="right" />
                            <SortHeader
                                label="Risk"
                                subLabel={`${Math.round(margins.riskPct * 100)}%`}
                                sortKey="risk"
                                currentSort={sortKey}
                                direction={sortDirection}
                                onSort={handleSort}
                                align="right"
                            />
                            <SortHeader
                                label="Overhead"
                                subLabel={`${Math.round(margins.overheadPct * 100)}%`}
                                sortKey="overhead"
                                currentSort={sortKey}
                                direction={sortDirection}
                                onSort={handleSort}
                                align="right"
                            />
                            <SortHeader
                                label="Profit"
                                subLabel={`${Math.round(margins.profitPct * 100)}%`}
                                sortKey="profit"
                                currentSort={sortKey}
                                direction={sortDirection}
                                onSort={handleSort}
                                align="right"
                            />
                            <SortHeader
                                label="Total (Customer)"
                                sortKey="total"
                                currentSort={sortKey}
                                direction={sortDirection}
                                onSort={handleSort}
                                align="right"
                                className="px-6 bg-gray-50/30 font-bold text-gray-900"
                            />
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {sortedElements.map((element: any) => (
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

function SortHeader({
    label,
    subLabel,
    sortKey,
    currentSort,
    direction,
    onSort,
    align = "left",
    className = ""
}: {
    label: string,
    subLabel?: string,
    sortKey: SortKey,
    currentSort: SortKey,
    direction: SortDirection,
    onSort: (key: SortKey) => void,
    align?: "left" | "right",
    className?: string
}) {
    return (
        <th
            className={`py-4 font-medium cursor-pointer hover:bg-gray-100 transition-colors select-none ${align === "right" ? "text-right" : "text-left"} ${className || "px-4"}`}
            onClick={() => onSort(sortKey)}
        >
            <div className={`flex items-center gap-1 ${align === "right" ? "justify-end" : "justify-start"}`}>
                <span className={sortKey === currentSort ? "text-gray-900" : ""}>
                    {label}
                    {subLabel && <span className="text-gray-400 text-[10px] ml-0.5 font-normal">{subLabel}</span>}
                </span>
                <div className="flex flex-col">
                    <ChevronUp size={10} className={`${sortKey === currentSort && direction === "asc" ? "text-gray-900" : "text-gray-300"}`} />
                    <ChevronDown size={10} className={`${sortKey === currentSort && direction === "desc" ? "text-gray-900" : "text-gray-300"} -mt-1`} />
                </div>
            </div>
        </th>
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
