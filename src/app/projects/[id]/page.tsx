"use client";

import { useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";

export default function ProjectIndexPage() {
  const router = useRouter();
  const params = useParams();
  const rawId = params.id as string;

  const resolved = useQuery(api.projects.resolveProjectId, { id: rawId });
  const projectId = resolved?.projectId;

  const hasTasks = useQuery(
    api.projects.hasTasks,
    projectId ? { projectId: projectId as Id<"projects"> } : "skip"
  );

  useEffect(() => {
    // Wait until both project ID is resolved and hasTasks query is done
    if (!projectId || hasTasks === undefined) return;

    if (hasTasks) {
      router.replace(`/projects/${projectId}/sdk-agent`);
    } else {
      router.replace(`/projects/${projectId}/overview`);
    }
  }, [projectId, hasTasks, router]);

  return (
    <div className="flex items-center justify-center h-full bg-gray-50">
      <div className="text-gray-500 flex flex-col items-center gap-2">
        <div className="w-6 h-6 border-2 border-gray-300 border-t-black rounded-full animate-spin" />
        <span className="text-sm">Redirecting...</span>
      </div>
    </div>
  );
}
