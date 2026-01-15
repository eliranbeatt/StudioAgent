"use client";

import { useMutation, useQuery, useAction } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";
import { use, useCallback, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Task, TaskFilters, TaskViewMode } from "./_components/types";
import { TasksTopBar } from "./_components/TasksTopBar";
import { TaskControlsBar } from "./_components/TaskControlsBar";
import { KanbanBoard } from "./_components/KanbanBoard";
import { GanttView } from "./_components/GanttView";
import { StudioBoard } from "./_components/StudioBoard";
import { ElementsGroupedList } from "./_components/ElementsGroupedList";
import { InstallModeView } from "./_components/InstallModeView";
import { TaskModal } from "./_components/TaskModal";
import { TrelloConfigModal } from "./_components/TrelloConfigModal";

export default function TasksPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const projectId = id as Id<"projects">;
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    // Queries & Mutations
    const data = useQuery(api.tasks.listForProject, { projectId });
    const updateTask = useMutation(api.tasks.updateTask);
    const createTask = useMutation(api.tasks.createTask);
    const upsertDraft = useMutation(api.taskRevisions.upsertDraft);
    const runEstimator = useMutation(api.agent_tasks.runEstimator);
    const taskOrder = useQuery(api.projects.getTaskOrder, { projectId });
    const updateTaskOrder = useMutation(api.projects.updateTaskOrder);
    const employees = useQuery(api.management.listEmployees);

    // Trello
    const trelloConfig = useQuery(api.trelloSync.getConfig, { projectId });
    const saveTrelloConfig = useMutation(api.trelloSync.saveConfig);
    const syncTrello = useAction(api.trelloSync.sync);
    const fetchBoards = useAction(api.trelloSync.listBoards);
    const fetchLists = useAction(api.trelloSync.listLists);
    const createBoard = useAction(api.trelloSync.createBoard);

    // State
    const [view, setView] = useState<TaskViewMode>("kanban");
    const [filters, setFilters] = useState<TaskFilters>({});
    const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
    const [draftTask, setDraftTask] = useState<Partial<Task> | null>(null);
    const [isEstimating, setIsEstimating] = useState(false);
    const [savingTaskId, setSavingTaskId] = useState<string | null>(null);
    const [modalSaving, setModalSaving] = useState(false);
    const [showTrelloConfig, setShowTrelloConfig] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);

    const openImprove = useCallback(() => {
        const params = new URLSearchParams(searchParams.toString());
        params.set("improve", "1");
        router.replace(`${pathname}?${params.toString()}`);
    }, [pathname, router, searchParams]);

    // Raw Data
    const rawTasks = (data?.tasks ?? []) as Task[];
    const employeeOptions = useMemo(
        () =>
            (employees ?? []).map((employee) => ({
                id: employee._id,
                name: employee.displayName,
            })),
        [employees]
    );
    const employeeNameById = useMemo(
        () => new Map(employeeOptions.map((employee) => [employee.id, employee.name])),
        [employeeOptions]
    );

    const getAssigneeLabel = useCallback((task: Task) => {
        const ids = task.assigneeIds ?? [];
        const names = ids
            .map((id) => employeeNameById.get(id))
            .filter((name): name is string => Boolean(name));
        if (names.length > 0) return names.join(", ");
        return task.assignee ?? "";
    }, [employeeNameById]);

    // 1. Compute Effective Tasks
    const effectiveTasks = useMemo(() => {
        return rawTasks.map(t => {
            if (t.draftPatch) {
                return { ...t, ...t.draftPatch, isDraft: true };
            }
            return t;
        });
    }, [rawTasks]);

    // 2. Filter Tasks
    const filteredTasks = useMemo(() => {
        let result = effectiveTasks;

        if (filters.search) {
            const lower = filters.search.toLowerCase();
            result = result.filter(t =>
                t.title.toLowerCase().includes(lower) ||
                t.elementTitle.toLowerCase().includes(lower) ||
                getAssigneeLabel(t).toLowerCase().includes(lower)
            );
        }

        if (filters.assignee) {
            result = result.filter(t => getAssigneeLabel(t) === filters.assignee);
        }

        if (filters.category) {
            result = result.filter(t => t.category === filters.category);
        }

        if (filters.elementId) {
            result = result.filter(t => t.elementId === filters.elementId);
        }

        return result;
    }, [effectiveTasks, filters, getAssigneeLabel]);

    // Derived Options
    const filterOptions = useMemo(() => {
        const assignees = new Set<string>();
        const categories = new Set<string>();

        effectiveTasks.forEach(t => {
            const label = getAssigneeLabel(t);
            if (label) assignees.add(label);
            if (t.category) categories.add(t.category);
        });

        employeeOptions.forEach((employee) => {
            if (employee.name) assignees.add(employee.name);
        });

        return {
            assignees: Array.from(assignees).sort(),
            categories: Array.from(categories).sort(),
            elements: data?.elements.map(e => ({ id: e.elementId, title: e.elementTitle })) ?? []
        };
    }, [effectiveTasks, data?.elements, employeeOptions, getAssigneeLabel]);

    // Maps
    const taskById = useMemo(() => new Map(effectiveTasks.map((t) => [t.id, t])), [effectiveTasks]);

    // Handlers
    const handleStatusChange = async (taskId: string, newStatus: string) => {
        setSavingTaskId(taskId);
        try {
            await updateTask({
                taskId: taskId as Id<"tasks">,
                patch: { status: newStatus }
            });
        } catch (e) {
            console.error("Failed to update status", e);
        } finally {
            setSavingTaskId(null);
        }
    };

    const handleDomainChange = async (taskId: string, newDomain: string) => {
        setSavingTaskId(taskId);
        try {
            await updateTask({
                taskId: taskId as Id<"tasks">,
                patch: { category: newDomain }
            });
        } catch (e) {
            console.error("Failed to update domain", e);
        } finally {
            setSavingTaskId(null);
        }
    };

    const handleOrderChange = async (newOrder: Record<string, string[]>) => {
        await updateTaskOrder({
            projectId,
            columnOrder: newOrder
        });
    };

    const handleTaskSave = async (patch: Partial<Task>) => {
        if (!selectedTaskId) return;
        setModalSaving(true);
        try {
            const { elementTitle, ...cleanPatch } = patch;
            await updateTask({
                taskId: selectedTaskId as Id<"tasks">,
                patch: cleanPatch
            });
        } catch (e) {
            console.error("Failed to save task", e);
        } finally {
            setModalSaving(false);
        }
    };

    const handleCreateTask = async (patch: Partial<Task>) => {
        setModalSaving(true);
        try {
            await createTask({
                projectId,
                title: patch.title ?? "New Task",
                description: patch.description,
                status: patch.status ?? "todo",
                priority: patch.priority,
                category: patch.category,
                startDate: patch.startDate,
                endDate: patch.endDate,
                estimatedMinutes: patch.estimatedMinutes,
                assigneeIds: patch.assigneeIds,
                checklist: patch.checklist,
                elementId: patch.elementId as Id<"elements">,
            });
            setDraftTask(null);
        } catch (e) {
            console.error("Failed to create task", e);
        } finally {
            setModalSaving(false);
        }
    };

    const handleAddTask = () => {
        setDraftTask({
            id: "new-task",
            title: "New Task",
            status: "todo",
            priority: "normal",
            checklist: [],
            elementTitle: "General",
            description: "",
        });
    };

    const handleChecklistToggle = async (taskId: string, itemId: string) => {
        const task = taskById.get(taskId);
        if (!task?.checklist) return;
        const nextChecklist = task.checklist.map((item) =>
            item.id === itemId ? { ...item, done: !item.done } : item
        );
        try {
            await updateTask({
                taskId: taskId as Id<"tasks">,
                patch: { checklist: nextChecklist },
            });
        } catch (e) {
            console.error("Failed to update checklist", e);
        }
    };

    const handleEstimate = async () => {
        setIsEstimating(true);
        try {
            await runEstimator({ projectId });
        } catch (e) {
            console.error(e);
        } finally {
            setIsEstimating(false);
        }
    };


    const handleSyncTrello = async () => {
        if (!trelloConfig || !trelloConfig.boardId) {
            setShowTrelloConfig(true);
            return;
        }

        setIsSyncing(true);
        try {
            const result = await syncTrello({ projectId });
            alert(`Sync complete! Created: ${result.created}, Updated: ${result.updated}, Errors: ${result.errors || 0}`);
        } catch (e: any) {
            alert("Sync failed: " + e.message);
        } finally {
            setIsSyncing(false);
        }
    };

    const handleSaveTrelloConfig = async (config: any) => {
        await saveTrelloConfig({ projectId, config });
    };

    // Derived views
    const elementsWithTasks = useMemo(() => {
        if (!data?.elements) return [];
        const tasksByEl = new Map<string, Task[]>();
        filteredTasks.forEach(t => {
            const list = tasksByEl.get(t.elementId) ?? [];
            list.push(t);
            tasksByEl.set(t.elementId, list);
        });

        return data.elements.map(e => ({
            ...e,
            tasks: tasksByEl.get(e.elementId) ?? []
        })).filter(e => e.tasks.length > 0 || view === "elements");
    }, [data?.elements, filteredTasks, view]);

    if (!data) return <div className="p-8 text-gray-500">Loading...</div>;

    const selectedTask = selectedTaskId ? taskById.get(selectedTaskId) : null;

    return (
        <div className="p-6 max-w-[1600px] mx-auto text-black h-screen flex flex-col">
            <div className="flex justify-end mb-4">
                <button
                    onClick={openImprove}
                    className="text-xs font-semibold uppercase tracking-wider px-3 py-2 rounded-full border border-blue-200 text-blue-700 hover:bg-blue-50"
                >
                    AI Improve
                </button>
            </div>
            <TasksTopBar
                onEstimate={handleEstimate}
                isEstimating={isEstimating}
                onSyncTrello={handleSyncTrello}
                onConfigureTrello={() => setShowTrelloConfig(true)}
                taskCount={filteredTasks.length}
                elementCount={data.elements.length}
                onAddTask={handleAddTask}
            />

            <TaskControlsBar
                view={view}
                setView={setView}
                filters={filters}
                setFilters={setFilters}
                assignees={filterOptions.assignees}
                categories={filterOptions.categories}
                elements={filterOptions.elements}
            />

            {isSyncing && (
                <div className="bg-blue-50 text-blue-700 px-4 py-2 rounded-lg mb-4 text-sm flex items-center gap-2">
                    <div className="animate-spin rounded-full h-3 w-3 border-2 border-blue-700 border-t-transparent"></div>
                    Syncing with Trello...
                </div>
            )}

            <div className="flex-1 overflow-hidden min-h-0">
                {view === "kanban" && (
                    <KanbanBoard
                        tasks={filteredTasks}
                        columnOrder={taskOrder}
                        onTaskClick={setSelectedTaskId}
                        onStatusChange={handleStatusChange}
                        onOrderChange={handleOrderChange}
                        onChecklistToggle={handleChecklistToggle}
                        savingTaskId={savingTaskId}
                    />
                )}

                {view === "gantt" && (
                    <div className="h-full overflow-y-auto">
                        <GanttView
                            tasks={filteredTasks}
                            onTaskClick={setSelectedTaskId}
                        />
                    </div>
                )}

                {view === "studio" && (
                    <div className="h-full overflow-y-auto">
                        <StudioBoard
                            tasks={filteredTasks}
                            onTaskClick={setSelectedTaskId}
                            onDomainChange={handleDomainChange}
                            onChecklistToggle={handleChecklistToggle}
                            savingTaskId={savingTaskId}
                        />
                    </div>
                )}

                {view === "elements" && (
                    <div className="h-full overflow-y-auto">
                        <ElementsGroupedList
                            elements={elementsWithTasks}
                            onTaskClick={setSelectedTaskId}
                            onChecklistToggle={handleChecklistToggle}
                        />
                    </div>
                )}

                {view === "install" && (
                    <div className="h-full overflow-y-auto">
                        <InstallModeView projectId={projectId} />
                    </div>
                )}
            </div>

            {selectedTask && (
                <TaskModal
                    task={selectedTask}
                    employees={employeeOptions}
                    elements={filterOptions.elements}
                    onClose={() => setSelectedTaskId(null)}
                    onSave={handleTaskSave}
                    draftMode={!!selectedTask.isDraft}
                    isSaving={modalSaving}
                />
            )}

            {draftTask && (
                <TaskModal
                    task={draftTask as Task}
                    employees={employeeOptions}
                    elements={filterOptions.elements}
                    onClose={() => setDraftTask(null)}
                    onSave={handleCreateTask}
                    draftMode={false}
                    isSaving={modalSaving}
                />
            )}

            {showTrelloConfig && (
                <TrelloConfigModal
                    initialConfig={trelloConfig as any}
                    onSave={handleSaveTrelloConfig}
                    onClose={() => setShowTrelloConfig(false)}
                    fetchBoards={(creds) => fetchBoards({ creds })}
                    fetchLists={(boardId, creds) => fetchLists({ boardId, creds })}
                    onCreateBoard={(name, creds) => createBoard({ name, creds })}
                />
            )}
        </div>
    );
}
