// Tests for the right-tab bridge (联动2): new-file → open the file in the right-side tab. The bridge is
// the single seam onto the new-shell right panel, so these tests pin its behavior with injected fakes (no
// real shell): it (a) expands the right region + opens the file into the workspace's panel forwarding the
// full location, and (b) silently no-ops when there is no workspace context — the §7 degrade:
// create-without-open, never throw.

import { describe, expect, test, vi } from "vitest";
import { createRightTabBridge, type RightTabBridgeDeps } from "./right-tab-bridge";

// Build the bridge over recording fakes for the shell openRight + the panel-registry openFile, so a test
// asserts the wiring (guard → openRight → openFile) without the real shell.
function setup(overrides: Partial<RightTabBridgeDeps> = {}) {
  const openRight = vi.fn();
  const openFile = vi.fn();
  const deps: RightTabBridgeDeps = { openRight, openFile, ...overrides };
  return { bridge: createRightTabBridge(deps), openRight, openFile };
}

describe("right-tab-bridge openFileInRightTab", () => {
  test("expands the right region and opens the file into the workspace's panel", () => {
    const { bridge, openRight, openFile } = setup();

    bridge.openFileInRightTab({
      location: { path: "/host/root/a.ts" },
      workspaceId: "ws1",
      serverId: "srv1",
    });

    expect(openRight).toHaveBeenCalledTimes(1);
    expect(openFile).toHaveBeenCalledTimes(1);
    expect(openFile).toHaveBeenCalledWith({
      serverId: "srv1",
      workspaceId: "ws1",
      location: { path: "/host/root/a.ts" },
    });
  });

  test("silently no-ops (no open, no throw) when there is no workspace", () => {
    const { bridge, openRight, openFile } = setup();

    expect(() =>
      bridge.openFileInRightTab({
        location: { path: "/host/root/a.ts" },
        workspaceId: "",
        serverId: "srv1",
      }),
    ).not.toThrow();

    expect(openRight).not.toHaveBeenCalled();
    expect(openFile).not.toHaveBeenCalled();
  });

  test("forwards line range on the location through to the panel", () => {
    const { bridge, openFile } = setup();

    bridge.openFileInRightTab({
      location: { path: "/host/root/a.ts", lineStart: 10, lineEnd: 12 },
      workspaceId: "ws1",
      serverId: "srv1",
    });

    expect(openFile).toHaveBeenCalledWith({
      serverId: "srv1",
      workspaceId: "ws1",
      location: { path: "/host/root/a.ts", lineStart: 10, lineEnd: 12 },
    });
  });
});
