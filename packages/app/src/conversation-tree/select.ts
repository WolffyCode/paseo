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
  /** workspaceId → 用户可见的 workspace 显示名(rename 后会变); 顶层对话用它当标题, 否则回退 agent.title。 */
  workspaceDisplayById?: ReadonlyMap<string, string>;
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
        buildAgentNode(
          root,
          "conversation",
          input.serverId,
          childrenByParent,
          input.workspaceDisplayById,
        ),
      ),
    });
  }
  for (const root of sortByCreatedAt(looseRoots)) {
    nodes.push(
      buildAgentNode(
        root,
        "conversation",
        input.serverId,
        childrenByParent,
        input.workspaceDisplayById,
      ),
    );
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
  workspaceDisplayById?: ReadonlyMap<string, string>,
): ConversationTreeNode {
  const childAgents = sortByCreatedAt(childrenByParent.get(agent.id) ?? []);
  const children = childAgents.map((child) =>
    buildAgentNode(child, "subagent", serverId, childrenByParent, workspaceDisplayById),
  );
  const subagentCount = children.reduce((sum, child) => sum + 1 + child.subagentCount, 0);
  const workspaceId = normalizeWorkspaceOpaqueId(agent.workspaceId);
  // 顶层对话标题优先用 workspace 显示名 —— 对话 rename 改的是 workspace title, 经此反映到树上;
  // subagent 没有独立 workspace, 仍用 agent.title(反馈: 对话重命名保存后名称不变)。
  const workspaceDisplay =
    kind === "conversation" && workspaceId ? workspaceDisplayById?.get(workspaceId) : undefined;
  const agentTitle = agent.title?.trim() ?? "";
  return {
    kind,
    id: agent.id,
    title: workspaceDisplay && workspaceDisplay.length > 0 ? workspaceDisplay : agentTitle,
    serverId,
    workspaceId,
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

/** Structural mirror of the pin store's PinTarget (kept dep-free so this selector stays pure/testable). */
export type ConversationTreePinTarget =
  | { kind: "project"; projectKey: string }
  | { kind: "workspace"; workspaceId: string }
  | { kind: "agent"; agentId: string };

export interface PartitionPinnedNodesInput {
  projectNodes: ConversationTreeNode[];
  looseNodes: ConversationTreeNode[];
  pinnedTargets: readonly ConversationTreePinTarget[] | undefined;
}

export interface PartitionPinnedNodesResult {
  /** Pinned projects (whole subtree) followed by lifted/loose pinned conversations — the 置顶 group. */
  pinnedNodes: ConversationTreeNode[];
  /** Projects keep their 项目 slot, minus any pinned root conversations lifted up into 置顶. */
  unpinnedProjectNodes: ConversationTreeNode[];
  /** Loose conversations that aren't pinned (the 对话 group). */
  unpinnedLooseNodes: ConversationTreeNode[];
}

/**
 * Split the top-level tree into the 置顶 group + the regular 项目 / 对话 groups (反馈 #12). A pinned
 * project moves whole; a pinned root conversation is lifted out of its (unpinned) project into 置顶 so
 * the pin has a visible effect regardless of where the conversation lived. Order isn't re-sorted —
 * pinned projects keep tree order, then the lifted/loose pinned conversations follow.
 */
export function partitionPinnedNodes(input: PartitionPinnedNodesInput): PartitionPinnedNodesResult {
  const pinnedProjectKeys = new Set<string>();
  const pinnedWorkspaceIds = new Set<string>();
  for (const target of input.pinnedTargets ?? []) {
    if (target.kind === "project") {
      pinnedProjectKeys.add(target.projectKey);
    } else if (target.kind === "workspace") {
      const id = normalizeWorkspaceOpaqueId(target.workspaceId);
      if (id) pinnedWorkspaceIds.add(id);
    }
  }

  const pinnedProjects: ConversationTreeNode[] = [];
  const pinnedConversations: ConversationTreeNode[] = [];
  const unpinnedProjectNodes: ConversationTreeNode[] = [];
  for (const project of input.projectNodes) {
    if (pinnedProjectKeys.has(project.id)) {
      pinnedProjects.push(project);
      continue;
    }
    const remaining: ConversationTreeNode[] = [];
    for (const child of project.children) {
      if (child.workspaceId && pinnedWorkspaceIds.has(child.workspaceId)) {
        pinnedConversations.push(child);
      } else {
        remaining.push(child);
      }
    }
    // Only clone the project node when a child was actually lifted (stable identity otherwise).
    unpinnedProjectNodes.push(
      remaining.length === project.children.length ? project : { ...project, children: remaining },
    );
  }

  const unpinnedLooseNodes: ConversationTreeNode[] = [];
  for (const loose of input.looseNodes) {
    if (loose.workspaceId && pinnedWorkspaceIds.has(loose.workspaceId)) {
      pinnedConversations.push(loose);
    } else {
      unpinnedLooseNodes.push(loose);
    }
  }

  return {
    pinnedNodes: [...pinnedProjects, ...pinnedConversations],
    unpinnedProjectNodes,
    unpinnedLooseNodes,
  };
}
