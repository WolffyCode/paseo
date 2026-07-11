import type { ConversationTreeNode, WorkspaceDetail } from "../model/types";

export interface NodeWorkspace {
  readonly workspaceId: string;
  readonly detail: WorkspaceDetail;
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
