import type { AgentLifecycleStatus } from "@getpaseo/protocol/agent-lifecycle";

export type ConversationTreeNodeKind = "project" | "conversation" | "subagent";

/**
 * One node in the left-column conversation tree: a project (目录) or an agent
 * conversation/subagent. `children` holds the full recursion — filled even past the
 * rendered depth — so un-capping the renderer later needs zero selector/data changes.
 */
export interface ConversationTreeNode {
  kind: ConversationTreeNodeKind;
  /** project: projectKey; conversation/subagent: agentId. */
  id: string;
  title: string;
  serverId: string;
  workspaceId: string | null;
  /** Lifecycle status for agent nodes; null for project nodes. */
  status: AgentLifecycleStatus | null;
  requiresAttention: boolean;
  /** Total descendant subagent count (角标显总数); 0 for project nodes. */
  subagentCount: number;
  children: ConversationTreeNode[];
}

/** A flattened, render-ready row: a node plus its visual depth + expand affordance. */
export interface ConversationTreeRow {
  node: ConversationTreeNode;
  depth: number;
  /** Has children that fall within the render depth cap (drives chevron visibility). */
  canExpand: boolean;
  /** canExpand and not collapsed (children are emitted as following rows). */
  isExpanded: boolean;
}
