import { describe, expect, test } from "vitest";
import { deriveConversationMenuItems } from "./conversation-menu";

describe("deriveConversationMenuItems", () => {
  test("returns all eleven actions for a directory-backed Electron conversation", () => {
    const items = deriveConversationMenuItems({
      hasWorkspace: true,
      isPinned: true,
      canReveal: true,
      canOpenInNewWindow: true,
      isOffline: false,
    });

    expect(items.map((item) => item.id)).toEqual([
      "unpin",
      "rename",
      "archive",
      "mark-unread",
      "reveal-in-finder",
      "copy-workspace-path",
      "copy-session-id",
      "copy-deep-link",
      "fork-local",
      "fork-worktree",
      "open-in-new-window",
    ]);
    expect(items.filter((item) => item.enabled).map((item) => item.id)).toEqual([
      "unpin",
      "rename",
      "reveal-in-finder",
      "copy-session-id",
      "open-in-new-window",
    ]);
  });

  test("removes every workspace-dependent action for a provider-owned subagent", () => {
    const items = deriveConversationMenuItems({
      hasWorkspace: false,
      isPinned: false,
      canReveal: true,
      canOpenInNewWindow: true,
      isOffline: false,
    });

    expect(items.map((item) => item.id)).toEqual([
      "archive",
      "mark-unread",
      "copy-workspace-path",
      "copy-session-id",
      "copy-deep-link",
      "fork-local",
      "fork-worktree",
    ]);
    expect(items.filter((item) => item.enabled).map((item) => item.id)).toEqual([
      "copy-session-id",
    ]);
  });

  test("hides each platform action independently and keeps group separators attached", () => {
    const items = deriveConversationMenuItems({
      hasWorkspace: true,
      isPinned: false,
      canReveal: false,
      canOpenInNewWindow: false,
      isOffline: false,
    });

    expect(items.map((item) => item.id)).not.toContain("reveal-in-finder");
    expect(items.map((item) => item.id)).not.toContain("open-in-new-window");
    expect(items.find((item) => item.id === "copy-workspace-path")?.separatorBefore).toBe(true);
  });

  test("keeps read-only actions enabled while offline and disables mutable workspace actions", () => {
    const items = deriveConversationMenuItems({
      hasWorkspace: true,
      isPinned: false,
      canReveal: true,
      canOpenInNewWindow: true,
      isOffline: true,
    });

    expect(items.filter((item) => item.enabled).map((item) => item.id)).toEqual([
      "reveal-in-finder",
      "copy-session-id",
      "open-in-new-window",
    ]);
  });
});
