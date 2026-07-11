import type { ConversationTreeMenuItem } from "./types";

export type ProjectMenuItemId =
  | "pin"
  | "unpin"
  | "reveal-in-finder"
  | "create-worktree"
  | "rename-project"
  | "archive"
  | "remove";

export type ProjectMenuItem = ConversationTreeMenuItem<ProjectMenuItemId>;

export interface ProjectMenuInput {
  readonly isPinned: boolean;
  readonly canReveal: boolean;
  readonly canCreateWorktree: boolean;
  readonly isOffline: boolean;
}

/** Derive the ordered project menu with platform visibility and offline write gates resolved. */
export function deriveProjectMenuItems(input: ProjectMenuInput): ProjectMenuItem[] {
  const writeEnabled = !input.isOffline;
  const pinId: ProjectMenuItemId = input.isPinned ? "unpin" : "pin";
  const items: ProjectMenuItem[] = [
    {
      id: pinId,
      enabled: writeEnabled,
      destructive: false,
      separatorBefore: false,
    },
  ];
  if (input.canReveal) {
    items.push({
      id: "reveal-in-finder",
      enabled: true,
      destructive: false,
      separatorBefore: false,
    });
  }
  if (input.canCreateWorktree) {
    items.push({
      id: "create-worktree",
      enabled: writeEnabled,
      destructive: false,
      separatorBefore: false,
    });
  }
  items.push(
    {
      id: "rename-project",
      enabled: writeEnabled,
      destructive: false,
      separatorBefore: false,
    },
    {
      id: "archive",
      enabled: false,
      destructive: false,
      separatorBefore: false,
    },
    {
      id: "remove",
      enabled: writeEnabled,
      destructive: true,
      separatorBefore: true,
    },
  );
  return items;
}
