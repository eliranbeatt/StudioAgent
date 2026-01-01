"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";

export default function ProposedPage() {
  const proposals = useQuery(api.management.listProposed);
  const accept = useMutation(api.management.acceptProposed);
  const reject = useMutation(api.management.rejectProposed);

  const handleAccept = async (id: string) => {
    await accept({ proposedId: id as any });
  };

  const handleReject = async (id: string) => {
    await reject({ proposedId: id as any });
  };

  return (
    <div className="max-w-5xl">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">Proposed Updates Queue</h1>
      </div>

      {!proposals || proposals.length === 0 ? (
        <div className="bg-yellow-50 border border-yellow-200 rounded p-6 text-center">
          <p className="text-yellow-800 font-medium">No pending proposals from agents.</p>
          <p className="text-yellow-600 text-sm mt-2">
            When an agent suggests a new Vendor or Catalog Item, it will appear here for your approval.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {proposals.map((proposal) => (
            <div key={proposal._id} className="bg-white border rounded-lg shadow-sm p-6">
              <div className="flex justify-between items-start">
                <div>
                  <div className="text-xs font-semibold uppercase text-gray-400">
                    {proposal.entityType}
                  </div>
                  <div className="text-sm text-gray-700 mt-1">{proposal.reason}</div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleReject(proposal._id)}
                    className="px-3 py-1 text-xs font-semibold text-gray-600 border border-gray-200 rounded hover:bg-gray-50"
                  >
                    Reject
                  </button>
                  <button
                    onClick={() => handleAccept(proposal._id)}
                    className="px-3 py-1 text-xs font-semibold text-white bg-black rounded hover:bg-gray-800"
                  >
                    Accept
                  </button>
                </div>
              </div>
              <pre className="mt-4 text-xs text-gray-500 bg-gray-50 p-3 rounded-lg overflow-auto">
{JSON.stringify(proposal.payload, null, 2)}
              </pre>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
