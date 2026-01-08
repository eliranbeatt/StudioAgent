import { Id } from "../../../../../../convex/_generated/dataModel";

export type TaskPhoto = { url?: string; label?: string };
export type TaskSubtask = { id?: string; title?: string; status?: string };
export type TaskChecklistItem = {
  id: string;
  title: string;
  description?: string;
  workType?: string;
  estimatedMinutes?: number;
  order: number;
  done: boolean;
  dependsOnItemIds?: string[];
};
export type MaterialLine = {
  id: string;
  name: string;
  qty: number;
  unitCost: number;
  actualQty?: number;
  actualUnitCost?: number;
};
export type LaborLine = {
  id: string;
  role: string;
  qty: number;
  rate: number;
  actualQty?: number;
  actualRate?: number;
};

export type Task = {
  id: string; // convex ID
  title: string;
  description?: string;
  domain?: string;
  status?: string;
  priority?: string;
  category?: string;
  startDate?: string;
  endDate?: string;
  dueDate?: number;
  estimatedMinutes?: number;
  stage?: string;
  workType?: string;
  plannedStartDate?: string;
  plannedEndDate?: string;
  checklist?: TaskChecklistItem[];
  dependencies?: string[];
  steps?: string[];
  subtasks?: TaskSubtask[];
  assignee?: string;
  photos?: TaskPhoto[];
  materials?: MaterialLine[];
  labor?: LaborLine[];
  elementId: string;
  elementTitle: string;
  
  // New fields
  isDraft?: boolean;
  draftOfTaskId?: string; // Id<"tasks">
  draftRevisionId?: string; // Id<"taskRevisions">
  elementSubtaskId?: string;
  aiThreadId?: string; // Id<"conversations">
  draftPatch?: Partial<Task>;
  
  draftId?: string;
  revisionNumber?: number;
};

export type TaskViewMode = "kanban" | "gantt" | "elements" | "studio";

export type TaskFilters = {
    assignee?: string;
    category?: string;
    status?: string;
    elementId?: string;
    search?: string;
};
