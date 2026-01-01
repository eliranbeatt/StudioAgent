const PROJECT_SECTION_ID = "brain_project";
const UNMAPPED_SECTION_ID = "brain_unmapped";

type BrainSection = {
  id: string;
  title: string;
  scope: "project" | "unmapped" | "element";
  elementId?: string;
  content: string;
  updatedAt: number;
  lastAutoAppendAt?: number;
  lastSyncedApprovedSnapshotId?: string;
  dirtySinceLastSync?: boolean;
};

export function buildDefaultSections(now: number): BrainSection[] {
  return [
    {
      id: PROJECT_SECTION_ID,
      title: "Project",
      scope: "project",
      content: "",
      updatedAt: now,
    },
    {
      id: UNMAPPED_SECTION_ID,
      title: "Unmapped",
      scope: "unmapped",
      content: "",
      updatedAt: now,
    },
  ];
}

export function buildElementSection(args: {
  elementId: string;
  title: string;
  now: number;
}): BrainSection {
  return {
    id: buildElementSectionId(args.elementId),
    title: args.title,
    scope: "element",
    elementId: args.elementId,
    content: "",
    updatedAt: args.now,
    dirtySinceLastSync: false,
  };
}

export function buildElementSectionId(elementId: string) {
  return `brain_element_${elementId}`;
}

export function getDefaultSectionIds() {
  return {
    project: PROJECT_SECTION_ID,
    unmapped: UNMAPPED_SECTION_ID,
  };
}
