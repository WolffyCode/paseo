// Tests for the right-tab bridge (联动2): new-file → open the file in a right-side tab. The bridge is
// the single seam onto the old workspace-layout store, so these tests pin its behavior with injected
// fakes (no real layout store): it (a) builds the persistence key from serverId+workspaceId, (b) opens
// a focused file tab + ensures the shell right region is open, and (c) silently no-ops when the
// persistence key can't be built (missing workspaceId) — the §7 degrade: create-without-open, never throw.

import { describe, expect, test, vi } from "vitest";
import { createRightTabBridge, type RightTabBridgeDeps } from "./right-tab-bridge";

// Build the bridge over recording fakes for every old-module function it touches, so a test asserts
// the wiring (key build → target build → openTabFocused → openRight) without the real layout store.
function setup(overrides: Partial<RightTabBridgeDeps> = {}) {
  const openTabFocused = vi.fn(() => "tab-id");
  const openRight = vi.fn();
  const deps: RightTabBridgeDeps = {
    buildPersistenceKey: ({ serverId, workspaceId }) =>
      serverId && workspaceId ? `${serverId}:${workspaceId}` : null,
    createFileTabTarget: (location) => ({ kind: "file", ...location }),
    openTabFocused,
    openRight,
    ...overrides,
  };
  return { bridge: createRightTabBridge(deps), openTabFocused, openRight };
}

describe("right-tab-bridge openFileInRightTab", () => {
  test("opens a focused file tab under the composed persistence key and reveals the right region", () => {
    const { bridge, openTabFocused, openRight } = setup();

    bridge.openFileInRightTab({
      location: { path: "/host/root/a.ts" },
      workspaceId: "ws1",
      serverId: "srv1",
    });

    expect(openTabFocused).toHaveBeenCalledTimes(1);
    expect(openTabFocused).toHaveBeenCalledWith("srv1:ws1", {
      kind: "file",
      path: "/host/root/a.ts",
    });
    // Two truth sources for "right region visible": layout's tool-panel collapse + the shell's rightOpen.
    expect(openRight).toHaveBeenCalledTimes(1);
  });

  test("silently no-ops (no open, no throw) when the persistence key can't be built", () => {
    const { bridge, openTabFocused, openRight } = setup({
      buildPersistenceKey: () => null,
    });

    expect(() =>
      bridge.openFileInRightTab({
        location: { path: "/host/root/a.ts" },
        workspaceId: "",
        serverId: "srv1",
      }),
    ).not.toThrow();

    expect(openTabFocused).not.toHaveBeenCalled();
    expect(openRight).not.toHaveBeenCalled();
  });

  test("forwards line range on the location through to the created file target", () => {
    const { bridge, openTabFocused } = setup();

    bridge.openFileInRightTab({
      location: { path: "/host/root/a.ts", lineStart: 10, lineEnd: 12 },
      workspaceId: "ws1",
      serverId: "srv1",
    });

    expect(openTabFocused).toHaveBeenCalledWith("srv1:ws1", {
      kind: "file",
      path: "/host/root/a.ts",
      lineStart: 10,
      lineEnd: 12,
    });
  });
});
