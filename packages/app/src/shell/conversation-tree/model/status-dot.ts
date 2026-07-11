import type { AgentLifecycleStatus } from "@getpaseo/protocol/agent-lifecycle";
import type { ConversationAttentionReason, ConversationStatusDot } from "./types";

export interface ConversationStatusDotInput {
  readonly status: AgentLifecycleStatus;
  readonly requiresAttention: boolean;
  readonly attentionReason: ConversationAttentionReason;
  readonly pendingPermissionCount: number;
}

/** Preserve the protocol state-bucket priority while splitting done into idle and initializing. */
export function deriveConversationStatusDot(
  input: ConversationStatusDotInput,
): ConversationStatusDot {
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
