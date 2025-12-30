"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { FileText, Plus, CheckCircle, Clock } from "lucide-react";

export default function QuotePage({ params }: { params: { id: string } }) {
  const projectId = params.id as Id<"projects">;
  const quotes = useQuery(api.quotes.listQuotes, { projectId });
  const generateQuote = useMutation(api.quotes.generateQuote);
  const approveBaseline = useMutation(api.financials.approveQuoteAsBaseline);

  const handleGenerate = async () => {
    // In a real app, you'd select which element versions to include.
    // Here we'll just try to generate with empty list or whatever is passed.
    await generateQuote({
        projectId,
        elementVersionIds: [] // Simulation: normally you'd pass IDs here
    });
  };

  const handleApprove = async (quoteId: Id<"quoteVersions">) => {
    await approveBaseline({ projectId, quoteId });
  };

  return (
    <div className="p-8 max-w-5xl mx-auto text-black">
      <div className="flex justify-between items-center mb-8">
        <div>
            <h2 className="text-3xl font-bold">Quotes</h2>
            <p className="text-gray-500">Generate and approve project quotes.</p>
        </div>
        <button 
            onClick={handleGenerate}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-blue-700 transition"
        >
            <Plus size={18} /> Generate New Quote
        </button>
      </div>

      <div className="space-y-4">
        {quotes?.map((quote) => (
          <div key={quote._id} className="bg-white border rounded-xl p-6 shadow-sm flex justify-between items-center">
            <div className="flex items-center gap-4">
                <div className="p-3 bg-blue-50 text-blue-600 rounded-lg">
                    <FileText size={24} />
                </div>
                <div>
                    <h3 className="font-bold">Quote Version {new Date(quote._createdAt).toLocaleDateString()}</h3>
                    <div className="flex gap-4 mt-1">
                        <span className="text-sm text-gray-500">Total: <span className="font-bold text-black">{quote.totals.grandTotal.toLocaleString()} ₪</span></span>
                        <span className="text-sm text-gray-500 flex items-center gap-1">
                            {quote.status === "approved" ? (
                                <span className="text-green-600 flex items-center gap-1"><CheckCircle size={14} /> Approved</span>
                            ) : (
                                <span className="text-amber-600 flex items-center gap-1"><Clock size={14} /> Generated</span>
                            )}
                        </span>
                    </div>
                </div>
            </div>
            
            <div className="flex gap-2">
                <button className="px-4 py-2 border rounded-lg text-sm font-medium hover:bg-gray-50">View Details</button>
                {quote.status !== "approved" && (
                    <button 
                        onClick={() => handleApprove(quote._id)}
                        className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700"
                    >
                        Approve as Baseline
                    </button>
                )}
            </div>
          </div>
        ))}

        {quotes?.length === 0 && (
            <div className="text-center py-20 bg-gray-50 rounded-xl border-2 border-dashed">
                <FileText size={48} className="mx-auto text-gray-300 mb-4" />
                <h3 className="text-gray-500 font-medium">No quotes generated yet.</h3>
                <p className="text-gray-400 text-sm mt-1">Click "Generate New Quote" to start the process.</p>
            </div>
        )}
      </div>
    </div>
  );
}