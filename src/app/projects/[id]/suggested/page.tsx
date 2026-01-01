"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";
import { use } from "react";

export default function SuggestedPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const projectId = id as Id<"projects">;

  const suggestions = useQuery(api.suggestions.listSuggested, { projectId });
  const approveSuggested = useMutation(api.suggestions.approveSuggestedElement);
  const rejectSuggested = useMutation(api.suggestions.rejectSuggestedElement);

  const pending = (suggestions ?? []).filter((item: any) => item.status === "pending");
  const approved = (suggestions ?? []).filter((item: any) => item.status === "approved");
  const rejected = (suggestions ?? []).filter((item: any) => item.status === "rejected");

  return (
    <div className="p-8 max-w-5xl mx-auto text-black">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-3xl font-bold">Suggested Elements</h2>
          <p className="text-sm text-gray-500 mt-1">
            Approve to create elements and drafts, or reject to discard.
          </p>
        </div>
      </div>

      <Section
        title={`Pending (${pending.length})`}
        emptyText="No pending suggestions."
      >
        {pending.map((item: any) => (
          <div
            key={item._id}
            className="border border-gray-100 rounded-xl p-5 bg-white shadow-sm flex items-center justify-between"
          >
            <div>
              <div className="font-semibold text-gray-900">{item.title}</div>
              <div className="text-xs text-gray-500 uppercase">{item.type}</div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => approveSuggested({ suggestionId: item._id })}
                className="px-3 py-2 text-xs font-semibold rounded-lg bg-black text-white hover:bg-gray-800"
              >
                Approve
              </button>
              <button
                onClick={() => rejectSuggested({ suggestionId: item._id })}
                className="px-3 py-2 text-xs font-semibold rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
              >
                Reject
              </button>
            </div>
          </div>
        ))}
      </Section>

      <Section
        title={`Approved (${approved.length})`}
        emptyText="No approved suggestions."
      >
        {approved.map((item: any) => (
          <div
            key={item._id}
            className="border border-gray-100 rounded-xl p-5 bg-white shadow-sm"
          >
            <div className="font-semibold text-gray-900">{item.title}</div>
            <div className="text-xs text-gray-500 uppercase">{item.type}</div>
            {item.approvedElementId ? (
              <div className="mt-1 text-[10px] text-gray-400">
                Element ID: {item.approvedElementId}
              </div>
            ) : null}
          </div>
        ))}
      </Section>

      <Section
        title={`Rejected (${rejected.length})`}
        emptyText="No rejected suggestions."
      >
        {rejected.map((item: any) => (
          <div
            key={item._id}
            className="border border-gray-100 rounded-xl p-5 bg-white shadow-sm"
          >
            <div className="font-semibold text-gray-900">{item.title}</div>
            <div className="text-xs text-gray-500 uppercase">{item.type}</div>
          </div>
        ))}
      </Section>
    </div>
  );
}

function Section({
  title,
  emptyText,
  children,
}: {
  title: string;
  emptyText: string;
  children: React.ReactNode;
}) {
  const hasItems = Array.isArray(children) ? children.length > 0 : Boolean(children);
  return (
    <div className="mb-10">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
      </div>
      <div className="space-y-3">
        {hasItems ? children : <div className="text-sm text-gray-500">{emptyText}</div>}
      </div>
    </div>
  );
}
