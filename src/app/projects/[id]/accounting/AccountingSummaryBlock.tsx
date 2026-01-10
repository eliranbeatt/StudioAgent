import { useState, useEffect } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";
import { Pencil } from "lucide-react";

interface AccountingSummaryBlockProps {
    projectId: Id<"projects">;
    summary: any;
    accounting: any;
    projectDefaults: {
        riskPct: number;
        overheadPct: number;
        profitPct: number;
    };
}

export function AccountingSummaryBlock({
    projectId,
    summary,
    accounting,
    projectDefaults,
}: AccountingSummaryBlockProps) {
    // Local state for margins
    const [margins, setMargins] = useState(projectDefaults);
    const [editingField, setEditingField] = useState<"risk" | "overhead" | "profit" | null>(null);

    const updateDefaults = useMutation(api.financials.updateProjectPricingDefaults);

    useEffect(() => {
        setMargins(projectDefaults);
    }, [projectDefaults]);

    // --- Calculations ---
    const baseCost = summary?.breakdown?.totals?.directCost ?? 0;
    const materialsTotal = summary?.breakdown?.elementCosts?.materials ?? 0;
    const laborTotal = summary?.breakdown?.elementCosts?.labor ?? 0;

    const riskAmount = baseCost * margins.riskPct;
    const overheadAmount = baseCost * margins.overheadPct;
    const profitAmount = baseCost * margins.profitPct;
    const customerPrice = baseCost + riskAmount + overheadAmount + profitAmount;
    const effectiveMultiplier = baseCost > 0 ? (customerPrice / baseCost).toFixed(2) : "1.00";
    const actualTotal = accounting?.totals?.actualTotal ?? null;
    const profitActual =
        actualTotal !== null && Number.isFinite(actualTotal)
            ? customerPrice - Number(actualTotal)
            : null;

    // --- Gap Calculations ---
    // Baseline logic: check if baseline has detailed breakdown (materials, labor).
    // Usually it acts as a snapshot of 'totals'.
    // If not present, we can only safely calc total gap.
    const baseline = summary?.baseline;
    const hasBaseline = Number(baseline?.total ?? baseline?.grandTotal ?? 0) > 0;

    // We treat missing baseline metrics as null (--)
    const baselineMat = baseline?.materials ?? null;
    const baselineLab = baseline?.labor ?? null;

    const matGap = hasBaseline && baselineMat !== null ? materialsTotal - baselineMat : null;
    const labGap = hasBaseline && baselineLab !== null ? laborTotal - baselineLab : null;
    // Fallback: If we don't have granular baseline, we can maybe infer or just show total gap.
    // For now, if null, UI shows "--".

    const handleSave = async () => {
        if (!editingField) return;
        await updateDefaults({
            projectId,
            riskPct: margins.riskPct,
            overheadPct: margins.overheadPct,
            profitPct: margins.profitPct,
        });
        setEditingField(null);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter") handleSave();
    };

    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">

            {/* Card 1: Base Costs & Gaps */}
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm flex flex-col justify-between">
                <div>
                    <div className="p-4 border-b border-gray-100 bg-gray-50/50">
                        <div className="text-xs font-bold text-gray-500 uppercase tracking-wider">Base Costs</div>
                    </div>
                    <div className="p-4 space-y-3">
                        <div className="flex items-center justify-between">
                            <span className="text-sm text-gray-600">Materials</span>
                            <span className="font-mono text-gray-900">{materialsTotal.toLocaleString()} NIS</span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-sm text-gray-600">Labor</span>
                            <span className="font-mono text-gray-900">{laborTotal.toLocaleString()} NIS</span>
                        </div>
                        <div className="pt-2 border-t border-gray-100 flex items-center justify-between">
                            <span className="text-sm font-bold text-gray-800">Total Base</span>
                            <span className="font-mono font-bold text-gray-900">{baseCost.toLocaleString()} NIS</span>
                        </div>
                    </div>
                </div>

                {/* Gaps Section (Always Visible Footer) */}
                <div className="bg-gray-50 border-t border-gray-100 p-4 grid grid-cols-2 gap-4 rounded-b-xl">
                    <GapDisplay label="Mat. Gap" gap={matGap} />
                    <GapDisplay label="Lab. Gap" gap={labGap} />
                </div>
            </div>

            {/* Card 2: Editable Margins */}
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm flex flex-col">
                <div className="p-4 border-b border-gray-100 bg-gray-50/50">
                    <div className="text-xs font-bold text-gray-500 uppercase tracking-wider">Margins</div>
                </div>
                <div className="divide-y divide-gray-100 flex-1 flex flex-col justify-center">
                    <MarginRow
                        label="Risk"
                        pct={margins.riskPct}
                        amount={riskAmount}
                        isEditing={editingField === "risk"}
                        onEdit={() => setEditingField("risk")}
                        onChange={(val) => setMargins(m => ({ ...m, riskPct: val }))}
                        onSave={handleSave}
                        onKeyDown={handleKeyDown}
                    />
                    <MarginRow
                        label="Overhead"
                        pct={margins.overheadPct}
                        amount={overheadAmount}
                        isEditing={editingField === "overhead"}
                        onEdit={() => setEditingField("overhead")}
                        onChange={(val) => setMargins(m => ({ ...m, overheadPct: val }))}
                        onSave={handleSave}
                        onKeyDown={handleKeyDown}
                    />
                    <MarginRow
                        label="Profit"
                        pct={margins.profitPct}
                        amount={profitAmount}
                        isEditing={editingField === "profit"}
                        onEdit={() => setEditingField("profit")}
                        onChange={(val) => setMargins(m => ({ ...m, profitPct: val }))}
                        onSave={handleSave}
                        onKeyDown={handleKeyDown}
                    />
                </div>
            </div>

            {/* Card 3: Customer Price */}
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm flex flex-col">
                <div className="p-4 border-b border-gray-100 bg-gray-50/50">
                    <div className="text-xs font-bold text-gray-500 uppercase tracking-wider">Customer Price</div>
                </div>
                <div className="p-6 flex-1 flex flex-col items-center justify-center text-center bg-gradient-to-b from-white to-gray-50/30">
                    <div className="text-4xl font-bold text-gray-900 tracking-tight">
                        {Math.round(customerPrice).toLocaleString()} <span className="text-lg text-gray-400 font-normal">NIS</span>
                    </div>
                    <div className="mt-4 inline-flex items-center px-3 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-100">
                        <span className="text-xs font-mono font-semibold">Multiplier: A- {effectiveMultiplier}</span>
                    </div>
                    <div className="mt-4 w-full text-xs text-gray-500 space-y-1">
                        <div className="flex items-center justify-between">
                            <span>Actual total</span>
                            <span className="font-mono text-gray-700">
                                {actualTotal === null ? "--" : Math.round(actualTotal).toLocaleString()} NIS
                            </span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span>Profit</span>
                            <span className="font-mono text-gray-900 font-semibold">
                                {profitActual === null ? "--" : Math.round(profitActual).toLocaleString()} NIS
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function MarginRow({
    label,
    pct,
    amount,
    isEditing,
    onEdit,
    onChange,
    onSave,
    onKeyDown
}: {
    label: string;
    pct: number;
    amount: number;
    isEditing: boolean;
    onEdit: () => void;
    onChange: (val: number) => void;
    onSave: () => void;
    onKeyDown: (e: React.KeyboardEvent) => void;
}) {
    return (
        <div className="flex items-center justify-between p-3 px-4 hover:bg-gray-50 transition-colors group">
            <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-600 w-20">{label}</span>
                {isEditing ? (
                    <div className="flex items-center">
                        <input
                            autoFocus
                            type="number"
                            min="0"
                            max="100"
                            step="1"
                            value={Math.round(pct * 100)}
                            onChange={(e) => onChange(parseFloat(e.target.value) / 100)}
                            onBlur={onSave}
                            onKeyDown={onKeyDown}
                            className="w-12 px-1 py-0.5 text-xs font-mono border border-blue-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-100"
                        />
                        <span className="text-xs text-gray-500 ml-1">%</span>
                    </div>
                ) : (
                    <button
                        onClick={onEdit}
                        className="flex items-center hover:bg-gray-200 rounded px-1.5 py-0.5 transition-colors"
                    >
                        <span className="text-xs font-mono text-gray-500">{Math.round(pct * 100)}%</span>
                        <Pencil size={10} className="text-gray-400 ml-1 opacity-0 group-hover:opacity-100" />
                    </button>
                )}
            </div>
            <div className="font-mono text-sm text-gray-900 font-medium">
                {Math.round(amount).toLocaleString()}
            </div>
        </div>
    );
}

function GapDisplay({ label, gap }: { label: string; gap: number | null }) {
    if (gap === null) {
        return (
            <div className="flex flex-col">
                <span className="text-[10px] text-gray-500 uppercase font-semibold">{label}</span>
                <span className="text-xs font-mono text-gray-300">--</span>
            </div>
        );
    }
    const isPositive = gap > 0; // Over budget cost (Bad for client/budget, but implies diff)
    const isNegative = gap < 0; // Under budget cost

    // Semantics:
    // Gap = Actual(Draft) - Approved
    // Positive = Draft is higher than approved (Cost Added) -> Amber/Warning
    // Negative = Draft is lower than approved (Savings) -> Green

    const color = isPositive ? "text-amber-600" : isNegative ? "text-green-600" : "text-gray-400";
    const sign = isPositive ? "+" : "";

    return (
        <div className="flex flex-col">
            <span className="text-[10px] text-gray-400 uppercase font-bold">{label}</span>
            <span className={`text-xs font-mono font-bold ${color}`}>
                {sign}{Math.round(gap).toLocaleString()}
            </span>
        </div>
    );
}
