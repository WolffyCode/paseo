import type { ConversationTreeNode, WorkspaceDetail } from "../model/types";
import { resolveNodeWorkspace, resolveProjectWorkspace } from "./project-workspace";
import type { WorkspaceHoverCardContent } from "./workspace-hover-card";

/** Build stable, kind-specific hover metadata from the tree's existing workspace snapshot. */
export function resolveHoverCardContent(
  node: ConversationTreeNode,
  details: ReadonlyMap<string, WorkspaceDetail>,
): WorkspaceHoverCardContent | null {
  if (node.kind === "project") {
    const workspace = resolveProjectWorkspace(node.id, details);
    if (workspace === null) return null;
    return {
      kind: "project",
      id: node.id,
      title: node.title,
      directory: workspace.detail.directory,
      branch: node.branch,
      diffStat: node.diffStat,
    };
  }
  const detail =
    node.kind === "subagent" && node.contextWorkspaceId !== null
      ? details.get(node.contextWorkspaceId)
      : resolveNodeWorkspace(node, details)?.detail;
  if (detail === undefined) return null;
  return {
    kind: "conversation",
    id: node.id,
    title: node.title,
    directory: detail.directory,
    updatedAt: node.updatedAt,
    providerId: node.providerId,
  };
}
