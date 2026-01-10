"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";
import { CheckCircle, Clock, Copy, FileText, Loader2, Plus } from "lucide-react";
import { useMemo, useState, use } from "react";
import QuotePrintView from "./QuotePrintView";

export default function QuotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const projectId = id as Id<"projects">;

  const quotes = useQuery(api.quotes.listQuotes, { projectId });
  const selectedQuoteId = useSelectedQuoteId(quotes);
  const quote = useQuery(
    api.quotes.getQuote,
    selectedQuoteId.value ? { quoteId: selectedQuoteId.value } : "skip"
  );
  const previousQuoteId = useMemo(() => {
    if (!quotes || !selectedQuoteId.value) return null;
    const direct = quote?.previousQuoteId ?? null;
    if (direct) return direct;
    const index = quotes.findIndex((item) => item._id === selectedQuoteId.value);
    if (index === -1 || index + 1 >= quotes.length) return null;
    return quotes[index + 1]._id;
  }, [quotes, quote?.previousQuoteId, selectedQuoteId.value]);
  const diffData = useQuery(
    api.quotes.getDiff,
    previousQuoteId && selectedQuoteId.value
      ? { prevId: previousQuoteId, nextId: selectedQuoteId.value }
      : "skip"
  );

  const overview = useQuery(api.projects.getOverview, { id: projectId });
  const files = useQuery(api.files.listProjectFiles, { projectId });
  const pdfUrl = useQuery(
    api.files.getFileUrl,
    quote?.pdfFileId ? { fileId: quote.pdfFileId } : "skip"
  );
  const logoUrl = useQuery(
    api.files.getFileUrl,
    quote?.inputs?.logoFileId ? { fileId: quote.inputs.logoFileId } : "skip"
  );

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
  const [showDiff, setShowDiff] = useState(false);
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
            onClick={() => setShowDiff(true)}
            className="px-4 py-2 border rounded-lg text-sm font-medium hover:bg-gray-50 flex items-center gap-2"
            disabled={!previousQuoteId}
          >
            <Clock size={16} /> Diff vs Previous
          </button>
          {pdfUrl?.url && (
            <a
              href={pdfUrl.url}
              target="_blank"
              rel="noreferrer"
              className="px-4 py-2 border rounded-lg text-sm font-medium hover:bg-gray-50 flex items-center gap-2"
            >
              <FileText size={16} /> Download PDF
            </a>
          )}
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

      {showDiff && (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-6">
          <div className="bg-white rounded-xl shadow-xl max-w-3xl w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Diff vs Previous</h3>
              <button
                onClick={() => setShowDiff(false)}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                Close
              </button>
            </div>
            {!diffData ? (
              <div className="text-sm text-gray-500">No diff available.</div>
            ) : (
              <div className="space-y-4 text-sm text-gray-700">
                <div>
                  <h4 className="font-medium text-black">Totals</h4>
                  <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="border rounded-lg p-3">
                      <div className="text-xs text-gray-500">Subtotal Before VAT</div>
                      <div className="font-semibold">
                        {diffData.numbers.subtotalBeforeVat.before.toLocaleString()} →{" "}
                        {diffData.numbers.subtotalBeforeVat.after.toLocaleString()}
                      </div>
                      <div className="text-xs text-gray-500">
                        Δ {diffData.numbers.subtotalBeforeVat.delta.toLocaleString()}
                      </div>
                    </div>
                    <div className="border rounded-lg p-3">
                      <div className="text-xs text-gray-500">Total</div>
                      <div className="font-semibold">
                        {diffData.numbers.total.before.toLocaleString()} →{" "}
                        {diffData.numbers.total.after.toLocaleString()}
                      </div>
                      <div className="text-xs text-gray-500">
                        Δ {diffData.numbers.total.delta.toLocaleString()}
                      </div>
                    </div>
                  </div>
                </div>

                {diffData.numbers.breakdown.length > 0 && (
                  <div>
                    <h4 className="font-medium text-black">Breakdown Changes</h4>
                    <div className="mt-2 space-y-2">
                      {diffData.numbers.breakdown.map((item: any) => (
                        <div key={item.name} className="flex justify-between border-b pb-1">
                          <span>{item.name}</span>
                          <span>
                            {item.before.toLocaleString()} → {item.after.toLocaleString()} (Δ{" "}
                            {item.delta.toLocaleString()})
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <h4 className="font-medium text-black">Content Changes</h4>
                  {diffData.blocks.added.length === 0 &&
                  diffData.blocks.removed.length === 0 &&
                  diffData.blocks.changed.length === 0 ? (
                    <div className="text-sm text-gray-500">No content changes.</div>
                  ) : (
                    <div className="space-y-3">
                      {diffData.blocks.added.length > 0 && (
                        <div>
                          <div className="text-xs text-gray-500">Added Sections</div>
                          <div>{diffData.blocks.added.join(", ")}</div>
                        </div>
                      )}
                      {diffData.blocks.removed.length > 0 && (
                        <div>
                          <div className="text-xs text-gray-500">Removed Sections</div>
                          <div>{diffData.blocks.removed.join(", ")}</div>
                        </div>
                      )}
                      {diffData.blocks.changed.length > 0 && (
                        <div>
                          <div className="text-xs text-gray-500">Changed Sections</div>
                          <div className="space-y-2">
                            {diffData.blocks.changed.map((item: any) => (
                              <div key={item.block} className="border rounded-lg p-3">
                                <div className="text-xs text-gray-500">{item.block}</div>
                                <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                                  <div>
                                    <div className="text-gray-400">Before</div>
                                    <pre className="whitespace-pre-wrap text-gray-600">
                                      {item.before}
                                    </pre>
                                  </div>
                                  <div>
                                    <div className="text-gray-400">After</div>
                                    <pre className="whitespace-pre-wrap text-gray-600">
                                      {item.after}
                                    </pre>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

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
              <QuotePrintView
                projectName={overview?.project?.name ?? ""}
                customerName={
                  overview?.project?.customerName ??
                  overview?.project?.clientName ??
                  ""
                }
                quote={quote}
                logoUrl={logoUrl?.url}
              />
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
