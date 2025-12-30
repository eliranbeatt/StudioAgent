"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { AlertTriangle, Check, Trash2, ArrowRight } from "lucide-react";
import { Id } from "../../../convex/_generated/dataModel";

export default function GraveyardPage({ params }: { params: { id: string } }) {
  const projectId = params.id as Id<"projects">;
  const pendingItems = useQuery(api.graveyard.listPending, { projectId });
  const resolveItem = useMutation(api.graveyard.resolve);

  const handleResolve = async (itemId: Id<"graveyardItems">, optionId: string) => {
    await resolveItem({ graveyardItemId: itemId, selectedOptionId: optionId });
  };

  if (!pendingItems) return <div className="p-8">Loading graveyard...</div>;

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-3 bg-red-100 text-red-600 rounded-full">
            <AlertTriangle size={24} />
        </div>
        <div>
            <h1 className="text-3xl font-bold text-gray-900">Tombstone Graveyard</h1>
            <p className="text-gray-500">
                Review destructive or ambiguous changes detected by the Reconciliation Engine.
            </p>
        </div>
      </div>

      {pendingItems.length === 0 ? (
        <div className="bg-green-50 border border-green-200 rounded-lg p-8 text-center">
            <Check className="mx-auto text-green-500 mb-4" size={48} />
            <h3 className="text-lg font-medium text-green-800">All Clear!</h3>
            <p className="text-green-600">No pending decisions. Your project data is consistent.</p>
        </div>
      ) : (
        <div className="space-y-6">
            {pendingItems.map((item) => (
                <div key={item._id} className="bg-white border rounded-lg shadow-sm overflow-hidden">
                    <div className="p-6 border-b bg-gray-50 flex justify-between items-start">
                        <div>
                            <span className="text-xs font-bold text-red-600 uppercase tracking-wide bg-red-100 px-2 py-1 rounded">
                                {item.kind}
                            </span>
                            <h3 className="mt-2 text-lg font-semibold text-gray-900">{item.message}</h3>
                        </div>
                        <span className="text-xs text-gray-400">
                            {new Date(item.createdAt).toLocaleString()}
                        </span>
                    </div>
                    
                    <div className="p-6">
                        <h4 className="text-sm font-medium text-gray-500 mb-4 uppercase">Choose an action:</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {item.options.map((opt: any) => (
                                <button
                                    key={opt.id}
                                    onClick={() => handleResolve(item._id, opt.id)}
                                    className="flex items-center justify-between p-4 border rounded-lg hover:bg-blue-50 hover:border-blue-300 transition group text-left"
                                >
                                    <div>
                                        <div className="font-semibold text-gray-800 group-hover:text-blue-700">
                                            {opt.label}
                                        </div>
                                        {opt.patchOps && (
                                            <div className="text-xs text-gray-400 mt-1">
                                                {opt.patchOps.length} patch op(s)
                                            </div>
                                        )}
                                    </div>
                                    <ArrowRight size={16} className="text-gray-300 group-hover:text-blue-500" />
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            ))}
        </div>
      )}
    </div>
  );
}