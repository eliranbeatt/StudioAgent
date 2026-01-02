"use client";

import { useMutation, useQuery, useAction } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";
import { use, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Layers, Wallet, ClipboardCheck, UploadCloud } from "lucide-react";

export default function OverviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const projectId = id as Id<"projects">;
  const overview = useQuery(api.projects.getOverview, { id: projectId });
  const files = useQuery(api.files.listProjectFiles, { projectId });
  const allProjects = useQuery(api.projects.listProjects, { excludeId: projectId });
  const linkedProjects = useQuery(api.projects.listLinkedProjects, { projectId });
  const generateUploadUrl = useMutation(api.files.generateUploadUrl);
  const saveUploadedFile = useAction(api.files.saveUploadedFile);

  const createElementFromStructured = useMutation(api.agent.createElementFromStructured);
  const updateProjectDetails = useMutation(api.projects.updateProjectDetails);
  const linkProject = useMutation(api.projects.linkProject);
  const unlinkProject = useMutation(api.projects.unlinkProject);
  const generateProjectDigest = useMutation(api.projects.generateProjectDigest);
  const generateOverviewSummary = useAction(api.projects.generateOverviewSummary);

  const [isSavingDetails, setIsSavingDetails] = useState(false);
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [formState, setFormState] = useState({
    description: "",
    eventDate: "",
    budgetCap: "",
    projectTypes: [] as string[],
  });
  const [newElementTitle, setNewElementTitle] = useState("");
  const [newElementType, setNewElementType] = useState("build");

  useEffect(() => {
    if (!overview?.project) return;
    setFormState({
      description: overview.project.description ?? "",
      eventDate: formatDateInput(overview.project.details?.eventDate),
      budgetCap:
        overview.project.details?.budgetCap !== undefined
          ? String(overview.project.details?.budgetCap ?? "")
          : "",
      projectTypes: overview.project.projectTypes ?? [],
    });
  }, [overview?.project]);

  const availableProjects = useMemo(() => {
    if (!allProjects) return [];
    const linkedIds = new Set((linkedProjects ?? []).map((link: any) => link.project?.id));
    return allProjects.filter((project) => !linkedIds.has(project.id));
  }, [allProjects, linkedProjects]);

  if (!overview) {
    return <div className="p-8 text-gray-500">Loading overview...</div>;
  }

  const baselineSell = Number(overview.baseline?.totals?.grandTotal ?? 0);
  const approvedCO = Number(overview.approvedCO?.sellPrice ?? 0);
  const effectiveBudget = baselineSell + approvedCO;

  return (
    <div className="p-8 max-w-6xl mx-auto text-black">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-3xl font-bold">{overview.project.name}</h2>
          <p className="text-sm text-gray-500 mt-1">
            Status: <span className="font-medium text-gray-700">{overview.project.status}</span>
          </p>
        </div>
        <div className="px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider bg-gray-100 text-gray-600">
          {overview.project.currency}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-10">
        <StatCard
          title="Elements"
          value={overview.counts.elementCount}
          icon={Layers}
        />
        <StatCard
          title="Graveyard"
          value={overview.counts.graveyardCount}
          icon={AlertTriangle}
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
          <div className="p-6 text-sm text-gray-700 whitespace-pre-wrap">
            {overview.project.overviewSummary && overview.project.overviewSummary.trim().length > 0
              ? overview.project.overviewSummary
              : "No project summary yet. Generate one from elements and knowledge."}
          </div>
        </div>

        <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
            <h3 className="font-semibold text-gray-900">Project Details</h3>
          </div>
          <div className="p-6 space-y-4 text-sm">
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
                  const eventDate = parseDateInput(formState.eventDate);
                  const budgetCap = parseNumberInput(formState.budgetCap);
                  await updateProjectDetails({
                    id: projectId,
                    description: formState.description,
                    projectTypes: formState.projectTypes,
                    details: {
                      eventDate: eventDate ?? undefined,
                      budgetCap: budgetCap ?? undefined,
                    },
                  });
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
                <div className="flex items-center justify-between">
                  <div className="font-semibold text-gray-900">{file.fileName}</div>
                  <div className="text-xs text-gray-500">{Math.round(file.size / 1024)} KB</div>
                </div>
                {file.summary ? (
                  <div className="mt-2 text-xs text-gray-600">{file.summary}</div>
                ) : (
                  <div className="mt-2 text-xs text-gray-400">No extractable text.</div>
                )}
              </div>
            ))
          ) : (
            <div className="p-8 text-center text-gray-500">No files uploaded yet.</div>
          )}
        </div>
      </div>
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
