import type {
  ConversationTreeConversationNode,
  ConversationTreeNode,
  ConversationTreePinTarget,
  ConversationTreeProjectNode,
} from "./types";
import { normalizeWorkspaceId } from "./workspace-id";

export interface PartitionPinnedNodesInput {
  readonly nodes: readonly ConversationTreeNode[];
  readonly pins: readonly ConversationTreePinTarget[];
}

export interface PartitionPinnedNodesResult {
  readonly pinned: ConversationTreeNode[];
  readonly projects: ConversationTreeProjectNode[];
  readonly loose: ConversationTreeConversationNode[];
}

/** Split top-level nodes into pinned, project, and loose groups while retaining stable references. */
export function partitionPinnedNodes(input: PartitionPinnedNodesInput): PartitionPinnedNodesResult {
  const pinnedProjectKeys = new Set<string>();
  const pinnedWorkspaceIds = new Set<string>();
  for (const target of input.pins) {
    if (target.kind === "project") {
      pinnedProjectKeys.add(target.projectKey);
      continue;
    }
    const workspaceId = normalizeWorkspaceId(target.workspaceId);
    if (workspaceId !== null) {
      pinnedWorkspaceIds.add(workspaceId);
    }
  }

  const pinnedProjects: ConversationTreeProjectNode[] = [];
  const pinnedConversations: ConversationTreeConversationNode[] = [];
  const projects: ConversationTreeProjectNode[] = [];
  const loose: ConversationTreeConversationNode[] = [];

  for (const node of input.nodes) {
    if (node.kind === "project") {
      if (pinnedProjectKeys.has(node.id)) {
        pinnedProjects.push(node);
        continue;
      }
      const remainingChildren: ConversationTreeConversationNode[] = [];
      for (const child of node.children) {
        const workspaceId = normalizeWorkspaceId(child.workspaceId);
        if (workspaceId !== null && pinnedWorkspaceIds.has(workspaceId)) {
          pinnedConversations.push(child);
        } else {
          remainingChildren.push(child);
        }
      }
      const projectNode =
        remainingChildren.length === node.children.length
          ? node
          : { ...node, children: remainingChildren };
      projects.push(projectNode);
      continue;
    }
    if (node.kind === "subagent") {
      continue;
    }
    const workspaceId = normalizeWorkspaceId(node.workspaceId);
    if (workspaceId !== null && pinnedWorkspaceIds.has(workspaceId)) {
      pinnedConversations.push(node);
    } else {
      loose.push(node);
    }
  }

  return {
    pinned: [...pinnedProjects, ...pinnedConversations],
    projects,
    loose,
  };
}
