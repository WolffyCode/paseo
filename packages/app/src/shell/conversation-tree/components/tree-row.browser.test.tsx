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
  ConversationAttentionKind,
  ConversationRunStatus,
  ConversationTreeAgent,
  ConversationTreeConversationNode,
  ConversationTreeNode,
  ConversationTreeRow as ConversationTreeRowModel,
} from "../model/types";
import type { ConversationTreeMenuTarget } from "./tree-context-menu";
import { ConversationTreeRow } from "./tree-row";

const NOOP_OPEN_MENU = () => {};

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

function workspace(
  id: string,
  workspaceKind: WorkspaceDescriptorPayload["workspaceKind"] = "worktree",
  branch: string | null = "feat/conversation-tree-design",
  diffStat: WorkspaceDescriptorPayload["diffStat"] = { additions: 12, deletions: 4 },
): WorkspaceDescriptorPayload {
  return {
    id,
    projectId: "project",
    projectDisplayName: "Project",
    projectRootPath: "/repo/project",
    workspaceDirectory: `/repo/project/${id}`,
    projectKind: "git",
    workspaceKind,
    name: "Root conversation",
    title: null,
    archivingAt: null,
    status: "done",
    statusEnteredAt: null,
    activityAt: "2026-07-12T01:00:00.000Z",
    diffStat,
    scripts: [],
    gitRuntime: {
      currentBranch: branch,
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
    agent("grandchild", { parentAgentId: "child", status: "running" }),
  ];
  readonly workspaceSnapshot: ConversationTreeWorkspaceSnapshot = {
    workspaces: [
      workspace("workspace-root"),
      workspace("workspace-main", "local_checkout", "develop", {
        additions: 8,
        deletions: 2,
      }),
    ],
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
    openConversationInRightPanel: () => onOpenRightPanel(),
    navigate: () => {},
    openInFinder: async () => {},
    openInNewWindow: () => {},
    copyToClipboard: () => {},
    confirmDestructive: async () => true,
    reportError: () => {},
    openSearch: () => {},
    createDraftId: () => "draft-test",
    retargetConversationView: () => {},
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

/** Build an isolated root node so browser rendering covers every visible status label. */
function conversationNode(
  id: string,
  runStatus: ConversationRunStatus,
  attentionKind: ConversationAttentionKind = null,
): ConversationTreeConversationNode {
  return {
    kind: "conversation",
    id,
    title: id,
    workspaceId: null,
    runStatus,
    updatedAt: "2026-07-12T00:00:00.000Z",
    providerId: "codex",
    attentionKind,
    subagentCount: 0,
    children: [],
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
    const handleOpenMenu = vi.fn<(target: ConversationTreeMenuTarget) => void>();
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
            onOpenMenu={handleOpenMenu}
          />
          <ConversationTreeRow
            row={row(nodes.root, 1)}
            store={store!}
            isOffline={false}
            isContextTarget={false}
            onOpenMenu={handleOpenMenu}
          />
          <ConversationTreeRow
            row={row(nodes.child, 2)}
            store={store!}
            isOffline={false}
            isContextTarget={false}
            onOpenMenu={handleOpenMenu}
          />
        </View>,
      ),
    );
    await nextFrame();

    const projectRow = requireElement(host, "conv-tree-row-project-project");
    const rootRow = requireElement(host, "conv-tree-row-conversation-root");
    const childRow = requireElement(host, "conv-tree-row-subagent-child");
    const projectChevron = requireElement(host, "conv-tree-chevron-project");
    const rootChevron = requireElement(host, "conv-tree-chevron-root");

    expect(projectRow.textContent).toBe("Project");
    expect(rootRow.textContent).toBe("Agent root");
    expect(childRow.textContent).toBe("Agent child");
    expect(rootRow.querySelector('[data-testid="conv-tree-status-root"]')).toBeNull();
    expect(rootRow.querySelector('[data-testid="conv-tree-badge-root"]')).toBeNull();
    expect(childRow.querySelector('[data-testid="conv-tree-status-child"]')).toBeNull();
    expect(childRow.querySelector('[data-testid="conv-tree-badge-child"]')).toBeNull();
    expect(host.querySelector('[data-testid^="conv-tree-more-"]')).toBeNull();
    expect(host.querySelector('[data-testid^="conv-tree-project-new-"]')).toBeNull();
    expect(projectRow.getAttribute("data-convhover")).toBe("1");
    expect(rootRow.getAttribute("data-convhover")).toBe("1");
    expect(childRow.getAttribute("data-convhover")).toBe("1");
    expect(projectRow.getBoundingClientRect().height).toBe(36);
    expect(rootRow.getBoundingClientRect().height).toBe(36);
    expect(childRow.getBoundingClientRect().height).toBe(36);
    expect(getComputedStyle(projectRow).alignItems).toBe("center");
    expect(getComputedStyle(rootRow).alignItems).toBe("center");
    expect(getComputedStyle(childRow).alignItems).toBe("center");
    expect(
      Math.round(
        projectChevron.getBoundingClientRect().top - projectRow.getBoundingClientRect().top,
      ),
    ).toBe(8);
    expect(
      Math.round(rootChevron.getBoundingClientRect().top - rootRow.getBoundingClientRect().top),
    ).toBe(8);
    React.act(() => rootRow.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    await nextFrame();
    expect(store.focusedRootId).toBe("root");
    expect(store.activeNodeId).toBe("root");
    expect(rootRow.getAttribute("data-convhover")).toBeNull();

    React.act(() => childRow.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    await nextFrame();
    expect(rightOpenCount).toBe(1);
    expect(store.focusedRootId).toBe("root");
    expect(store.activeNodeId).toBe("child");
    expect(childRow.getAttribute("data-convhover")).toBeNull();

    React.act(() =>
      projectRow.dispatchEvent(
        new MouseEvent("contextmenu", { bubbles: true, clientX: 80, clientY: 40 }),
      ),
    );
    React.act(() =>
      childRow.dispatchEvent(
        new MouseEvent("contextmenu", { bubbles: true, clientX: 90, clientY: 50 }),
      ),
    );
    expect(handleOpenMenu).toHaveBeenCalledTimes(2);
    expect(handleOpenMenu.mock.calls[0]?.[0].node.kind).toBe("project");
    expect(handleOpenMenu.mock.calls[1]?.[0].node.kind).toBe("subagent");

    React.act(() => rootRow.dispatchEvent(new MouseEvent("dblclick", { bubbles: true })));
    await nextFrame();
    expect(store.editing).toMatchObject({ kind: "conversation", targetId: "root" });
    requireElement(host, "conv-tree-rename-input-root");
  });

  it("keeps root rows title-only while status presentation remains deferred", async () => {
    await page.viewport(800, 700);
    vi.stubGlobal("React", React);
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    store = createBrowserStore(() => {});
    await store.load();

    const cases: readonly [string, ConversationRunStatus, ConversationAttentionKind, string][] = [
      ["running", "running", null, "运行中"],
      ["permission", "needsAttention", "permission", "等待权限确认"],
      ["reply", "needsAttention", "reply", "等待你的回复"],
      ["idle", "idle", null, "空闲"],
      ["error", "error", null, "出错"],
      ["initializing", "initializing", null, "初始化中…"],
    ];
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    const renderedRows = cases.map(([id, runStatus, attentionKind]) => (
      <ConversationTreeRow
        key={id}
        row={row(conversationNode(id, runStatus, attentionKind), 0)}
        store={store!}
        isOffline={false}
        isContextTarget={false}
        onOpenMenu={NOOP_OPEN_MENU}
      />
    ));
    React.act(() => root?.render(<View>{renderedRows}</View>));
    await nextFrame();

    for (const [id, _runStatus, _attentionKind, label] of cases) {
      const renderedRow = requireElement(host, `conv-tree-row-conversation-${id}`);
      expect(renderedRow.textContent).toBe(id);
      expect(renderedRow.textContent).not.toContain(label);
      expect(renderedRow.querySelector(`[data-testid="conv-tree-status-${id}"]`)).toBeNull();
      expect(renderedRow.querySelector(`[data-testid="conv-tree-status-tag-${id}"]`)).toBeNull();
    }
  });
});
