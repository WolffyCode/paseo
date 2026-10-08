import type { DraftInput } from "@/stores/draft-store";
import { areAttachmentsEqual } from "@/composer/draft/input-draft-core";
import type { WorkspaceDescriptor } from "@/stores/session-store";

export function selectChats(
  workspaces: ReadonlyMap<string, WorkspaceDescriptor>,
): WorkspaceDescriptor[] {
  return [...workspaces.values()]
    .filter((workspace) => workspace.purpose === "chat")
    .sort(
      (left, right) =>
        (right.statusEnteredAt?.getTime() ?? 0) - (left.statusEnteredAt?.getTime() ?? 0) ||
        left.id.localeCompare(right.id),
    );
}

export function chatTitle(text: string): string {
  return text.trim().replace(/\s+/g, " ").slice(0, 80);
}

export type ChatOperation =
  | { kind: "idle" }
  | { kind: "creating" }
  | { kind: "archiving"; id: string };
export interface ChatsScreenState {
  operation: ChatOperation;
  error: string | null;
  renaming: WorkspaceDescriptor | null;
}
export type ChatsScreenAction =
  | { type: "start"; operation: ChatOperation }
  | { type: "complete" }
  | { type: "fail"; error: string }
  | { type: "rename"; workspace: WorkspaceDescriptor | null };
export const INITIAL_CHATS_SCREEN_STATE: ChatsScreenState = {
  operation: { kind: "idle" },
  error: null,
  renaming: null,
};
export function reduceChatsScreen(
  state: ChatsScreenState,
  action: ChatsScreenAction,
): ChatsScreenState {
  switch (action.type) {
    case "start":
      return { ...state, operation: action.operation, error: null };
    case "complete":
      return { ...state, operation: { kind: "idle" }, error: null };
    case "fail":
      return { ...state, operation: { kind: "idle" }, error: action.error };
    case "rename":
      return { ...state, renaming: action.workspace };
  }
}

export function canClearSubmittedChatDraft(
  submitted: DraftInput | undefined,
  current: DraftInput | undefined,
): boolean {
  if (!submitted || !current || submitted.text !== current.text) return false;
  return areAttachmentsEqual({ left: submitted.attachments, right: current.attachments });
}
