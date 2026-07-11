import { describe, expect, test } from "vitest";
import { deriveProjectMenuItems } from "./project-menu";

describe("deriveProjectMenuItems", () => {
  test("returns the complete six-item project menu when both conditional actions are available", () => {
    const items = deriveProjectMenuItems({
      isPinned: false,
      canReveal: true,
      canCreateWorktree: true,
      isOffline: false,
    });

    expect(items.map((item) => item.id)).toEqual([
      "pin",
      "reveal-in-finder",
      "create-worktree",
      "rename-project",
      "archive",
      "remove",
    ]);
    expect(items.find((item) => item.id === "archive")?.enabled).toBe(false);
    expect(items.find((item) => item.id === "remove")).toMatchObject({
      enabled: true,
      destructive: true,
      separatorBefore: true,
    });
  });

  test("switches pin identity and hides unavailable Finder and worktree actions", () => {
    const items = deriveProjectMenuItems({
      isPinned: true,
      canReveal: false,
      canCreateWorktree: false,
      isOffline: false,
    });

    expect(items.map((item) => item.id)).toEqual(["unpin", "rename-project", "archive", "remove"]);
  });

  test("keeps read-only reveal available offline while disabling every write action", () => {
    const items = deriveProjectMenuItems({
      isPinned: false,
      canReveal: true,
      canCreateWorktree: true,
      isOffline: true,
    });

    expect(items.map((item) => [item.id, item.enabled])).toEqual([
      ["pin", false],
      ["reveal-in-finder", true],
      ["create-worktree", false],
      ["rename-project", false],
      ["archive", false],
      ["remove", false],
    ]);
  });
});
