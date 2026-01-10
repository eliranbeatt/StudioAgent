"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";
import { CheckCircle, Clock, Copy, FileText, Loader2, Plus } from "lucide-react";
import { useMemo, useState, use } from "react";

export default function QuotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const projectId = id as Id<"projects">;

  const quotes = useQuery(api.quotes.listQuotes, { projectId });
  const selectedQuoteId = useSelectedQuoteId(quotes);
  const quote = useQuery(
    api.quotes.getQuote,
    selectedQuoteId.value ? { quoteId: selectedQuoteId.value } : "skip"
  );

  const overview = useQuery(api.projects.getOverview, { id: projectId });
  const files = useQuery(api.files.listProjectFiles, { projectId });

  const createDraftFromUi = useMutation(api.quotes.createDraftFromUi);
  const generateQuoteV2 = useAction(api.quotes.generateQuoteV2);
  const approveBaseline = useMutation(api.financials.approveQuoteAsBaseline);
  const generateQuotePdf = useAction(api.quotePdf.generateQuotePdf);

  const [projectDescription, setProjectDescription] = useState("");
  const [specs, setSpecs] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [elementsMode, setElementsMode] = useState<"bySection" | "byElement">("byElement");
  const [includeElements, setIncludeElements] = useState(true);
  const [includeTerms, setIncludeTerms] = useState(true);
  const [includeDates, setIncludeDates] = useState(true);
  const [includeAgreements, setIncludeAgreements] = useState(true);
  const [includeOptions, setIncludeOptions] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [logoFileId, setLogoFileId] = useState<Id<"projectFiles"> | "">("");

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      const quoteId = await createDraftFromUi({
        projectId,
        inputs: {
          projectDescription: projectDescription || overview?.project?.description || undefined,
          specs,
          validUntil: validUntil || undefined,
          logoFileId: logoFileId || undefined,
          includeFlags: {
            includeElements,
            elementsMode,
            includeTerms,
            includeDates,
            includeAgreements,
            includeOptions,
          },
        },
      });

      selectedQuoteId.set(quoteId);
      await generateQuoteV2({ projectId, quoteId });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleExportPdf = async () => {
    if (!quote?._id) return;
    setIsExporting(true);
    try {
      await generateQuotePdf({ projectId, quoteId: quote._id });
    } finally {
      setIsExporting(false);
    }
  };

  const handleCopyText = async () => {
    if (!quote?.quoteText_he) return;
    await navigator.clipboard.writeText(quote.quoteText_he);
  };

  const handleApprove = async () => {
    if (!quote?._id) return;
    await approveBaseline({ projectId, quoteId: quote._id });
  };

  const summaryTotal = useMemo(() => {
    if (quote?.priceSummary?.total) return quote.priceSummary.total;
    if (quote?.totals?.grandTotal) return quote.totals.grandTotal;
    return 0;
  }, [quote]);

  const logoOptions =
    files?.filter((file) => file.contentType?.startsWith("image/")) ?? [];

  return (
    <div className="p-8 max-w-6xl mx-auto text-black">
      <div className="flex justify-between items-start mb-8 gap-6 flex-wrap">
        <div>
          <h2 className="text-3xl font-bold">Quote</h2>
          <p className="text-gray-500">Generate client-ready quotes with versioning.</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleExportPdf}
            className="px-4 py-2 border rounded-lg text-sm font-medium hover:bg-gray-50 flex items-center gap-2"
            disabled={!quote?._id || isExporting}
          >
            {isExporting ? <Loader2 className="animate-spin" size={16} /> : <FileText size={16} />}
            {isExporting ? "Exporting..." : "Export PDF"}
          </button>
          <button
            onClick={handleCopyText}
            className="px-4 py-2 border rounded-lg text-sm font-medium hover:bg-gray-50 flex items-center gap-2"
            disabled={!quote?.quoteText_he}
          >
            <Copy size={16} /> Copy as Text
          </button>
          {quote?._id && quote.status !== "approved" && (
            <button
              onClick={handleApprove}
              className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700"
            >
              Approve as Baseline
            </button>
          )}
          <button
            onClick={handleGenerate}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-blue-700 transition"
            disabled={isGenerating}
          >
            {isGenerating ? <Loader2 className="animate-spin" size={18} /> : <Plus size={18} />}
            {isGenerating ? "Generating..." : "Generate Quote"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6">
        <div className="bg-white border rounded-xl p-5 shadow-sm space-y-5">
          <div>
            <label className="text-sm font-medium text-gray-700">Project Description</label>
          <textarea
              value={projectDescription}
              onChange={(event) => setProjectDescription(event.target.value)}
              className="mt-2 w-full border rounded-lg p-3 text-sm"
              rows={4}
              placeholder={overview?.project?.description || "Short project description for the quote intro"}
            />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700">Key Specs</label>
          <textarea
              value={specs}
              onChange={(event) => setSpecs(event.target.value)}
              className="mt-2 w-full border rounded-lg p-3 text-sm"
              rows={4}
              placeholder="Material notes, dimensions, finishing requirements"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700">Valid Until (YYYY-MM-DD)</label>
            <input
              value={validUntil}
              onChange={(event) => setValidUntil(event.target.value)}
              className="mt-2 w-full border rounded-lg p-3 text-sm"
              placeholder="2026-02-15"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700">Logo</label>
            <select
              value={logoFileId}
              onChange={(event) =>
                setLogoFileId(event.target.value as Id<"projectFiles"> | "")
              }
              className="mt-2 w-full border rounded-lg p-3 text-sm"
            >
              <option value="">No logo</option>
              {logoOptions.map((file) => (
                <option key={file._id} value={file._id}>
                  {file.fileName}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-gray-400">Upload logos in Project Files.</p>
          </div>
          <div className="space-y-3">
            <label className="text-sm font-medium text-gray-700">Include Blocks</label>
            <div className="space-y-2">
              <label className="flex items-center justify-between text-sm">
                <span>Elements</span>
                <input
                  type="checkbox"
                  checked={includeElements}
                  onChange={(event) => setIncludeElements(event.target.checked)}
                />
              </label>
              <div className="flex items-center justify-between text-sm text-gray-500">
                <span>Elements Mode</span>
                <select
                  value={elementsMode}
                  onChange={(event) => setElementsMode(event.target.value as "bySection" | "byElement")}
                  className="border rounded-md px-2 py-1 text-sm"
                >
                  <option value="byElement">By Element</option>
                  <option value="bySection">By Section</option>
                </select>
              </div>
              <label className="flex items-center justify-between text-sm">
                <span>Terms</span>
                <input
                  type="checkbox"
                  checked={includeTerms}
                  onChange={(event) => setIncludeTerms(event.target.checked)}
                />
              </label>
              <label className="flex items-center justify-between text-sm">
                <span>Dates</span>
                <input
                  type="checkbox"
                  checked={includeDates}
                  onChange={(event) => setIncludeDates(event.target.checked)}
                />
              </label>
              <label className="flex items-center justify-between text-sm">
                <span>Agreements</span>
                <input
                  type="checkbox"
                  checked={includeAgreements}
                  onChange={(event) => setIncludeAgreements(event.target.checked)}
                />
              </label>
              <label className="flex items-center justify-between text-sm">
                <span>Options</span>
                <input
                  type="checkbox"
                  checked={includeOptions}
                  onChange={(event) => setIncludeOptions(event.target.checked)}
                />
              </label>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-white border rounded-xl p-5 shadow-sm">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                  <FileText size={20} />
                </div>
                <div>
                  <h3 className="font-semibold">Latest Quote</h3>
                  <p className="text-sm text-gray-500">
                    {quote?._creationTime
                      ? new Date(quote._creationTime).toLocaleDateString()
                      : "No quote selected"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-sm text-gray-500">
                  Total: <span className="font-semibold text-black">{summaryTotal.toLocaleString()} ?</span>
                </span>
                <span className="text-sm text-gray-500 flex items-center gap-1">
                  {quote?.status === "approved" ? (
                    <span className="text-green-600 flex items-center gap-1">
                      <CheckCircle size={14} /> Approved
                    </span>
                  ) : (
                    <span className="text-amber-600 flex items-center gap-1">
                      <Clock size={14} /> {quote?.status ?? "Draft"}
                    </span>
                  )}
                </span>
              </div>
            </div>
          </div>

          <div className="bg-white border rounded-xl p-6 shadow-sm space-y-4">
            <h4 className="font-semibold">Quote Preview</h4>
            {quote?.quoteBlocks ? (
              <div className="space-y-4 text-sm text-gray-700">
                <div>
                  <h5 className="font-semibold text-base text-black">{quote.quoteBlocks.title_he}</h5>
                  <p className="text-gray-600 mt-1">{quote.quoteBlocks.intro_he}</p>
                </div>
                {quote.quoteBlocks.scope_he?.length > 0 && (
                  <div>
                    <p className="font-medium text-black">Scope</p>
                    <ul className="list-disc list-inside text-gray-600">
                      {quote.quoteBlocks.scope_he.map((item: string, index: number) => (
                        <li key={index}>{item}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {quote.quoteBlocks.deliverables_he?.length > 0 && (
                  <div>
                    <p className="font-medium text-black">Deliverables</p>
                    <ul className="list-disc list-inside text-gray-600">
                      {quote.quoteBlocks.deliverables_he.map((item: string, index: number) => (
                        <li key={index}>{item}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {quote.quoteBlocks.schedule_he?.length > 0 && (
                  <div>
                    <p className="font-medium text-black">Schedule</p>
                    <ul className="list-disc list-inside text-gray-600">
                      {quote.quoteBlocks.schedule_he.map((item: string, index: number) => (
                        <li key={index}>{item}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {quote.quoteBlocks.priceSummary_he?.length > 0 && (
                  <div>
                    <p className="font-medium text-black">Price Summary</p>
                    <ul className="list-disc list-inside text-gray-600">
                      {quote.quoteBlocks.priceSummary_he.map((item: string, index: number) => (
                        <li key={index}>{item}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {quote.quoteBlocks.agreements_he?.length > 0 && (
                  <div>
                    <p className="font-medium text-black">Agreements</p>
                    <ul className="list-disc list-inside text-gray-600">
                      {quote.quoteBlocks.agreements_he.map((item: string, index: number) => (
                        <li key={index}>{item}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {quote.quoteBlocks.assumptions_he?.length > 0 && (
                  <div>
                    <p className="font-medium text-black">Assumptions</p>
                    <ul className="list-disc list-inside text-gray-600">
                      {quote.quoteBlocks.assumptions_he.map((item: string, index: number) => (
                        <li key={index}>{item}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {quote.quoteBlocks.exclusions_he?.length > 0 && (
                  <div>
                    <p className="font-medium text-black">Exclusions</p>
                    <ul className="list-disc list-inside text-gray-600">
                      {quote.quoteBlocks.exclusions_he.map((item: string, index: number) => (
                        <li key={index}>{item}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {quote.quoteBlocks.terms_he?.length > 0 && (
                  <div>
                    <p className="font-medium text-black">Terms</p>
                    <ul className="list-disc list-inside text-gray-600">
                      {quote.quoteBlocks.terms_he.map((item: string, index: number) => (
                        <li key={index}>{item}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-sm text-gray-500">No quote generated yet.</div>
            )}
          </div>

          <div className="bg-white border rounded-xl p-5 shadow-sm">
            <h4 className="font-semibold mb-4">Quote Versions</h4>
            <div className="space-y-3">
              {quotes?.map((quoteItem) => (
                <button
                  key={quoteItem._id}
                  onClick={() => selectedQuoteId.set(quoteItem._id)}
                  className={`w-full text-left border rounded-lg p-3 flex justify-between items-center ${
                    quoteItem._id === selectedQuoteId.value ? "border-blue-500 bg-blue-50" : "border-gray-200"
                  }`}
                >
                  <div>
                    <p className="font-medium">Version {quoteItem.version ?? "-"}</p>
                    <p className="text-xs text-gray-500">
                      {new Date(quoteItem._creationTime).toLocaleDateString()}
                    </p>
                  </div>
                  <span className="text-sm text-gray-500">
                    {quoteItem.totals?.grandTotal?.toLocaleString() ?? 0} ?
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function useSelectedQuoteId(quotes: Array<any> | undefined) {
  const [value, setValue] = useState<Id<"quoteVersions"> | null>(null);
  const fallback = quotes?.[0]?._id ?? null;
  const selected = value ?? fallback;

  return useMemo(() => ({ value: selected, set: setValue }), [selected]);
}
