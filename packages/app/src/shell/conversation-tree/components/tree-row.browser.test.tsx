import { page } from "vitest/browser";
import type { WorkspaceDescriptorPayload } from "@getpaseo/protocol/messages";
import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { View } from "react-native";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  ConversationTreeData,
  ConversationTreeWorkspaceSnapshot,
  FetchConversationTreeAgentsInput,
} from "../data/conversation-tree-data";
import type { AgentUpdateEvent } from "../model/apply-agent-update";
import {
  ConversationTreeStore,
  type ConversationTreeStoreDeps,
} from "../model/conversation-tree-store";
import type {
  ConversationTreeAgent,
  ConversationTreeNode,
  ConversationTreeRow as ConversationTreeRowModel,
} from "../model/types";
import { ConversationTreeRow } from "./tree-row";

const NOOP_OPEN_MENU = () => {};

function agent(id: string, overrides: Partial<ConversationTreeAgent> = {}): ConversationTreeAgent {
  return {
    id,
    title: `Agent ${id}`,
    workspaceId: null,
    parentAgentId: null,
    status: "idle",
    requiresAttention: false,
    attentionReason: null,
    pendingPermissionCount: 0,
    archivedAt: null,
    createdAt: "2026-07-12T00:00:00.000Z",
    sessionId: null,
    ...overrides,
  };
}

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
    diffStat: { additions: 12, deletions: 4 },
    scripts: [],
    gitRuntime: {
      currentBranch: "feat/conversation-tree-design",
      remoteUrl: null,
      isPaseoOwnedWorktree: true,
      isDirty: true,
      aheadBehind: null,
      aheadOfOrigin: null,
      behindOfOrigin: null,
    },
    githubRuntime: null,
  };
}

class BrowserTreeData implements ConversationTreeData {
  readonly agents = [
    agent("root", { workspaceId: "workspace-root", status: "running" }),
    agent("child", { parentAgentId: "root", status: "idle" }),
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

function createBrowserStore(onOpenRightPanel: () => void): ConversationTreeStore {
  const context = { serverId: "server", isElectron: false, isOffline: false };
  const deps: ConversationTreeStoreDeps = {
    data: new BrowserTreeData(),
    openRightPanel: onOpenRightPanel,
    navigate: () => {},
    openInFinder: async () => {},
    openInNewWindow: () => {},
    copyToClipboard: () => {},
    confirmDestructive: async () => true,
    reportError: () => {},
    openSearch: () => {},
    getContext: () => context,
  };
  return new ConversationTreeStore(deps);
}

function requireElement(root: ParentNode, testID: string): HTMLElement {
  const element = root.querySelector<HTMLElement>(`[data-testid="${testID}"]`);
  if (element === null) {
    throw new Error(`Expected rendered element: ${testID}`);
  }
  return element;
}

function requireTree(store: ConversationTreeStore): {
  project: ConversationTreeNode;
  root: ConversationTreeNode;
  child: ConversationTreeNode;
} {
  const project = store.tree[0];
  const root = project?.children[0];
  const child = root?.children[0];
  if (project === undefined || root === undefined || child === undefined) {
    throw new Error("Expected project, root conversation, and subagent fixtures");
  }
  return { project, root, child };
}

function row(node: ConversationTreeNode, depth: number): ConversationTreeRowModel {
  return {
    node,
    depth,
    canExpand: node.kind === "project" || node.children.length > 0,
    isExpanded: true,
  };
}

async function nextFrame(): Promise<void> {
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

describe("ConversationTreeRow", () => {
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
    vi.unstubAllGlobals();
  });

  it("mounts all row kinds and dispatches selection plus inline rename interactions", async () => {
    await page.viewport(800, 700);
    vi.stubGlobal("React", React);
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    let rightOpenCount = 0;
    store = createBrowserStore(() => {
      rightOpenCount += 1;
    });
    await store.load();
    const nodes = requireTree(store);

    host = document.createElement("div");
    host.style.cssText = "position:fixed;left:0;top:0;width:260px;height:200px";
    document.body.appendChild(host);
    root = createRoot(host);
    React.act(() =>
      root?.render(
        <View>
          <ConversationTreeRow
            row={row(nodes.project, 0)}
            store={store!}
            isOffline={false}
            isContextTarget={false}
            onOpenMenu={NOOP_OPEN_MENU}
          />
          <ConversationTreeRow
            row={row(nodes.root, 1)}
            store={store!}
            isOffline={false}
            isContextTarget={false}
            onOpenMenu={NOOP_OPEN_MENU}
          />
          <ConversationTreeRow
            row={row(nodes.child, 2)}
            store={store!}
            isOffline={false}
            isContextTarget={false}
            onOpenMenu={NOOP_OPEN_MENU}
          />
        </View>,
      ),
    );
    await nextFrame();

    requireElement(host, "conv-tree-row-project-project");
    const rootRow = requireElement(host, "conv-tree-row-conversation-root");
    const childRow = requireElement(host, "conv-tree-row-subagent-child");

    React.act(() => rootRow.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(store.focusedRootId).toBe("root");
    expect(store.activeNodeId).toBe("root");

    React.act(() => childRow.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(rightOpenCount).toBe(1);
    expect(store.focusedRootId).toBe("root");
    expect(store.activeNodeId).toBe("child");

    React.act(() => rootRow.dispatchEvent(new MouseEvent("dblclick", { bubbles: true })));
    await nextFrame();
    expect(store.editing).toMatchObject({ kind: "conversation", targetId: "root" });
    requireElement(host, "conv-tree-rename-input-root");
  });
});
