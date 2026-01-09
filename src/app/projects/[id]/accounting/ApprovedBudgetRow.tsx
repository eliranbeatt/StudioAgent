import { ArrowRight, Lock } from "lucide-react";

interface ApprovedBudgetRowProps {
    summary: any;
}

export function ApprovedBudgetRow({ summary }: ApprovedBudgetRowProps) {
    const hasApprovedBudget = !!summary?.baseline?.grandTotal;
    const approvedTotal = summary?.baseline?.grandTotal ?? 0;

    return (
        <div className="mb-8">
            {/* Approved Line */}
            <div className="flex items-center justify-between bg-gray-50 rounded-lg border border-gray-200 p-3 px-4 mb-4">
                <div className="flex items-center gap-2">
                    <Lock size={14} className="text-gray-400" />
                    <span className="text-sm font-semibold text-gray-700">Approved Budget (from Approved Quote):</span>
                    {hasApprovedBudget ? (
                        <span className="font-mono font-bold text-gray-900">{approvedTotal.toLocaleString()} NIS</span>
                    ) : (
                        <span className="text-sm text-gray-400 italic">—</span>
                    )}
                </div>

                {!hasApprovedBudget && (
                    <span className="text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded border border-amber-100">
                        Approve a quote to lock budget baseline
                    </span>
                )}

                {hasApprovedBudget && (
                    <button className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1 font-medium">
                        Open approved quote <ArrowRight size={12} />
                    </button>
                )}
            </div>
        </div>
    );
}
