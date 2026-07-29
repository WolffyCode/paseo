import type { ConversationTreeConversationNode } from "./types";

export const CONVERSATION_DRAG_MIME = "application/x-helm-conversation";

export interface ConversationDragPayload {
  readonly agentId: string;
  readonly workspaceId: string;
  readonly title: string;
}

/** Encode only workspace-backed root conversations into a desktop drag payload. */
export function encodeConversationDrag(node: ConversationTreeConversationNode): string | null {
  if (node.workspaceId === null) return null;
  return JSON.stringify({
    agentId: node.id,
    workspaceId: node.workspaceId,
    title: node.title,
  } satisfies ConversationDragPayload);
}

/** Decode untrusted browser drag data into a complete right-panel conversation target. */
export function decodeConversationDrag(raw: string): ConversationDragPayload | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const value = parsed as Record<string, unknown>;
    if (
      typeof value.agentId !== "string" ||
      value.agentId.length === 0 ||
      typeof value.workspaceId !== "string" ||
      value.workspaceId.length === 0 ||
      typeof value.title !== "string" ||
      value.title.length === 0
    ) {
      return null;
    }
    return { agentId: value.agentId, workspaceId: value.workspaceId, title: value.title };
  } catch {
    return null;
  }
}
