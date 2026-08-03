import type {
  ConversationTreeAgent,
  ConversationTreeDraftTarget,
  ConversationTreePendingAgentTarget,
  WorkspaceDetail,
} from "../conversation-tree/model/types";

export interface FocusedConversation {
  readonly agentId: string;
  readonly workspaceId: string | null;
  readonly workspaceRoot: string;
}

export type ConversationRegionTarget =
  | ({ readonly kind: "agent" } & FocusedConversation)
  | {
      readonly kind: "draft";
      readonly draftId: string;
      readonly workspaceId: string | null;
      readonly workspaceRoot: string;
    };

/** Resolve the Shell center target, including the short draft-to-agent event bridge. */
export function resolveConversationRegionTarget(input: {
  focusedRootId: string | null;
  draftTarget: ConversationTreeDraftTarget | null;
  pendingAgentTarget: ConversationTreePendingAgentTarget | null;
  agents: ReadonlyMap<string, ConversationTreeAgent>;
  workspaceDetails: ReadonlyMap<string, WorkspaceDetail>;
}): ConversationRegionTarget | null {
  if (input.draftTarget !== null) {
    const workspaceId = input.draftTarget.workspaceId;
    return {
      kind: "draft",
      draftId: input.draftTarget.draftId,
      workspaceId,
      workspaceRoot:
        workspaceId === null ? "" : (input.workspaceDetails.get(workspaceId)?.directory ?? ""),
    };
  }
  if (
    input.pendingAgentTarget !== null &&
    input.pendingAgentTarget.agentId === input.focusedRootId
  ) {
    return {
      kind: "agent",
      agentId: input.pendingAgentTarget.agentId,
      workspaceId: input.pendingAgentTarget.workspaceId,
      workspaceRoot:
        input.pendingAgentTarget.workspaceId === null
          ? ""
          : (input.workspaceDetails.get(input.pendingAgentTarget.workspaceId)?.directory ?? ""),
    };
  }
  const focused = resolveFocusedConversation(input);
  return focused === null ? null : { kind: "agent", ...focused };
}

/** Resolve the selected root's workspace without treating a subagent activation as center focus. */
export function resolveFocusedConversation(input: {
  focusedRootId: string | null;
  agents: ReadonlyMap<string, ConversationTreeAgent>;
  workspaceDetails: ReadonlyMap<string, WorkspaceDetail>;
}): FocusedConversation | null {
  const agentId = input.focusedRootId;
  if (agentId === null) {
    return null;
  }
  const agent = input.agents.get(agentId);
  if (agent === undefined) {
    return null;
  }
  const workspaceId = agent.workspaceId;
  return {
    agentId,
    workspaceId,
    workspaceRoot:
      workspaceId === null ? "" : (input.workspaceDetails.get(workspaceId)?.directory ?? ""),
  };
}

function isAbsoluteHostPath(path: string): boolean {
  return path.startsWith("/") || path.startsWith("~") || /^[A-Za-z]:[\\/]/.test(path);
}

/** Anchor a conversation file link to its host workspace while preserving absolute paths. */
export function absoluteHostPath(root: string, path: string): string {
  const normalized = path.trim().replace(/\\/g, "/");
  if (isAbsoluteHostPath(normalized) || root.length === 0) {
    return normalized;
  }
  return `${root.replace(/\/+$/, "")}/${normalized.replace(/^\/+/, "")}`;
}
