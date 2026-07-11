import type { ConversationTreeNode } from "./types";

/** Keep the focused root and currently activated row independently selectable. */
export function isConversationTreeRowSelected(
  node: ConversationTreeNode,
  focusedRootId: string | null,
  activeNodeId: string | null,
): boolean {
  return node.id === focusedRootId || node.id === activeNodeId;
}
