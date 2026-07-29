import { describe, expect, it, vi } from "vitest";
import {
  openFileInPanel,
  openConversationInPanel,
  registerFileTreeAccess,
  registerRightPanelTarget,
  resolveFileTreeAccess,
} from "./workspace-panels";

// The per-workspace panel registry connects the file-tree bridge to the right panel + exposes the file
// tree to the tab factory. These tests pin: open routes to a registered target; an open before the target
// registers is queued and drained on register (the collapsed-panel case); unregister clears; and the two
// faces are keyed independently per workspace.

const loc = (path: string) => ({ path });

describe("workspace-panels · openFileInPanel", () => {
  it("routes an open to the registered target", () => {
    const openFile = vi.fn();
    registerRightPanelTarget("s1", "w1", { openFile, openConversation: vi.fn() });
    openFileInPanel("s1", "w1", loc("a.ts"));
    expect(openFile).toHaveBeenCalledWith({ path: "a.ts" });
  });

  it("queues an open before the target registers, then drains it on register", () => {
    const openFile = vi.fn();
    openFileInPanel("s1", "queue", loc("early.ts"));
    expect(openFile).not.toHaveBeenCalled();
    registerRightPanelTarget("s1", "queue", { openFile, openConversation: vi.fn() });
    expect(openFile).toHaveBeenCalledWith({ path: "early.ts" });
  });

  it("does not route to a target after it unregisters", () => {
    const openFile = vi.fn();
    const unregister = registerRightPanelTarget("s1", "gone", {
      openFile,
      openConversation: vi.fn(),
    });
    unregister();
    openFileInPanel("s1", "gone", loc("a.ts"));
    expect(openFile).not.toHaveBeenCalled();
  });
});

describe("workspace-panels · openConversationInPanel", () => {
  it("queues a conversation by server and drains it when any right workbench mounts", () => {
    const openConversation = vi.fn();
    const request = {
      kind: "conversation",
      target: { kind: "agent", agentId: "agent-1" },
      workspaceId: "workspace-other",
      title: "Agent 1",
      readOnly: true,
    } as const;
    openConversationInPanel("conversation-server", request);
    registerRightPanelTarget("conversation-server", "current-workspace", {
      openFile: vi.fn(),
      openConversation,
    });
    expect(openConversation).toHaveBeenCalledWith(request);
  });
});

describe("workspace-panels · file tree access", () => {
  it("resolves a registered file tree by workspace and clears on unregister", () => {
    const access = { rootPath: "/root", revealFile: vi.fn() };
    const unregister = registerFileTreeAccess("s2", "w2", access);
    expect(resolveFileTreeAccess("s2", "w2")).toBe(access);
    expect(resolveFileTreeAccess("s2", "other")).toBeNull();
    unregister();
    expect(resolveFileTreeAccess("s2", "w2")).toBeNull();
  });
});
