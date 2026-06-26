import type { AgentLifecycleStatus } from "@getpaseo/protocol/agent-lifecycle";
import { normalizeWorkspaceOpaqueId } from "@/utils/workspace-identity";
import type { ConversationTreeNode, ConversationTreeRow } from "./types";

/**
 * Minimal agent shape the tree needs — a structural subset of session-store's Agent, so the
 * selector stays pure and trivially testable (the render layer passes real agents directly).
 */
export interface ConversationTreeAgent {
  id: string;
  title: string | null;
  status: AgentLifecycleStatus;
  workspaceId?: string;
  parentAgentId: string | null;
  requiresAttention?: boolean;
  archivedAt?: Date | null;
  createdAt: Date;
}

/** Project grouping mapped from the sidebar's SidebarProjectEntry at the call site. */
export interface ConversationTreeProject {
  projectKey: string;
  projectName: string;
  workspaceIds: string[];
}

export interface BuildConversationTreeInput {
  serverId: string;
  agents: ConversationTreeAgent[];
  projects: ConversationTreeProject[];
}

/**
 * Derive the project → conversation → subagent tree from live agents + project grouping.
 * Root agents (parentAgentId === null) become conversations under the project their
 * workspaceId belongs to; descendants recurse via parentAgentId. Roots whose workspace maps
 * to no known project become loose conversations appended after the project nodes.
 * subagentCount is the total descendant count (角标显总数). Archived agents are dropped from
 * both nodes and counts.
 */
export function buildConversationTree(input: BuildConversationTreeInput): ConversationTreeNode[] {
  const liveAgents = input.agents.filter((agent) => !agent.archivedAt);

  const childrenByParent = new Map<string, ConversationTreeAgent[]>();
  for (const agent of liveAgents) {
    if (agent.parentAgentId === null) {
      continue;
    }
    const siblings = childrenByParent.get(agent.parentAgentId) ?? [];
    siblings.push(agent);
    childrenByParent.set(agent.parentAgentId, siblings);
  }

  const projectKeyByWorkspaceId = new Map<string, string>();
  for (const project of input.projects) {
    for (const workspaceId of project.workspaceIds) {
      const normalized = normalizeWorkspaceOpaqueId(workspaceId);
      if (normalized) {
        projectKeyByWorkspaceId.set(normalized, project.projectKey);
      }
    }
  }

  const rootsByProject = new Map<string, ConversationTreeAgent[]>();
  const looseRoots: ConversationTreeAgent[] = [];
  for (const agent of liveAgents) {
    if (agent.parentAgentId !== null) {
      continue;
    }
    const workspaceId = normalizeWorkspaceOpaqueId(agent.workspaceId);
    const projectKey = workspaceId ? projectKeyByWorkspaceId.get(workspaceId) : undefined;
    if (projectKey) {
      const roots = rootsByProject.get(projectKey) ?? [];
      roots.push(agent);
      rootsByProject.set(projectKey, roots);
    } else {
      looseRoots.push(agent);
    }
  }

  const nodes: ConversationTreeNode[] = [];
  for (const project of input.projects) {
    const roots = sortByCreatedAt(rootsByProject.get(project.projectKey) ?? []);
    nodes.push({
      kind: "project",
      id: project.projectKey,
      title: project.projectName,
      serverId: input.serverId,
      workspaceId: null,
      status: null,
      requiresAttention: false,
      subagentCount: 0,
      children: roots.map((root) =>
        buildAgentNode(root, "conversation", input.serverId, childrenByParent),
      ),
    });
  }
  for (const root of sortByCreatedAt(looseRoots)) {
    nodes.push(buildAgentNode(root, "conversation", input.serverId, childrenByParent));
  }
  return nodes;
}

// Build a conversation/subagent node and recurse into its children; subagentCount is the
// total descendant count so a single-layer renderer can still show the full subtree size.
function buildAgentNode(
  agent: ConversationTreeAgent,
  kind: "conversation" | "subagent",
  serverId: string,
  childrenByParent: Map<string, ConversationTreeAgent[]>,
): ConversationTreeNode {
  const childAgents = sortByCreatedAt(childrenByParent.get(agent.id) ?? []);
  const children = childAgents.map((child) =>
    buildAgentNode(child, "subagent", serverId, childrenByParent),
  );
  const subagentCount = children.reduce((sum, child) => sum + 1 + child.subagentCount, 0);
  return {
    kind,
    id: agent.id,
    title: agent.title?.trim() ?? "",
    serverId,
    workspaceId: normalizeWorkspaceOpaqueId(agent.workspaceId),
    status: agent.status,
    requiresAttention: agent.requiresAttention ?? false,
    subagentCount,
    children,
  };
}

function sortByCreatedAt(agents: ConversationTreeAgent[]): ConversationTreeAgent[] {
  return [...agents].sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime());
}

export interface FlattenConversationTreeOptions {
  collapsedProjectKeys: ReadonlySet<string>;
  collapsedConversationIds: ReadonlySet<string>;
  maxDepth: number;
}

/**
 * Flatten the tree into render-ready rows. A node renders its children only when the next
 * depth is within maxDepth (本轮卡单层) and the node isn't collapsed. A node with children
 * below the cap reports canExpand=false (no chevron; the badge shows the count instead).
 */
export function flattenConversationTreeRows(
  nodes: ConversationTreeNode[],
  options: FlattenConversationTreeOptions,
): ConversationTreeRow[] {
  const rows: ConversationTreeRow[] = [];
  const visit = (node: ConversationTreeNode, depth: number) => {
    const childrenWithinCap = depth + 1 <= options.maxDepth;
    // 项目(目录)即使没有对话也可展开 —— 展开后渲染层显示"暂无对话"(反馈, 对齐 Codex);
    // 对话/subagent 仍需真有子节点才显示 chevron。
    const canExpand =
      node.kind === "project" ? childrenWithinCap : node.children.length > 0 && childrenWithinCap;
    const isExpanded = canExpand && !isNodeCollapsed(node, options);
    rows.push({ node, depth, canExpand, isExpanded });
    if (isExpanded) {
      for (const child of node.children) {
        visit(child, depth + 1);
      }
    }
  };
  for (const node of nodes) {
    visit(node, 0);
  }
  return rows;
}

// Projects collapse by projectKey; conversations/subagents collapse by agent id.
function isNodeCollapsed(
  node: ConversationTreeNode,
  options: FlattenConversationTreeOptions,
): boolean {
  return node.kind === "project"
    ? options.collapsedProjectKeys.has(node.id)
    : options.collapsedConversationIds.has(node.id);
}
