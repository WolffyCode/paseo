import { describe, expect, test } from "vitest";
import {
  isPinned,
  mergeConversationTreePins,
  pinTargetKey,
  readConversationTreePins,
  SIDEBAR_PINS_STORAGE_KEY,
  togglePin,
} from "./pin-state";
import type { ConversationTreePinTarget } from "./types";

describe("conversation tree pin state", () => {
  test("uses the existing sidebar storage key and project/workspace discriminants", () => {
    const project: ConversationTreePinTarget = { kind: "project", projectKey: "p1" };
    const workspace: ConversationTreePinTarget = { kind: "workspace", workspaceId: "w1" };

    expect(SIDEBAR_PINS_STORAGE_KEY).toBe("sidebar-pins");
    expect(pinTargetKey(project)).toBe("project:p1");
    expect(pinTargetKey(workspace)).toBe("workspace:w1");
  });

  test("toggles project and workspace pins without changing untouched entries", () => {
    const project: ConversationTreePinTarget = { kind: "project", projectKey: "p1" };
    const workspace: ConversationTreePinTarget = { kind: "workspace", workspaceId: "w1" };

    const withProject = togglePin([], project);
    const withBoth = togglePin(withProject, workspace);
    const withoutProject = togglePin(withBoth, project);

    expect(withBoth).toEqual([project, workspace]);
    expect(withBoth[0]).toBe(project);
    expect(isPinned(withBoth, project)).toBe(true);
    expect(withoutProject).toEqual([workspace]);
    expect(isPinned(withoutProject, project)).toBe(false);
  });

  test("reads only tree-owned targets from the shared Zustand persistence envelope", () => {
    const persisted = {
      state: {
        pinnedByServerId: {
          server: [
            { kind: "project", projectKey: "p1" },
            { kind: "workspace", workspaceId: "w1" },
            { kind: "agent", agentId: "a1" },
            { kind: "workspace", workspaceId: 42 },
          ],
        },
      },
      version: 0,
    };

    expect(readConversationTreePins(persisted, "server")).toEqual([
      { kind: "project", projectKey: "p1" },
      { kind: "workspace", workspaceId: "w1" },
    ]);
  });

  test("merges one server's tree pins without erasing agent pins or other servers", () => {
    const persisted = {
      state: {
        pinnedByServerId: {
          server: [
            { kind: "project", projectKey: "old" },
            { kind: "agent", agentId: "agent-owned" },
          ],
          other: [{ kind: "workspace", workspaceId: "other-workspace" }],
        },
      },
      version: 0,
    };

    expect(
      mergeConversationTreePins(persisted, "server", [
        { kind: "workspace", workspaceId: "new-workspace" },
      ]),
    ).toEqual({
      state: {
        pinnedByServerId: {
          server: [
            { kind: "agent", agentId: "agent-owned" },
            { kind: "workspace", workspaceId: "new-workspace" },
          ],
          other: [{ kind: "workspace", workspaceId: "other-workspace" }],
        },
      },
      version: 0,
    });
  });
});
