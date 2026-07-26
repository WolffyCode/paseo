import type { AgentLifecycleStatus } from "@getpaseo/protocol/agent-lifecycle";
import type {
  ConversationAttentionKind,
  ConversationAttentionReason,
  ConversationRunStatus,
} from "./types";

export interface ConversationRunStatusInput {
  readonly status: AgentLifecycleStatus;
  readonly requiresAttention: boolean;
  readonly attentionReason: ConversationAttentionReason;
  readonly pendingPermissionCount: number;
}

/** Preserve the protocol state-bucket priority while deriving a visual-independent run state. */
export function deriveConversationRunStatus(
  input: ConversationRunStatusInput,
): ConversationRunStatus {
  // A closed agent's runtime is gone, so stale attention and permission fields cannot resurrect a
  // running-conversation-only state.
  if (input.status === "closed") {
    return "idle";
  }
  const needsPermission =
    input.pendingPermissionCount > 0 || input.attentionReason === "permission";
  if (needsPermission) {
    return "needsAttention";
  }
  const hasError = input.status === "error" || input.attentionReason === "error";
  if (hasError) {
    return "error";
  }
  if (input.status === "running") {
    return "running";
  }
  if (input.requiresAttention) {
    return "needsAttention";
  }
  if (input.status === "initializing") {
    return "initializing";
  }
  return "idle";
}

/** Attribute a needs-attention state to permission work or a reply requested from the user. */
export function deriveAttentionKind(input: ConversationRunStatusInput): ConversationAttentionKind {
  if (input.pendingPermissionCount > 0 || input.attentionReason === "permission") {
    return "permission";
  }
  return input.requiresAttention ? "reply" : null;
}

/** Convert the model run state and attention cause into the exact conversation-row label copy. */
export function conversationStatusLabelText(
  runStatus: ConversationRunStatus,
  attentionKind: ConversationAttentionKind,
): string {
  switch (runStatus) {
    case "running":
      return "运行中";
    case "needsAttention":
      return attentionKind === "permission" ? "等待权限确认" : "等待你的回复";
    case "idle":
      return "空闲";
    case "error":
      return "出错";
    case "initializing":
      return "初始化中…";
  }
}
