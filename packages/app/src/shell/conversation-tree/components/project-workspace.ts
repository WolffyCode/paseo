import type { ConversationTreeNode, WorkspaceDetail } from "../model/types";

export interface NodeWorkspace {
  readonly workspaceId: string;
  readonly detail: WorkspaceDetail;
}

/** Resolve a project's main directory-backed workspace, falling back to any known workspace. */
export function resolveProjectWorkspace(
  projectId: string,
  details: ReadonlyMap<string, WorkspaceDetail>,
): NodeWorkspace | null {
  let fallback: NodeWorkspace | null = null;
  for (const [workspaceId, detail] of details) {
    if (detail.projectId !== projectId) continue;
    const workspace = { workspaceId, detail };
    if (detail.workspaceKind === "local_checkout" || detail.workspaceKind === "directory") {
      return workspace;
    }
    fallback ??= workspace;
  }
  return fallback;
}

/** Resolve the first directory-backed workspace represented by a rendered node branch. */
export function resolveNodeWorkspace(
  node: ConversationTreeNode,
  details: ReadonlyMap<string, WorkspaceDetail>,
): NodeWorkspace | null {
  if (node.workspaceId !== null) {
    const detail = details.get(node.workspaceId);
    if (detail !== undefined) {
      return { workspaceId: node.workspaceId, detail };
    }
  }
  for (const child of node.children) {
    const workspace = resolveNodeWorkspace(child, details);
    if (workspace !== null) {
      return workspace;
    }
  }
  return null;
}
