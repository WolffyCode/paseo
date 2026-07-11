import type { ConversationTreeMenuItem } from "./types";

export type ConversationMenuItemId =
  | "pin"
  | "unpin"
  | "rename"
  | "archive"
  | "mark-unread"
  | "reveal-in-finder"
  | "copy-workspace-path"
  | "copy-session-id"
  | "copy-deep-link"
  | "fork-local"
  | "fork-worktree"
  | "open-in-new-window";

export type ConversationMenuItem = ConversationTreeMenuItem<ConversationMenuItemId>;

export interface ConversationMenuInput {
  readonly hasWorkspace: boolean;
  readonly isPinned: boolean;
  readonly canReveal: boolean;
  readonly canOpenInNewWindow: boolean;
  readonly isOffline: boolean;
}

/** Derive the shared conversation/subagent menu from workspace and desktop capabilities. */
export function deriveConversationMenuItems(input: ConversationMenuInput): ConversationMenuItem[] {
  const writeEnabled = !input.isOffline;
  const showReveal = input.hasWorkspace && input.canReveal;
  const showOpenInNewWindow = input.hasWorkspace && input.canOpenInNewWindow;
  const items: ConversationMenuItem[] = [];
  if (input.hasWorkspace) {
    const pinId: ConversationMenuItemId = input.isPinned ? "unpin" : "pin";
    items.push(
      {
        id: pinId,
        enabled: writeEnabled,
        destructive: false,
        separatorBefore: false,
      },
      {
        id: "rename",
        enabled: writeEnabled,
        destructive: false,
        separatorBefore: false,
      },
    );
  }
  items.push(
    {
      id: "archive",
      enabled: false,
      destructive: false,
      separatorBefore: false,
    },
    {
      id: "mark-unread",
      enabled: false,
      destructive: false,
      separatorBefore: false,
    },
  );
  if (showReveal) {
    items.push({
      id: "reveal-in-finder",
      enabled: true,
      destructive: false,
      separatorBefore: true,
    });
  }
  items.push(
    {
      id: "copy-workspace-path",
      enabled: false,
      destructive: false,
      separatorBefore: !showReveal,
    },
    {
      id: "copy-session-id",
      enabled: true,
      destructive: false,
      separatorBefore: false,
    },
    {
      id: "copy-deep-link",
      enabled: false,
      destructive: false,
      separatorBefore: false,
    },
    {
      id: "fork-local",
      enabled: false,
      destructive: false,
      separatorBefore: true,
    },
    {
      id: "fork-worktree",
      enabled: false,
      destructive: false,
      separatorBefore: false,
    },
  );
  if (showOpenInNewWindow) {
    items.push({
      id: "open-in-new-window",
      enabled: true,
      destructive: false,
      separatorBefore: true,
    });
  }
  return items;
}
