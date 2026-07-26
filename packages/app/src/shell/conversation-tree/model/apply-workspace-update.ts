import type { WorkspaceDescriptorPayload } from "@getpaseo/protocol/messages";
import type { WorkspaceDetail } from "./types";

/** Fold a live or initial workspace descriptor into the shared title and hover-card snapshot. */
export function applyWorkspaceUpdate(
  details: ReadonlyMap<string, WorkspaceDetail>,
  workspace: WorkspaceDescriptorPayload,
): ReadonlyMap<string, WorkspaceDetail> {
  const title = workspace.name.trim();
  const diffStat = workspace.diffStat
    ? { added: workspace.diffStat.additions, removed: workspace.diffStat.deletions }
    : null;
  const next = new Map(details);
  next.set(workspace.id, {
    projectId: workspace.projectId,
    workspaceKind: workspace.workspaceKind,
    title: title.length > 0 ? title : null,
    directory: workspace.workspaceDirectory,
    branch: workspace.gitRuntime?.currentBranch ?? null,
    lastChangeAt: workspace.activityAt,
    diffStat,
  });
  return next;
}
