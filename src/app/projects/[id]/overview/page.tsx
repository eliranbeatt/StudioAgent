"use client";

import { useMutation, useQuery, useAction } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";
import { use, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Layers, Wallet, ClipboardCheck, UploadCloud, Trash2, Loader2, RefreshCcw } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { ProjectKnowledgePanel } from "./ProjectKnowledgePanel";
import ReactMarkdown from "react-markdown";

export default function OverviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const projectId = id as Id<"projects">;
  const router = useRouter();
  const overview = useQuery(api.projects.getOverview, { id: projectId });
  const files = useQuery(api.files.listProjectFiles, { projectId });
  const allProjects = useQuery(api.projects.listProjects, { excludeId: projectId });
  const linkedProjects = useQuery(api.projects.listLinkedProjects, { projectId });
  const generateUploadUrl = useMutation(api.files.generateUploadUrl);
  const saveUploadedFile = useAction(api.filesActions.saveUploadedFile);
  const deleteProjectFile = useAction(api.files.deleteProjectFile);

  const createElementFromStructured = useMutation(api.agent.createElementFromStructured);
  const updateProjectDetails = useMutation(api.projects.updateProjectDetails);
  const deleteProject = useMutation(api.projects.deleteProject);
  const setProjectCustomerByName = useMutation(api.projectsCustomers.setProjectCustomerByName);
  const linkProject = useMutation(api.projects.linkProject);
  const unlinkProject = useMutation(api.projects.unlinkProject);
  const generateProjectDigest = useMutation(api.projects.generateProjectDigest);
  const generateOverviewSummary = useAction(api.projects.generateOverviewSummary);
  const retrySummary = useMutation(api.projects.retrySummary);

  const [isSavingDetails, setIsSavingDetails] = useState(false);
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [formState, setFormState] = useState({
    name: "",
    customerName: "",
    description: "",
    eventDate: "",
    budgetCap: "",
    status: "",
    projectTypes: [] as string[],
  });
  const [newElementTitle, setNewElementTitle] = useState("");
  const [newElementType, setNewElementType] = useState("build");
  const [openFileId, setOpenFileId] = useState<string | null>(null);
  const searchParams = useSearchParams();
  const activeSubtab =
    searchParams.get("tab") === "knowledge" ? "knowledge" : "overview";

  const handleSubtabChange = (nextTab: "overview" | "knowledge") => {
    const params = new URLSearchParams(searchParams.toString());
    if (nextTab === "knowledge") {
      params.set("tab", "knowledge");
    } else {
      params.delete("tab");
    }
    const nextQuery = params.toString();
    router.replace(
      nextQuery
        ? `/projects/${projectId}/overview?${nextQuery}`
        : `/projects/${projectId}/overview`
    );
  };

  useEffect(() => {
    if (!overview?.project) return;
    setFormState({
      name: overview.project.name ?? "",
      customerName: overview.project.customerName ?? overview.project.clientName ?? "",
      description: overview.project.description ?? "",
      eventDate: formatDateInput(overview.project.details?.eventDate),
      budgetCap:
        overview.project.details?.budgetCap !== undefined
          ? String(overview.project.details?.budgetCap ?? "")
          : "",
      status: overview.project.status ?? "active",
      projectTypes: overview.project.projectTypes ?? [],
    });
  }, [overview?.project]);

  const availableProjects = useMemo(() => {
    if (!allProjects) return [];
    const linkedIds = new Set((linkedProjects ?? []).map((link: any) => link.project?.id));
    return allProjects.filter((project) => !linkedIds.has(project.id));
  }, [allProjects, linkedProjects]);

  const handleDeleteProject = async () => {
    if (!overview?.project) return;
    const confirmed = window.confirm(
      `Are you sure you want to delete project "${overview.project.name}"? This action is IRREVERSIBLE and will delete ALL elements, tasks, files, and financial data.`
    );
    if (!confirmed) return;

    setIsDeleting(true);
    try {
      await deleteProject({ id: projectId });
      router.push("/projects");
    } catch (e) {
      console.error("Failed to delete project", e);
      alert("Failed to delete project. Check console for details.");
      setIsDeleting(false);
    }
  };

  if (!overview) {
    return <div className="p-8 text-gray-500">Loading overview...</div>;
  }

  const baselineSell = Number(overview.baseline?.totals?.grandTotal ?? 0);
  const approvedCO = Number(overview.approvedCO?.sellPrice ?? 0);
  const effectiveBudget = baselineSell + approvedCO;

  // Use new 'summary' field if available, fallback to old overviewSummary
  const summaryText = (overview.project as any).summary || overview.project.overviewSummary;

  return (
    <div className="p-8 max-w-6xl mx-auto text-black">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-3xl font-bold">{overview.project.name}</h2>
          <p className="text-sm text-gray-500 mt-1">
            Status: <span className="font-medium text-gray-700">{overview.project.status}</span>
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider bg-gray-100 text-gray-600">
            {overview.project.currency}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-8">
        {[
          { key: "overview", label: "Overview" },
          { key: "knowledge", label: "Knowledge" },
        ].map((tab) => {
          const isActive = activeSubtab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => handleSubtabChange(tab.key as "overview" | "knowledge")}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${isActive
                ? "bg-black text-white shadow-md"
                : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
                }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {activeSubtab === "overview" ? (
        <>
          {((overview.project as any).summaryStatus === "queued" || (overview.project as any).summaryStatus === "generating") && (
            <div className="mb-8 bg-blue-50 border border-blue-100 rounded-xl p-4 flex items-center gap-3 text-blue-700 animate-in fade-in slide-in-from-top-2">
              <Loader2 className="animate-spin" size={20} />
              <div>
                <div className="font-semibold">AI is generating project summary...</div>
                <div className="text-xs opacity-80">This might take a minute. It will appear below automatically.</div>
              </div>
            </div>
          )}

          {(overview.project as any).summaryStatus === "failed" && (
            <div className="mb-8 bg-red-50 border border-red-100 rounded-xl p-4 flex items-center justify-between text-red-700">
              <div className="flex items-center gap-3">
                <AlertTriangle size={20} />
                <div>
                  <div className="font-semibold">Summary generation failed</div>
                  <div className="text-xs opacity-80">{(overview.project as any).summaryError || "Unknown error"}</div>
                </div>
              </div>
              <button
                onClick={() => retrySummary({ projectId })}
                className="px-3 py-1.5 bg-white border border-red-200 rounded-lg text-xs font-bold uppercase tracking-wider hover:bg-red-50 transition-colors shadow-sm"
              >
                Retry
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
            <StatCard
              title="Elements"
              value={overview.counts.elementCount}
              icon={Layers}
            />
            <StatCard
              title="Baseline"
              value={formatMoney(baselineSell, overview.project.currency)}
              icon={ClipboardCheck}
            />
            <StatCard
              title="Effective Budget"
              value={formatMoney(effectiveBudget, overview.project.currency)}
              icon={Wallet}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-10">
            <div className="lg:col-span-2 bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
                <h3 className="font-semibold text-gray-900">Project Summary</h3>
                <button
                  className="text-xs font-semibold uppercase tracking-wider text-gray-600 hover:text-gray-900"
                  onClick={async () => {
                    setIsGeneratingSummary(true);
                    try {
                      await generateOverviewSummary({ id: projectId });
                    } finally {
                      setIsGeneratingSummary(false);
                    }
                  }}
                  disabled={isGeneratingSummary}
                >
                  {overview.project.overviewSummary ? "Regenerate summary" : "Generate summary"}
                </button>
              </div>
              <div className="p-6 text-sm text-gray-700">
                {summaryText && summaryText.trim().length > 0 ? (
                  <div className="prose prose-sm max-w-none prose-headings:font-bold prose-headings:text-gray-900 prose-p:text-gray-700" dir="auto">
                    <ReactMarkdown>{summaryText}</ReactMarkdown>

                    {(overview.project as any).summarySources && (overview.project as any).summarySources.length > 0 && (
                      <div className="mt-6 pt-4 border-t border-gray-100">
                        <div className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wider">Sources</div>
                        <ul className="space-y-1">
                          {(overview.project as any).summarySources.map((s: any, idx: number) => (
                            <li key={idx} className="text-xs">
                              <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline flex items-center gap-1">
                                {s.title}
                              </a>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-gray-500 italic">No project summary yet. Generate one from elements and knowledge.</div>
                )}
              </div>
            </div>

            <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
                <h3 className="font-semibold text-gray-900">Project Details</h3>
              </div>
              <div className="p-6 space-y-4 text-sm">
                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                    Project name
                  </span>
                  <input
                    className="mt-2 w-full rounded-lg border border-gray-200 p-2 text-sm text-gray-900"
                    value={formState.name}
                    onChange={(e) => setFormState((prev) => ({ ...prev, name: e.target.value }))}
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                    Customer
                  </span>
                  <input
                    className="mt-2 w-full rounded-lg border border-gray-200 p-2 text-sm text-gray-900"
                    value={formState.customerName}
                    onChange={(e) => setFormState((prev) => ({ ...prev, customerName: e.target.value }))}
                    placeholder="Customer name"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                    Project description
                  </span>
                  <textarea
                    className="mt-2 w-full rounded-lg border border-gray-200 p-2 text-sm text-gray-900"
                    rows={4}
                    value={formState.description}
                    onChange={(e) => setFormState((prev) => ({ ...prev, description: e.target.value }))}
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                    Event date
                  </span>
                  <input
                    type="date"
                    className="mt-2 w-full rounded-lg border border-gray-200 p-2 text-sm text-gray-900"
                    value={formState.eventDate}
                    onChange={(e) => setFormState((prev) => ({ ...prev, eventDate: e.target.value }))}
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                    Budget cap ({overview.project.currency})
                  </span>
                  <input
                    type="number"
                    min="0"
                    className="mt-2 w-full rounded-lg border border-gray-200 p-2 text-sm text-gray-900"
                    value={formState.budgetCap}
                    onChange={(e) => setFormState((prev) => ({ ...prev, budgetCap: e.target.value }))}
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                    Status
                  </span>
                  <select
                    className="mt-2 w-full rounded-lg border border-gray-200 p-2 text-sm text-gray-900"
                    value={formState.status}
                    onChange={(e) => setFormState((prev) => ({ ...prev, status: e.target.value }))}
                  >
                    {STATUS_OPTIONS.map((opt) => (
                      <option key={opt.id} value={opt.id}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </label>
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                    Project types
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {PROJECT_TYPES.map((type) => {
                      const isChecked = formState.projectTypes.includes(type.id);
                      return (
                        <label key={type.id} className="inline-flex items-center gap-2 text-xs text-gray-600">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              setFormState((prev) => ({
                                ...prev,
                                projectTypes: e.target.checked
                                  ? [...prev.projectTypes, type.id]
                                  : prev.projectTypes.filter((entry) => entry !== type.id),
                              }));
                            }}
                          />
                          {type.label}
                        </label>
                      );
                    })}
                  </div>
                </div>
                <button
                  className="w-full rounded-lg bg-black text-white py-2 text-xs font-semibold uppercase tracking-wider disabled:opacity-60"
                  onClick={async () => {
                    setIsSavingDetails(true);
                    try {
                      const eventDate = formatDateInput(parseDateInput(formState.eventDate) ?? undefined); // fixed format logic if needed, but original used it
                      const budgetCap = parseNumberInput(formState.budgetCap);
                      await updateProjectDetails({
                        id: projectId,
                        name: formState.name,
                        description: formState.description,
                        status: formState.status as any,
                        projectTypes: formState.projectTypes,
                        details: {
                          eventDate: parseDateInput(formState.eventDate) ?? undefined,
                          budgetCap: budgetCap ?? undefined,
                        },
                      });
                      const trimmedCustomer = formState.customerName.trim();
                      const currentCustomer =
                        overview.project.customerName ?? overview.project.clientName ?? "";
                      if (trimmedCustomer && trimmedCustomer !== currentCustomer) {
                        await setProjectCustomerByName({
                          projectId,
                          customerName: trimmedCustomer,
                        });
                      }
                    } finally {
                      setIsSavingDetails(false);
                    }
                  }}
                  disabled={isSavingDetails}
                >
                  {isSavingDetails ? "Saving..." : "Save updates"}
                </button>
              </div>
            </div>
          </div>

          <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden mb-10">
            <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
              <h3 className="font-semibold text-gray-900">Past Project Knowledge</h3>
            </div>
            <div className="p-6 space-y-6">
              <div className="flex flex-col md:flex-row md:items-center gap-3">
                <select
                  className="w-full md:w-72 rounded-lg border border-gray-200 p-2 text-sm text-gray-900"
                  value={selectedProjectId}
                  onChange={(e) => setSelectedProjectId(e.target.value)}
                >
                  <option value="">Select a past project</option>
                  {availableProjects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
                <button
                  className="rounded-lg border border-gray-200 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-gray-600"
                  onClick={async () => {
                    if (!selectedProjectId) return;
                    await linkProject({
                      projectId,
                      linkedProjectId: selectedProjectId as Id<"projects">,
                      mode: "contextOnly",
                    });
                    setSelectedProjectId("");
                  }}
                  disabled={!selectedProjectId}
                >
                  Link project
                </button>
              </div>

              {linkedProjects && linkedProjects.length > 0 ? (
                <div className="divide-y border border-gray-100 rounded-lg">
                  {linkedProjects.map((link: any) => (
                    <div key={link.linkId} className="p-5">
                      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                        <div>
                          <div className="font-semibold text-gray-900">{link.project.name}</div>
                          <div className="text-xs text-gray-500 mt-1">Status: {link.project.status}</div>
                        </div>
                        <button
                          className="text-xs font-semibold uppercase tracking-wider text-gray-500 hover:text-gray-800"
                          onClick={async () => {
                            await unlinkProject({
                              projectId,
                              linkedProjectId: link.project.id,
                            });
                          }}
                        >
                          Unlink
                        </button>
                      </div>
                      <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-gray-600">
                        <label className="inline-flex items-center gap-2">
                          Mode
                          <select
                            className="rounded border border-gray-200 px-2 py-1 text-xs text-gray-700"
                            value={link.mode}
                            onChange={async (e) => {
                              await linkProject({
                                projectId,
                                linkedProjectId: link.project.id,
                                mode: e.target.value as "contextOnly" | "importSuggestions",
                              });
                            }}
                          >
                            <option value="contextOnly">Context only</option>
                            <option value="importSuggestions">Import suggestions</option>
                          </select>
                        </label>
                        {!link.digest && (
                          <button
                            className="rounded border border-gray-200 px-2 py-1 text-xs font-semibold uppercase tracking-wider text-gray-600"
                            onClick={async () => {
                              await generateProjectDigest({ projectId: link.project.id });
                            }}
                          >
                            Generate digest
                          </button>
                        )}
                      </div>

                      <div className="mt-4 text-sm text-gray-700">
                        {link.digest ? (
                          <>
                            <div className="font-semibold text-gray-800">Digest</div>
                            <div className="mt-2 text-xs text-gray-600 whitespace-pre-wrap">
                              {link.digest.summary}
                            </div>
                            {link.digest.keyElements?.length > 0 && (
                              <div className="mt-3 text-xs text-gray-500">
                                Elements: {link.digest.keyElements.map((el: any) => el.title).join(", ")}
                              </div>
                            )}
                            {link.digest.fileHighlights?.length > 0 && (
                              <div className="mt-2 text-xs text-gray-500">
                                Knowledge: {link.digest.fileHighlights.join(" | ")}
                              </div>
                            )}
                          </>
                        ) : (
                          <div className="text-xs text-gray-500">
                            No digest yet. Generate one to load knowledge from this project.
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-gray-500">No past projects linked yet.</div>
              )}
            </div>
          </div>

          <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
              <h3 className="font-semibold text-gray-900">Elements</h3>
              <div className="flex items-center gap-2">
                <input
                  value={newElementTitle}
                  onChange={(e) => setNewElementTitle(e.target.value)}
                  className="border border-gray-200 rounded-lg px-2 py-1 text-xs text-gray-700 bg-white"
                  placeholder="New element title"
                />
                <select
                  value={newElementType}
                  onChange={(e) => setNewElementType(e.target.value)}
                  className="border border-gray-200 rounded-lg px-2 py-1 text-xs text-gray-700 bg-white"
                >
                  <option value="build">Build</option>
                  <option value="rent">Rent</option>
                  <option value="print">Print</option>
                  <option value="transport">Transport</option>
                  <option value="install">Install</option>
                  <option value="subcontract">Subcontract</option>
                  <option value="mixed">Mixed</option>
                </select>
                <button
                  className="rounded-lg bg-black text-white px-3 py-1 text-xs font-semibold uppercase tracking-wider"
                  onClick={async () => {
                    const title = newElementTitle.trim();
                    if (!title) return;
                    await createElementFromStructured({
                      projectId,
                      title,
                      type: newElementType,
                    });
                    setNewElementTitle("");
                    setNewElementType("build");
                  }}
                >
                  Create
                </button>
                <span className="text-xs text-gray-400">
                  {overview.counts.elementCount} total
                </span>
              </div>
            </div>
            <div className="divide-y">
              {overview.elements.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  No elements yet. Use Studio Agent to create the first element.
                </div>
              ) : (
                overview.elements.map((element) => (
                  <div key={element.id} className="p-6 flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-gray-900">{element.title}</div>
                      <div className="text-xs text-gray-500 mt-1">
                        {element.type} · {element.status}
                      </div>
                    </div>
                    <div className="text-xs text-gray-400">
                      Updated {new Date(element.updatedAt).toLocaleDateString()}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="mt-10 bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
              <h3 className="font-semibold text-gray-900">Project Files</h3>
              <label className="inline-flex items-center gap-2 text-xs font-semibold text-gray-600 cursor-pointer">
                <UploadCloud size={14} /> Upload files
                <input
                  type="file"
                  multiple
                  className="hidden"
                  onChange={async (e) => {
                    if (!e.target.files) return;
                    for (const file of Array.from(e.target.files)) {
                      const uploadUrl = await generateUploadUrl({});
                      const result = await fetch(uploadUrl, {
                        method: "POST",
                        headers: { "Content-Type": file.type },
                        body: file,
                      });
                      const { storageId } = await result.json();
                      await saveUploadedFile({
                        projectId,
                        storageId,
                        fileName: file.name,
                        contentType: file.type,
                        size: file.size,
                      });
                    }
                  }}
                />
              </label>
            </div>
            <div className="divide-y">
              {files && files.length > 0 ? (
                files.map((file) => (
                  <div key={file._id} className="p-6">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="font-semibold text-gray-900">{file.fileName}</div>
                        <div className="text-xs text-gray-500">{Math.round(file.size / 1024)} KB</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          className="text-xs font-semibold text-gray-600 hover:text-gray-900"
                          onClick={() =>
                            setOpenFileId((prev) => (prev === file._id ? null : file._id))
                          }
                        >
                          {openFileId === file._id ? "Hide ingest" : "View ingest"}
                        </button>
                        <button
                          className="text-xs font-semibold text-red-600 hover:text-red-700"
                          onClick={async () => {
                            const ok = window.confirm(`Delete ${file.fileName}?`);
                            if (!ok) return;
                            await deleteProjectFile({ fileId: file._id });
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                    {file.summary ? (
                      <div className="mt-2 text-xs text-gray-600">{file.summary}</div>
                    ) : (
                      <div className="mt-2 text-xs text-gray-400">No extractable text.</div>
                    )}
                    {openFileId === file._id ? (
                      <div className="mt-4 rounded-lg border border-gray-100 bg-gray-50 p-4 text-xs text-gray-600 space-y-3">
                        <div>
                          <div className="text-[10px] uppercase font-semibold text-gray-400">Structured Summary</div>
                          <div className="mt-1 text-gray-700">
                            {file.extractedInfo?.summary ?? "No structured summary yet."}
                          </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div>
                            <div className="text-[10px] uppercase font-semibold text-gray-400">Topics</div>
                            <div className="mt-1">
                              {(file.extractedInfo?.topics ?? []).length > 0
                                ? file.extractedInfo.topics.join(", ")
                                : "—"}
                            </div>
                          </div>
                          <div>
                            <div className="text-[10px] uppercase font-semibold text-gray-400">Domain</div>
                            <div className="mt-1">{file.extractedInfo?.domain ?? "—"}</div>
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] uppercase font-semibold text-gray-400">Entities</div>
                          {(file.extractedInfo?.entities ?? []).length > 0 ? (
                            <div className="mt-1 flex flex-wrap gap-2">
                              {file.extractedInfo.entities.map((entity: any, idx: number) => (
                                <span
                                  key={`${entity.name}-${idx}`}
                                  className="rounded-full border border-gray-200 bg-white px-2 py-1 text-[10px]"
                                >
                                  {entity.name}
                                  {entity.type ? ` (${entity.type})` : ""}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <div className="mt-1">—</div>
                          )}
                        </div>
                        <div>
                          <div className="text-[10px] uppercase font-semibold text-gray-400">Facts</div>
                          {(file.extractedInfo?.facts ?? []).length > 0 ? (
                            <ul className="mt-1 list-disc pl-4 space-y-1">
                              {file.extractedInfo.facts.map((fact: string, idx: number) => (
                                <li key={`fact-${idx}`}>{fact}</li>
                              ))}
                            </ul>
                          ) : (
                            <div className="mt-1">—</div>
                          )}
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div>
                            <div className="text-[10px] uppercase font-semibold text-gray-400">Language</div>
                            <div className="mt-1">{file.extractedInfo?.language ?? "—"}</div>
                          </div>
                          <div>
                            <div className="text-[10px] uppercase font-semibold text-gray-400">Model</div>
                            <div className="mt-1">{file.extractedInfo?.model ?? "—"}</div>
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] uppercase font-semibold text-gray-400">Extracted Text</div>
                          <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap rounded-md border border-gray-200 bg-white p-2 text-[10px] text-gray-700">
                            {file.extractedText ?? "No extracted text stored."}
                          </pre>
                        </div>
                      </div>
                    ) : null}
                  </div>
                ))
              ) : (
                <div className="p-8 text-center text-gray-500">No files uploaded yet.</div>
              )}
            </div>
          </div>

          <div className="mt-10 pt-10 border-t border-red-100">
            <h3 className="text-lg font-bold text-red-600 mb-4 flex items-center gap-2">
              <AlertTriangle size={20} /> Danger Zone
            </h3>
            <div className="bg-red-50 border border-red-100 rounded-xl p-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <div className="font-bold text-red-900">Delete this project</div>
                  <p className="text-sm text-red-700 mt-1">
                    Once deleted, there is no going back. All project data will be permanently removed.
                  </p>
                </div>
                <button
                  onClick={handleDeleteProject}
                  disabled={isDeleting}
                  className="bg-red-600 hover:bg-red-700 text-white px-6 py-2 rounded-lg font-semibold flex items-center justify-center gap-2 disabled:opacity-50 transition-colors"
                >
                  {isDeleting ? (
                    "Deleting..."
                  ) : (
                    <>
                      <Trash2 size={18} /> Delete Project
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </>
      ) : (
        <ProjectKnowledgePanel projectId={projectId} />
      )}
    </div>
  );
}
function StatCard({
  title,
  value,
  icon: Icon,
}: {
  title: string;
  value: number | string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}) {
  return (
    <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-gray-100 text-gray-700">
          <Icon size={18} />
        </div>
        <div className="text-xs font-semibold uppercase tracking-wider text-gray-400">
          {title}
        </div>
      </div>
      <div className="mt-4 text-2xl font-bold text-gray-900">{value}</div>
    </div>
  );
}

function formatMoney(value: number, currency: string) {
  if (!Number.isFinite(value)) return "--";
  return `${value.toLocaleString()} ${currency}`;
}

const PROJECT_TYPES = [
  { id: "dressing", label: "Dressing" },
  { id: "studio_build", label: "Studio build" },
  { id: "event", label: "Event" },
  { id: "retail", label: "Retail" },
  { id: "exhibit", label: "Exhibit" },
  { id: "pop_up", label: "Pop-up" },
  { id: "other", label: "Other" },
];

const STATUS_OPTIONS = [
  { id: "lead", label: "Lead" },
  { id: "active", label: "Active" },
  { id: "production", label: "In Production" },
  { id: "done", label: "Done" },
  { id: "rejected", label: "Rejected" },
  { id: "archived", label: "Archived" },
];

function formatDateInput(timestamp?: number) {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function parseDateInput(value: string) {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : timestamp;
}

function parseNumberInput(value: string) {
  if (value === "") return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}
