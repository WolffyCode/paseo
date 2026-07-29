import type { ConversationTreeAgent, WorkspaceDetail } from "./types";

export interface DraftWorkspace {
  readonly workspaceId: string;
  readonly detail: WorkspaceDetail;
}

/** Prefer the focused conversation workspace, then choose one stable local project workspace. */
export function resolveDefaultConversationWorkspace(input: {
  focusedRootId: string | null;
  agents: ReadonlyMap<string, ConversationTreeAgent>;
  details: ReadonlyMap<string, WorkspaceDetail>;
}): DraftWorkspace | null {
  const focusedWorkspaceId =
    input.focusedRootId === null
      ? null
      : (input.agents.get(input.focusedRootId)?.workspaceId ?? null);
  if (focusedWorkspaceId !== null) {
    const focusedDetail = input.details.get(focusedWorkspaceId);
    if (focusedDetail !== undefined) {
      return { workspaceId: focusedWorkspaceId, detail: focusedDetail };
    }
  }

  const candidates = Array.from(input.details, ([workspaceId, detail]) => ({
    workspaceId,
    detail,
  })).sort((left, right) => {
    const leftLocal =
      left.detail.workspaceKind === "local_checkout" || left.detail.workspaceKind === "directory";
    const rightLocal =
      right.detail.workspaceKind === "local_checkout" || right.detail.workspaceKind === "directory";
    if (leftLocal !== rightLocal) return leftLocal ? -1 : 1;
    return (
      left.detail.directory.localeCompare(right.detail.directory) ||
      left.workspaceId.localeCompare(right.workspaceId)
    );
  });
  return candidates[0] ?? null;
}
