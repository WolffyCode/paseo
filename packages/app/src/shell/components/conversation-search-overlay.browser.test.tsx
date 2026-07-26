import { page } from "vitest/browser";
import type { WorkspaceDescriptorPayload } from "@getpaseo/protocol/messages";
import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  ConversationTreeData,
  ConversationTreeWorkspaceSnapshot,
  FetchConversationTreeAgentsInput,
} from "../conversation-tree/data/conversation-tree-data";
import type { AgentUpdateEvent } from "../conversation-tree/model/apply-agent-update";
import {
  ConversationTreeStore,
  type ConversationTreeStoreDeps,
} from "../conversation-tree/model/conversation-tree-store";
import type { ConversationTreeAgent } from "../conversation-tree/model/types";
import { ConversationSearchOverlay } from "./conversation-search-overlay";

/** Build a complete agent fixture while keeping each test focused on its changed fields. */
function agent(id: string, overrides: Partial<ConversationTreeAgent> = {}): ConversationTreeAgent {
  return {
    id,
    provider: "claude",
    title: `Agent ${id}`,
    workspaceId: null,
    parentAgentId: null,
    status: "idle",
    requiresAttention: false,
    attentionReason: null,
    pendingPermissionCount: 0,
    archivedAt: null,
    createdAt: "2026-07-12T00:00:00.000Z",
    updatedAt: "2026-07-12T00:00:00.000Z",
    sessionId: null,
    ...overrides,
  };
}

/** Build a minimal protocol workspace descriptor for the root conversation's project grouping. */
function workspace(id: string): WorkspaceDescriptorPayload {
  return {
    id,
    projectId: "project",
    projectDisplayName: "Project",
    projectRootPath: "/repo/project",
    workspaceDirectory: `/repo/project/${id}`,
    projectKind: "git",
    workspaceKind: "worktree",
    name: "Root conversation",
    title: null,
    archivingAt: null,
    status: "done",
    statusEnteredAt: null,
    activityAt: "2026-07-12T01:00:00.000Z",
    diffStat: { additions: 0, deletions: 0 },
    scripts: [],
    gitRuntime: {
      currentBranch: "main",
      remoteUrl: null,
      isPaseoOwnedWorktree: true,
      isDirty: false,
      aheadBehind: null,
      aheadOfOrigin: null,
      behindOfOrigin: null,
    },
    githubRuntime: null,
  };
}

class BrowserSearchData implements ConversationTreeData {
  readonly agents = [
    agent("root", { workspaceId: "workspace-root", status: "running" }),
    agent("child", { parentAgentId: "root" }),
  ];
  readonly workspaceSnapshot: ConversationTreeWorkspaceSnapshot = {
    workspaces: [workspace("workspace-root")],
    emptyProjects: [],
  };

  async fetchAgents(
    _input: FetchConversationTreeAgentsInput,
  ): Promise<readonly ConversationTreeAgent[]> {
    return this.agents;
  }

  async fetchWorkspaces(): Promise<ConversationTreeWorkspaceSnapshot> {
    return this.workspaceSnapshot;
  }

  onAgentUpdate(_handler: (event: AgentUpdateEvent) => void): () => void {
    return () => {};
  }

  onWorkspaceUpdate(_handler: (workspace: WorkspaceDescriptorPayload) => void): () => void {
    return () => {};
  }

  async renameProject(_projectKey: string, name: string): Promise<string> {
    return name;
  }

  async renameConversation(_workspaceId: string, _title: string): Promise<void> {}

  async removeProject(_projectKey: string): Promise<void> {}
}

function requireElement(root: ParentNode, testID: string): HTMLElement {
  const element = root.querySelector<HTMLElement>(`[data-testid="${testID}"]`);
  if (element === null) {
    throw new Error(`Expected rendered element: ${testID}`);
  }
  return element;
}

const NOOP = () => {};

let closeCount = 0;
function handleClose(): void {
  closeCount += 1;
}

describe("ConversationSearchOverlay", () => {
  let root: Root | null = null;
  let host: HTMLDivElement | null = null;
  let store: ConversationTreeStore | null = null;

  afterEach(() => {
    if (root !== null) React.act(() => root?.unmount());
    root = null;
    host?.remove();
    host = null;
    store?.dispose();
    store = null;
    closeCount = 0;
    vi.unstubAllGlobals();
  });

  it("selects a subagent candidate through store.activateNode, closes, and never navigates", async () => {
    await page.viewport(800, 700);
    vi.stubGlobal("React", React);
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);

    const context = { serverId: "server", isElectron: false, isOffline: false };
    const navigateCalls: string[] = [];
    const deps: ConversationTreeStoreDeps = {
      data: new BrowserSearchData(),
      openRightPanel: () => {},
      navigate: (route) => navigateCalls.push(route),
      openInFinder: async () => {},
      openInNewWindow: () => {},
      copyToClipboard: () => {},
      confirmDestructive: async () => true,
      reportError: () => {},
      openSearch: () => {},
      getContext: () => context,
    };
    store = new ConversationTreeStore(deps);
    await store.load();

    host = document.createElement("div");
    host.style.cssText = "position:fixed;left:0;top:0;width:600px;height:600px";
    document.body.appendChild(host);
    root = createRoot(host);
    React.act(() =>
      root?.render(<ConversationSearchOverlay store={store!} visible onClose={handleClose} />),
    );

    // RN Web's Modal portals into document.body rather than the mount host.
    requireElement(document.body, "shell-search-backdrop");
    const childRow = requireElement(document.body, "shell-search-candidate-child");
    React.act(() => childRow.dispatchEvent(new MouseEvent("click", { bubbles: true })));

    expect(store.activeNodeId).toBe("child");
    expect(store.focusedRootId).toBeNull();
    expect(closeCount).toBe(1);
    expect(navigateCalls).toEqual([]);
  });

  it("renders nothing when not visible", async () => {
    await page.viewport(800, 700);
    vi.stubGlobal("React", React);
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);

    const context = { serverId: "server", isElectron: false, isOffline: false };
    const deps: ConversationTreeStoreDeps = {
      data: new BrowserSearchData(),
      openRightPanel: () => {},
      navigate: () => {},
      openInFinder: async () => {},
      openInNewWindow: () => {},
      copyToClipboard: () => {},
      confirmDestructive: async () => true,
      reportError: () => {},
      openSearch: () => {},
      getContext: () => context,
    };
    store = new ConversationTreeStore(deps);
    await store.load();

    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    React.act(() =>
      root?.render(<ConversationSearchOverlay store={store!} visible={false} onClose={NOOP} />),
    );

    expect(document.body.querySelector('[data-testid="shell-search-backdrop"]')).toBeNull();
  });
});
