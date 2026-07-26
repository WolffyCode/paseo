import type { AgentLifecycleStatus } from "@getpaseo/protocol/agent-lifecycle";
import type { WorkspaceDescriptorPayload } from "@getpaseo/protocol/messages";

export type ConversationTreeNodeKind = "project" | "conversation" | "subagent";
export type ConversationRunStatus =
  | "running"
  | "needsAttention"
  | "idle"
  | "error"
  | "initializing";
export type ConversationAttentionReason = "finished" | "error" | "permission" | null;
export type ConversationAttentionKind = "permission" | "reply" | null;
export type WorkspaceKind = WorkspaceDescriptorPayload["workspaceKind"];

export interface ConversationTreeAgent {
  readonly id: string;
  readonly provider: string;
  readonly title: string | null;
  readonly workspaceId: string | null;
  readonly parentAgentId: string | null;
  readonly status: AgentLifecycleStatus;
  readonly requiresAttention: boolean;
  readonly attentionReason: ConversationAttentionReason;
  readonly pendingPermissionCount: number;
  readonly archivedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly sessionId: string | null;
}

export interface ConversationTreeProject {
  readonly projectKey: string;
  readonly name: string;
  readonly workspaceIds: readonly string[];
}

export interface WorkspaceDiffStat {
  readonly added: number;
  readonly removed: number;
}

export interface WorkspaceDetail {
  readonly projectId: string;
  readonly workspaceKind: WorkspaceKind;
  readonly title: string | null;
  readonly directory: string;
  readonly branch: string | null;
  readonly lastChangeAt: string | null;
  readonly diffStat: WorkspaceDiffStat | null;
}

interface ConversationTreeNodeBase {
  readonly id: string;
  readonly title: string;
  readonly workspaceId: string | null;
  readonly runStatus: ConversationRunStatus | null;
  readonly subagentCount: number;
  readonly children: readonly ConversationTreeNode[];
}

export interface ConversationTreeProjectNode extends ConversationTreeNodeBase {
  readonly kind: "project";
  readonly workspaceId: null;
  readonly runStatus: null;
  readonly subagentCount: 0;
  readonly branch: string | null;
  readonly diffStat: WorkspaceDiffStat | null;
  readonly children: readonly ConversationTreeConversationNode[];
}

export interface ConversationTreeConversationNode extends ConversationTreeNodeBase {
  readonly kind: "conversation";
  readonly runStatus: ConversationRunStatus;
  readonly updatedAt: string;
  readonly providerId: string;
  readonly attentionKind: ConversationAttentionKind;
  readonly children: readonly ConversationTreeSubagentNode[];
}

export interface ConversationTreeSubagentNode extends ConversationTreeNodeBase {
  readonly kind: "subagent";
  readonly runStatus: ConversationRunStatus;
  readonly children: readonly ConversationTreeSubagentNode[];
}

export type ConversationTreeNode =
  | ConversationTreeProjectNode
  | ConversationTreeConversationNode
  | ConversationTreeSubagentNode;

export type SelectableConversationTreeNode = Extract<
  ConversationTreeNode,
  { readonly kind: "conversation" | "subagent" }
>;

export interface ConversationTreeRow {
  readonly node: ConversationTreeNode;
  readonly depth: number;
  readonly canExpand: boolean;
  readonly isExpanded: boolean;
}

export type ConversationTreePinTarget =
  | { readonly kind: "project"; readonly projectKey: string }
  | { readonly kind: "workspace"; readonly workspaceId: string };

export type RenameError = "empty";

export type Editing =
  | {
      readonly kind: "project";
      readonly targetId: string;
      readonly originalName: string;
      readonly draftName: string;
      readonly error: RenameError | null;
    }
  | {
      readonly kind: "conversation";
      readonly targetId: string;
      readonly workspaceId: string;
      readonly originalName: string;
      readonly draftName: string;
      readonly error: RenameError | null;
    }
  | null;

export interface ConversationTreeMenuItem<Id extends string> {
  readonly id: Id;
  readonly enabled: boolean;
  readonly destructive: boolean;
  readonly separatorBefore: boolean;
}
