import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@react-native-async-storage/async-storage", () => {
  const storage = new Map<string, string>();
  return {
    default: {
      getItem: vi.fn(async (key: string) => storage.get(key) ?? null),
      setItem: vi.fn(async (key: string, value: string) => {
        storage.set(key, value);
      }),
      removeItem: vi.fn(async (key: string) => {
        storage.delete(key);
      }),
    },
  };
});

import type { WorkspaceTab } from "@/stores/workspace-tabs-store";
import { coerceToCanonicalLayout } from "@/stores/workspace-layout-actions";
import {
  buildWorkspaceTabPersistenceKey,
  collectAllPanes,
  collectAllTabs,
  createWorkspaceLayoutStore,
  createDefaultLayout,
  findPaneById,
  findPaneContainingTab,
  getFocusedBrowserId,
  getMainPaneId,
  getRightToolPane,
  getTreeDepth,
  insertSplit,
  isRightToolPanelOpen,
  paneShowsTabBar,
  removePaneFromTree,
  removeTabFromTree,
  type SplitNode,
  type SplitPane,
  type WorkspaceLayout,
} from "@/stores/workspace-layout-store";
import { MAIN_PANE_ID, RIGHT_PANEL_PANE_ID } from "@/workspace-tabs/tab-surface";

const SERVER_ID = "server-1";
const WORKSPACE_ID = "ws-main";

function createDeterministicWorkspaceLayoutIds() {
  let values: string[] = [];
  let fallbackIndex = 0;

  function nextValue(): string {
    const value = values.shift();
    if (value) {
      return value;
    }
    fallbackIndex += 1;
    return `generated-${fallbackIndex}`;
  }

  return {
    useValues: (nextValues: string[]) => {
      values = nextValues.slice();
      fallbackIndex = 0;
    },
    reset: () => {
      values = [];
      fallbackIndex = 0;
    },
    createNodeId: (prefix: "pane" | "group") => `${prefix}_${nextValue()}`,
    createFocusRestorationToken: () => `workspace-focus-${nextValue()}`,
  };
}

const workspaceLayoutIds = createDeterministicWorkspaceLayoutIds();
const workspaceLayoutStore = createWorkspaceLayoutStore(workspaceLayoutIds);

function useWorkspaceLayoutIds(...values: string[]) {
  workspaceLayoutIds.useValues(values);
}

function createTab(tabId: string, target?: WorkspaceTab["target"]): WorkspaceTab {
  return {
    tabId,
    target: target ?? { kind: "draft", draftId: tabId },
    createdAt: 1,
  };
}

function createPane(input: {
  id: string;
  tabIds: string[];
  focusedTabId?: string | null;
  targetsByTabId?: Record<string, WorkspaceTab["target"]>;
}): SplitNode {
  const tabs = input.tabIds.map((tabId) => createTab(tabId, input.targetsByTabId?.[tabId]));
  return {
    kind: "pane",
    pane: {
      id: input.id,
      tabIds: input.tabIds,
      focusedTabId: input.focusedTabId ?? input.tabIds[input.tabIds.length - 1] ?? null,
      tabs,
    } as SplitPane,
  };
}

function createWorkspaceKey(): string {
  const key = buildWorkspaceTabPersistenceKey({
    serverId: SERVER_ID,
    workspaceId: WORKSPACE_ID,
  });
  expect(key).toBeTruthy();
  return key as string;
}

function expectGroup(node: SplitNode): Extract<SplitNode, { kind: "group" }> {
  expect(node.kind).toBe("group");
  return node as Extract<SplitNode, { kind: "group" }>;
}

describe("workspace-layout-store helpers", () => {
  it("finds panes and tabs across nested groups", () => {
    const root: SplitNode = {
      kind: "group",
      group: {
        id: "group-root",
        direction: "horizontal",
        sizes: [0.4, 0.6],
        children: [
          createPane({ id: "left", tabIds: ["tab-a", "tab-b"], focusedTabId: "tab-a" }),
          {
            kind: "group",
            group: {
              id: "group-right",
              direction: "vertical",
              sizes: [0.5, 0.5],
              children: [
                createPane({ id: "top-right", tabIds: ["tab-c"] }),
                createPane({ id: "bottom-right", tabIds: ["tab-d"] }),
              ],
            },
          },
        ],
      },
    };

    expect(findPaneById(root, "top-right")?.tabIds).toEqual(["tab-c"]);
    expect(findPaneContainingTab(root, "tab-b")?.id).toBe("left");
    expect(getTreeDepth(root)).toBe(3);
    expect(collectAllPanes(root).map((pane) => pane.id)).toEqual([
      "left",
      "top-right",
      "bottom-right",
    ]);
    expect(collectAllTabs(root).map((tab) => tab.tabId)).toEqual([
      "tab-a",
      "tab-b",
      "tab-c",
      "tab-d",
    ]);
  });

  it("derives the focused browser id from the focused pane active tab", () => {
    const root: SplitNode = {
      kind: "group",
      group: {
        id: "group-root",
        direction: "horizontal",
        sizes: [0.5, 0.5],
        children: [
          createPane({
            id: "left",
            tabIds: ["agent-a", "browser-a"],
            focusedTabId: "browser-a",
            targetsByTabId: {
              "agent-a": { kind: "agent", agentId: "agent-a" },
              "browser-a": { kind: "browser", browserId: "browser-a-id" },
            },
          }),
          createPane({
            id: "right",
            tabIds: ["browser-b"],
            focusedTabId: "browser-b",
            targetsByTabId: {
              "browser-b": { kind: "browser", browserId: "browser-b-id" },
            },
          }),
        ],
      },
    };

    expect(getFocusedBrowserId({ root, focusedPaneId: "left" })).toBe("browser-a-id");
    expect(getFocusedBrowserId({ root, focusedPaneId: "right" })).toBe("browser-b-id");
  });

  it("returns null when the focused pane active tab is not a browser", () => {
    const root = createPane({
      id: "main",
      tabIds: ["browser-a", "agent-a"],
      focusedTabId: "agent-a",
      targetsByTabId: {
        "browser-a": { kind: "browser", browserId: "browser-a-id" },
        "agent-a": { kind: "agent", agentId: "agent-a" },
      },
    });

    expect(getFocusedBrowserId({ root, focusedPaneId: "main" })).toBeNull();
  });
});

describe("workspace-layout-store tree transforms", () => {
  beforeEach(() => {
    workspaceLayoutIds.reset();
  });

  it("insertSplit wraps root-level same-direction splits in a nested group", () => {
    useWorkspaceLayoutIds(
      "11111111-1111-1111-1111-111111111111",
      "22222222-2222-2222-2222-222222222222",
    );

    const root: SplitNode = {
      kind: "group",
      group: {
        id: "group-root",
        direction: "horizontal",
        sizes: [0.25, 0.75],
        children: [
          createPane({ id: "left", tabIds: ["tab-a"] }),
          createPane({ id: "right", tabIds: ["tab-b", "tab-c"] }),
        ],
      },
    };

    const nextRoot = insertSplit(root, "right", "tab-c", "right", workspaceLayoutIds.createNodeId);
    const nextGroup = expectGroup(nextRoot);
    const nestedGroup = expectGroup(nextGroup.group.children[1]);

    expect(nextGroup.group.direction).toBe("horizontal");
    expect(nextGroup.group.children).toHaveLength(2);
    expect(nextGroup.group.sizes).toEqual([0.25, 0.75]);
    expect(nestedGroup.group.id).toBe("group_22222222-2222-2222-2222-222222222222");
    expect(nestedGroup.group.direction).toBe("horizontal");
    expect(nestedGroup.group.sizes).toEqual([0.5, 0.5]);
    expect(collectAllPanes(nextRoot).map((pane) => pane.id)).toEqual([
      "left",
      "right",
      "pane_11111111-1111-1111-1111-111111111111",
    ]);
    expect(findPaneById(nextRoot, "right")?.tabIds).toEqual(["tab-b"]);
    expect(findPaneById(nextRoot, "pane_11111111-1111-1111-1111-111111111111")?.tabIds).toEqual([
      "tab-c",
    ]);
  });

  it("removePaneFromTree unwraps single-child groups and renormalizes siblings", () => {
    const root: SplitNode = {
      kind: "group",
      group: {
        id: "group-root",
        direction: "horizontal",
        sizes: [0.2, 0.8],
        children: [
          createPane({ id: "left", tabIds: ["tab-a"] }),
          {
            kind: "group",
            group: {
              id: "group-right",
              direction: "vertical",
              sizes: [0.5, 0.5],
              children: [
                createPane({ id: "top-right", tabIds: ["tab-b"] }),
                createPane({ id: "bottom-right", tabIds: ["tab-c"] }),
              ],
            },
          },
        ],
      },
    };

    const nextRoot = removePaneFromTree(root, "top-right");
    const nextGroup = expectGroup(nextRoot);

    expect(nextGroup.group.sizes).toEqual([0.2, 0.8]);
    expect(collectAllPanes(nextRoot).map((pane) => pane.id)).toEqual(["left", "bottom-right"]);
    expect(nextGroup.group.children[1]).toEqual(
      createPane({ id: "bottom-right", tabIds: ["tab-c"] }),
    );
  });

  it("removeTabFromTree collapses empty panes but keeps the final root pane", () => {
    const splitRoot: SplitNode = {
      kind: "group",
      group: {
        id: "group-root",
        direction: "horizontal",
        sizes: [0.5, 0.5],
        children: [
          createPane({ id: "left", tabIds: ["tab-a"] }),
          createPane({ id: "right", tabIds: ["tab-b"] }),
        ],
      },
    };

    const collapsed = removeTabFromTree(splitRoot, "tab-a");
    expect(collapsed).toEqual(createPane({ id: "right", tabIds: ["tab-b"] }));

    const singlePaneRoot = createPane({ id: "main", tabIds: ["tab-a"] });
    const emptied = removeTabFromTree(singlePaneRoot, "tab-a");
    expect(emptied).toEqual(createPane({ id: "main", tabIds: [], focusedTabId: null }));
  });
});

describe("workspace-layout-store actions", () => {
  beforeEach(() => {
    workspaceLayoutIds.reset();
    workspaceLayoutStore.setState({
      layoutByWorkspace: {},
      splitSizesByWorkspace: {},
      pinnedAgentIdsByWorkspace: {},
      hiddenAgentIdsByWorkspace: {},
      focusRestorationByWorkspace: {},
    });
  });

  it("routes tools into the right pane and focuses duplicate opens instead of creating them", () => {
    // Opening the first tool creates the tools group, consuming one layout id
    // for the group node (the tools pane id is always the literal "tools").
    useWorkspaceLayoutIds("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    const workspaceKey = createWorkspaceKey();
    const store = workspaceLayoutStore.getState();

    const firstTabId = store.openTabFocused(workspaceKey, {
      kind: "file",
      path: "/repo/worktree/a.ts",
    });
    const secondTabId = store.openTabFocused(workspaceKey, {
      kind: "file",
      path: "/repo/worktree/b.ts",
    });

    // Re-opening an existing target focuses it instead of creating a duplicate.
    const duplicateTabId = store.openTabFocused(workspaceKey, {
      kind: "file",
      path: "/repo/worktree/b.ts",
    });
    const layout = workspaceLayoutStore.getState().layoutByWorkspace[workspaceKey];

    expect(firstTabId).toBe("file_/repo/worktree/a.ts");
    expect(secondTabId).toBe("file_/repo/worktree/b.ts");
    expect(duplicateTabId).toBe(secondTabId);
    // Both files live in the on-demand tools pane; main stays empty.
    expect(collectAllPanes(layout.root).map((pane) => pane.id)).toEqual([
      MAIN_PANE_ID,
      RIGHT_PANEL_PANE_ID,
    ]);
    expect(findPaneById(layout.root, MAIN_PANE_ID)?.tabIds).toEqual([]);
    expect(findPaneById(layout.root, RIGHT_PANEL_PANE_ID)?.tabIds).toEqual([
      "file_/repo/worktree/a.ts",
      "file_/repo/worktree/b.ts",
    ]);
    expect(layout.focusedPaneId).toBe(RIGHT_PANEL_PANE_ID);
    expect(findPaneById(layout.root, RIGHT_PANEL_PANE_ID)?.focusedTabId).toBe(secondTabId);
  });

  it("updates an existing file tab when opening the same path at a new line range", () => {
    const workspaceKey = createWorkspaceKey();
    const store = workspaceLayoutStore.getState();

    const firstTabId = store.openTabFocused(workspaceKey, {
      kind: "file",
      path: "/repo/worktree/a.ts",
      lineStart: 5,
    });
    const secondTabId = store.openTabFocused(workspaceKey, {
      kind: "file",
      path: "/repo/worktree/a.ts",
      lineStart: 10,
      lineEnd: 12,
    });
    const layout = workspaceLayoutStore.getState().layoutByWorkspace[workspaceKey];

    expect(firstTabId).toBe("file_/repo/worktree/a.ts");
    expect(secondTabId).toBe(firstTabId);
    expect(collectAllTabs(layout.root)).toEqual([
      {
        tabId: "file_/repo/worktree/a.ts",
        target: {
          kind: "file",
          path: "/repo/worktree/a.ts",
          lineStart: 10,
          lineEnd: 12,
        },
        createdAt: expect.any(Number),
      },
    ]);
  });

  it("openTabInBackground inserts a tab without stealing focus", () => {
    const workspaceKey = createWorkspaceKey();
    const store = workspaceLayoutStore.getState();

    const agentTabId = store.openTabFocused(workspaceKey, { kind: "agent", agentId: "agent-1" });
    const setupTabId = store.openTabInBackground(workspaceKey, {
      kind: "setup",
      workspaceId: "ws-main",
    });
    const layout = workspaceLayoutStore.getState().layoutByWorkspace[workspaceKey];
    const pane = findPaneById(layout.root, "main")!;

    expect(agentTabId).toBe("agent_agent-1");
    expect(setupTabId).toBe("setup_ws-main");
    expect(pane.tabIds).toEqual([agentTabId, setupTabId]);
    expect(pane.focusedTabId).toBe(agentTabId);
    expect(layout.focusedPaneId).toBe("main");
  });

  it("openTabInBackground on an existing target is a no-op", () => {
    const workspaceKey = createWorkspaceKey();
    const store = workspaceLayoutStore.getState();

    const firstTabId = store.openTabFocused(workspaceKey, {
      kind: "file",
      path: "/repo/worktree/a.ts",
    });
    const secondTabId = store.openTabFocused(workspaceKey, {
      kind: "file",
      path: "/repo/worktree/b.ts",
    });
    const duplicateTabId = store.openTabInBackground(workspaceKey, {
      kind: "file",
      path: "/repo/worktree/a.ts",
    });
    const layoutAfter = workspaceLayoutStore.getState().layoutByWorkspace[workspaceKey];
    // Files route to the on-demand tools pane, not the main conversation pane.
    const pane = findPaneById(layoutAfter.root, RIGHT_PANEL_PANE_ID)!;

    expect(duplicateTabId).toBe(firstTabId);
    expect(pane.tabIds).toEqual([firstTabId, secondTabId]);
    expect(pane.focusedTabId).toBe(secondTabId);
  });

  it("closing a focused middle tab selects the tab to its right", () => {
    const workspaceKey = createWorkspaceKey();
    const firstTabId = "draft-1";
    const closedTabId = "draft-2";
    const rightTabId = "draft-3";

    workspaceLayoutStore.setState((state) => ({
      ...state,
      layoutByWorkspace: {
        ...state.layoutByWorkspace,
        [workspaceKey]: {
          root: createPane({
            id: "main",
            tabIds: [firstTabId, closedTabId, rightTabId],
            focusedTabId: closedTabId,
          }),
          focusedPaneId: "main",
        },
      },
    }));

    workspaceLayoutStore.getState().closeTab(workspaceKey, closedTabId);
    const layout = workspaceLayoutStore.getState().layoutByWorkspace[workspaceKey];
    const pane = findPaneById(layout.root, "main")!;

    expect(pane.tabIds).toEqual([firstTabId, rightTabId]);
    expect(pane.focusedTabId).toBe(rightTabId);
  });

  it("closing a focused child tab returns to its parent before using tab-strip order", () => {
    const workspaceKey = createWorkspaceKey();
    const store = workspaceLayoutStore.getState();

    const parentTabId = store.openTabFocused(workspaceKey, {
      kind: "draft",
      draftId: "draft-parent",
    });
    const childTabId = store.openChildTabFocused(
      workspaceKey,
      { kind: "draft", draftId: "draft-child" },
      parentTabId!,
    );
    const rightTabId = store.openTabFocused(workspaceKey, {
      kind: "draft",
      draftId: "draft-right",
    });
    store.focusTab(workspaceKey, childTabId!);

    workspaceLayoutStore.getState().closeTab(workspaceKey, childTabId!);
    const layout = workspaceLayoutStore.getState().layoutByWorkspace[workspaceKey];
    const pane = findPaneById(layout.root, "main")!;

    expect(pane.tabIds).toEqual([parentTabId, rightTabId]);
    expect(pane.focusedTabId).toBe(parentTabId);
  });

  it("closing a focused last tab selects the tab to its left", () => {
    const workspaceKey = createWorkspaceKey();
    const leftTabId = "draft-1";
    const closedTabId = "draft-2";

    workspaceLayoutStore.setState((state) => ({
      ...state,
      layoutByWorkspace: {
        ...state.layoutByWorkspace,
        [workspaceKey]: {
          root: createPane({
            id: "main",
            tabIds: [leftTabId, closedTabId],
            focusedTabId: closedTabId,
          }),
          focusedPaneId: "main",
        },
      },
    }));

    workspaceLayoutStore.getState().closeTab(workspaceKey, closedTabId);
    const layout = workspaceLayoutStore.getState().layoutByWorkspace[workspaceKey];
    const pane = findPaneById(layout.root, "main")!;

    expect(pane.tabIds).toEqual([leftTabId]);
    expect(pane.focusedTabId).toBe(leftTabId);
  });

  it("unfocuses and restores the previous focused pane", () => {
    const workspaceKey = createWorkspaceKey();
    const store = workspaceLayoutStore.getState();

    store.openTabFocused(workspaceKey, { kind: "agent", agentId: "agent-1" });
    const token = store.unfocusPane(workspaceKey);
    expect(token).toBeTruthy();
    expect(
      workspaceLayoutStore.getState().layoutByWorkspace[workspaceKey]?.focusedPaneId,
    ).toBeNull();

    store.restorePaneFocus(workspaceKey, token!);
    expect(workspaceLayoutStore.getState().layoutByWorkspace[workspaceKey]?.focusedPaneId).toBe(
      "main",
    );
  });

  it("does not restore stale focus after another pane is focused", () => {
    useWorkspaceLayoutIds("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");
    const workspaceKey = createWorkspaceKey();
    const store = workspaceLayoutStore.getState();

    const firstTabId = store.openTabFocused(workspaceKey, { kind: "draft", draftId: "draft-1" });
    store.splitPane(workspaceKey, {
      tabId: firstTabId!,
      targetPaneId: "main",
      position: "right",
    });
    store.focusPane(workspaceKey, "main");

    const token = store.unfocusPane(workspaceKey);
    store.focusPane(workspaceKey, "pane_bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");
    store.restorePaneFocus(workspaceKey, token!);

    expect(workspaceLayoutStore.getState().layoutByWorkspace[workspaceKey]?.focusedPaneId).toBe(
      "pane_bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    );
  });

  it("waits for nested focus restorations before restoring", () => {
    const workspaceKey = createWorkspaceKey();
    const store = workspaceLayoutStore.getState();

    store.openTabFocused(workspaceKey, { kind: "agent", agentId: "agent-1" });
    const outerToken = store.unfocusPane(workspaceKey);
    const innerToken = store.unfocusPane(workspaceKey);

    store.restorePaneFocus(workspaceKey, outerToken!);
    expect(
      workspaceLayoutStore.getState().layoutByWorkspace[workspaceKey]?.focusedPaneId,
    ).toBeNull();

    store.restorePaneFocus(workspaceKey, innerToken!);
    expect(workspaceLayoutStore.getState().layoutByWorkspace[workspaceKey]?.focusedPaneId).toBe(
      "main",
    );
  });

  it("openTab creates distinct draft tabs for repeated Cmd+T/new-tab opens", () => {
    const workspaceKey = createWorkspaceKey();
    const store = workspaceLayoutStore.getState();

    const firstTabId = store.openTabFocused(workspaceKey, { kind: "draft", draftId: "draft-1" });
    const secondTabId = store.openTabFocused(workspaceKey, { kind: "draft", draftId: "draft-2" });
    const layout = workspaceLayoutStore.getState().layoutByWorkspace[workspaceKey];

    expect(firstTabId).toBe("draft-1");
    expect(secondTabId).toBe("draft-2");
    expect(firstTabId).not.toBe(secondTabId);
    expect(findPaneById(layout.root, "main")?.tabIds).toEqual([firstTabId, secondTabId]);
    expect(collectAllTabs(layout.root)).toEqual([
      {
        tabId: firstTabId,
        target: { kind: "draft", draftId: "draft-1" },
        createdAt: expect.any(Number),
      },
      {
        tabId: secondTabId,
        target: { kind: "draft", draftId: "draft-2" },
        createdAt: expect.any(Number),
      },
    ]);
  });

  it("convertDraftToAgent replaces the draft tab with a canonical agent tab in the main pane", () => {
    const workspaceKey = createWorkspaceKey();
    const store = workspaceLayoutStore.getState();

    const draftTabId = store.openTabFocused(workspaceKey, { kind: "draft", draftId: "draft-2" });

    const nextTabId = store.convertDraftToAgent(workspaceKey, draftTabId!, "agent-1");
    const layout = workspaceLayoutStore.getState().layoutByWorkspace[workspaceKey];
    const mainPane = findPaneById(layout.root, MAIN_PANE_ID);
    const convertedTab = collectAllTabs(layout.root).find((tab) => tab.tabId === nextTabId);

    expect(nextTabId).toBe("agent_agent-1");
    expect(mainPane?.tabIds).toEqual(["agent_agent-1"]);
    expect(findPaneContainingTab(layout.root, "agent_agent-1")?.id).toBe(MAIN_PANE_ID);
    expect(layout.focusedPaneId).toBe(MAIN_PANE_ID);
    expect(convertedTab).toEqual({
      tabId: "agent_agent-1",
      target: { kind: "agent", agentId: "agent-1" },
      createdAt: expect.any(Number),
    });
  });

  it("retargetTab keeps a draft tab in place while updating its target", () => {
    const workspaceKey = createWorkspaceKey();
    const store = workspaceLayoutStore.getState();

    const draftTabId = store.openTabFocused(workspaceKey, {
      kind: "draft",
      draftId: "draft-retarget",
    });
    const nextTabId = store.retargetTab(workspaceKey, draftTabId!, {
      kind: "file",
      path: "/repo/worktree/retargeted.ts",
    });
    const layout = workspaceLayoutStore.getState().layoutByWorkspace[workspaceKey];

    expect(draftTabId).toBe("draft-retarget");
    expect(nextTabId).toBe(draftTabId);
    expect(findPaneById(layout.root, "main")?.tabIds).toEqual([draftTabId!]);
    expect(collectAllTabs(layout.root)).toEqual([
      {
        tabId: draftTabId!,
        target: { kind: "file", path: "/repo/worktree/retargeted.ts" },
        createdAt: expect.any(Number),
      },
    ]);
  });

  it("retargetTab gives a non-draft tab the new target identity", () => {
    const workspaceKey = createWorkspaceKey();
    const store = workspaceLayoutStore.getState();

    const agentTabId = store.openTabFocused(workspaceKey, {
      kind: "agent",
      agentId: "agent-retarget",
    });
    const nextTabId = store.retargetTab(workspaceKey, agentTabId!, {
      kind: "draft",
      draftId: "draft-from-agent",
    });
    const layout = workspaceLayoutStore.getState().layoutByWorkspace[workspaceKey];

    expect(agentTabId).toBe("agent_agent-retarget");
    expect(nextTabId).toBe("draft-from-agent");
    expect(findPaneById(layout.root, "main")?.tabIds).toEqual(["draft-from-agent"]);
    expect(collectAllTabs(layout.root)).toEqual([
      {
        tabId: "draft-from-agent",
        target: { kind: "draft", draftId: "draft-from-agent" },
        createdAt: expect.any(Number),
      },
    ]);
  });

  it("retargetTab closes a draft tab and focuses the existing canonical target tab across panes", () => {
    // The existing file lives in the tools pane; retargeting a draft (in main)
    // onto it must close the draft and move focus across to the tools pane.
    useWorkspaceLayoutIds("55555555-5555-5555-5555-555555555555");
    const workspaceKey = createWorkspaceKey();
    const store = workspaceLayoutStore.getState();

    const existingFileTabId = store.openTabFocused(workspaceKey, {
      kind: "file",
      path: "/repo/worktree/existing.ts",
    });
    const draftTabId = store.openTabFocused(workspaceKey, { kind: "draft", draftId: "draft-dup" });

    const nextTabId = store.retargetTab(workspaceKey, draftTabId!, {
      kind: "file",
      path: "/repo/worktree/existing.ts",
    });
    const layout = workspaceLayoutStore.getState().layoutByWorkspace[workspaceKey];

    expect(existingFileTabId).toBe("file_/repo/worktree/existing.ts");
    expect(draftTabId).toBe("draft-dup");
    expect(nextTabId).toBe(existingFileTabId);
    expect(collectAllTabs(layout.root).map((tab) => tab.tabId)).toEqual([existingFileTabId!]);
    expect(layout.focusedPaneId).toBe(RIGHT_PANEL_PANE_ID);
    expect(findPaneById(layout.root, RIGHT_PANEL_PANE_ID)?.focusedTabId).toBe(existingFileTabId);
  });

  it("retargetTab closes a draft tab and focuses an existing matching target tab", () => {
    const workspaceKey = createWorkspaceKey();
    const store = workspaceLayoutStore.getState();

    const firstDraftTabId = store.openTabFocused(workspaceKey, {
      kind: "draft",
      draftId: "draft-agent-1",
    });
    const firstAgentTabId = store.retargetTab(workspaceKey, firstDraftTabId!, {
      kind: "agent",
      agentId: "agent-1",
    });
    const secondDraftTabId = store.openTabFocused(workspaceKey, {
      kind: "draft",
      draftId: "draft-agent-2",
    });

    const nextTabId = store.retargetTab(workspaceKey, secondDraftTabId!, {
      kind: "agent",
      agentId: "agent-1",
    });
    const layout = workspaceLayoutStore.getState().layoutByWorkspace[workspaceKey];

    expect(firstAgentTabId).toBe(firstDraftTabId);
    expect(nextTabId).toBe(firstDraftTabId);
    expect(collectAllTabs(layout.root)).toEqual([
      {
        tabId: firstDraftTabId!,
        target: { kind: "agent", agentId: "agent-1" },
        createdAt: expect.any(Number),
      },
    ]);
    expect(findPaneById(layout.root, "main")?.focusedTabId).toBe(firstDraftTabId);
  });

  it("reorderTabs reorders tabs within the focused pane", () => {
    const workspaceKey = createWorkspaceKey();
    const store = workspaceLayoutStore.getState();

    const firstTabId = store.openTabFocused(workspaceKey, {
      kind: "file",
      path: "/repo/worktree/a.ts",
    });
    const secondTabId = store.openTabFocused(workspaceKey, {
      kind: "file",
      path: "/repo/worktree/b.ts",
    });
    const thirdTabId = store.openTabFocused(workspaceKey, {
      kind: "file",
      path: "/repo/worktree/c.ts",
    });

    store.reorderTabs(workspaceKey, [thirdTabId!, firstTabId!]);
    const layout = workspaceLayoutStore.getState().layoutByWorkspace[workspaceKey];

    // Files route to the tools pane, which is the focused pane after opening them.
    expect(layout.focusedPaneId).toBe(RIGHT_PANEL_PANE_ID);
    expect(findPaneById(layout.root, RIGHT_PANEL_PANE_ID)).toEqual({
      id: RIGHT_PANEL_PANE_ID,
      tabIds: [thirdTabId!, firstTabId!, secondTabId!],
      focusedTabId: thirdTabId,
      tabs: [
        {
          tabId: thirdTabId,
          target: { kind: "file", path: "/repo/worktree/c.ts" },
          createdAt: expect.any(Number),
        },
        {
          tabId: firstTabId,
          target: { kind: "file", path: "/repo/worktree/a.ts" },
          createdAt: expect.any(Number),
        },
        {
          tabId: secondTabId,
          target: { kind: "file", path: "/repo/worktree/b.ts" },
          createdAt: expect.any(Number),
        },
      ],
    });
  });

  it("reorderTabsInPane reorders tabs in the requested pane without changing focused pane", () => {
    // The tools pane is reordered while focus stays on the main conversation.
    useWorkspaceLayoutIds("34343434-3434-3434-3434-343434343434");
    const workspaceKey = createWorkspaceKey();
    const store = workspaceLayoutStore.getState();

    const agentTabId = store.openTabFocused(workspaceKey, { kind: "agent", agentId: "agent-1" });
    const terminalTabId = store.openTabFocused(workspaceKey, {
      kind: "terminal",
      terminalId: "term-1",
    });
    const browserTabId = store.openTabFocused(workspaceKey, {
      kind: "browser",
      browserId: "browser-1",
    });
    // Return focus to the main conversation before reordering the tools pane.
    store.focusTab(workspaceKey, agentTabId!);

    store.reorderTabsInPane(workspaceKey, RIGHT_PANEL_PANE_ID, [browserTabId!, terminalTabId!]);
    const layout = workspaceLayoutStore.getState().layoutByWorkspace[workspaceKey];

    expect(layout.focusedPaneId).toBe(MAIN_PANE_ID);
    expect(findPaneById(layout.root, RIGHT_PANEL_PANE_ID)).toEqual({
      id: RIGHT_PANEL_PANE_ID,
      tabIds: [browserTabId!, terminalTabId!],
      focusedTabId: browserTabId,
      tabs: [
        {
          tabId: browserTabId,
          target: { kind: "browser", browserId: "browser-1" },
          createdAt: expect.any(Number),
        },
        {
          tabId: terminalTabId,
          target: { kind: "terminal", terminalId: "term-1" },
          createdAt: expect.any(Number),
        },
      ],
    });
  });

  it("closing the last tab keeps a single empty pane in the layout", () => {
    const workspaceKey = createWorkspaceKey();
    const store = workspaceLayoutStore.getState();

    const tabId = store.openTabFocused(workspaceKey, { kind: "draft", draftId: "draft-1" });
    store.closeTab(workspaceKey, tabId!);
    const layout = workspaceLayoutStore.getState().layoutByWorkspace[workspaceKey];

    expect(layout).toEqual(createDefaultLayout());
  });

  it("keeps pinned archived agents in memory per workspace without persisting them", () => {
    const workspaceKey = createWorkspaceKey();
    const otherWorkspaceKey = buildWorkspaceTabPersistenceKey({
      serverId: SERVER_ID,
      workspaceId: "ws-other-worktree",
    });

    expect(otherWorkspaceKey).toBeTruthy();

    const store = workspaceLayoutStore.getState();
    store.pinAgent(workspaceKey, "agent-1");
    store.pinAgent(workspaceKey, "agent-1");
    store.pinAgent(otherWorkspaceKey as string, "agent-2");

    let state = workspaceLayoutStore.getState();
    expect(Array.from(state.pinnedAgentIdsByWorkspace[workspaceKey] ?? [])).toEqual(["agent-1"]);
    expect(Array.from(state.pinnedAgentIdsByWorkspace[otherWorkspaceKey as string] ?? [])).toEqual([
      "agent-2",
    ]);

    store.unpinAgent(workspaceKey, "agent-1");

    state = workspaceLayoutStore.getState();
    expect(state.pinnedAgentIdsByWorkspace[workspaceKey]).toBeUndefined();
    expect(Array.from(state.pinnedAgentIdsByWorkspace[otherWorkspaceKey as string] ?? [])).toEqual([
      "agent-2",
    ]);

    const partialize = workspaceLayoutStore.persist.getOptions().partialize;
    expect(partialize).toBeTypeOf("function");
    expect(partialize?.(state)).toEqual({
      layoutByWorkspace: {},
      splitSizesByWorkspace: {},
    });
  });

  it("keeps hidden agent intents in memory per workspace without persisting them", () => {
    const workspaceKey = createWorkspaceKey();
    const otherWorkspaceKey = buildWorkspaceTabPersistenceKey({
      serverId: SERVER_ID,
      workspaceId: "ws-other-worktree",
    });

    expect(otherWorkspaceKey).toBeTruthy();

    const store = workspaceLayoutStore.getState();
    store.hideAgent(workspaceKey, "agent-1");
    store.hideAgent(workspaceKey, "agent-1");
    store.hideAgent(otherWorkspaceKey as string, "agent-2");

    let state = workspaceLayoutStore.getState();
    expect(Array.from(state.hiddenAgentIdsByWorkspace[workspaceKey] ?? [])).toEqual(["agent-1"]);
    expect(Array.from(state.hiddenAgentIdsByWorkspace[otherWorkspaceKey as string] ?? [])).toEqual([
      "agent-2",
    ]);

    store.unhideAgent(workspaceKey, "agent-1");

    state = workspaceLayoutStore.getState();
    expect(state.hiddenAgentIdsByWorkspace[workspaceKey]).toBeUndefined();
    expect(Array.from(state.hiddenAgentIdsByWorkspace[otherWorkspaceKey as string] ?? [])).toEqual([
      "agent-2",
    ]);

    const partialize = workspaceLayoutStore.persist.getOptions().partialize;
    expect(partialize).toBeTypeOf("function");
    expect(partialize?.(state)).toEqual({
      layoutByWorkspace: {},
      splitSizesByWorkspace: {},
    });
  });

  it("convertDraftToAgent removes the draft and focuses the existing canonical agent tab", () => {
    const workspaceKey = createWorkspaceKey();
    const store = workspaceLayoutStore.getState();

    // Both agents and drafts share the main conversation pane, so the existing
    // canonical agent tab already sits beside the draft being converted.
    const agentTabId = store.openTabFocused(workspaceKey, { kind: "agent", agentId: "agent-1" });
    const draftTabId = store.openTabFocused(workspaceKey, {
      kind: "draft",
      draftId: "draft-existing",
    });

    const nextTabId = store.convertDraftToAgent(workspaceKey, draftTabId!, "agent-1");
    const layout = workspaceLayoutStore.getState().layoutByWorkspace[workspaceKey];

    expect(agentTabId).toBe("agent_agent-1");
    expect(nextTabId).toBe("agent_agent-1");
    expect(collectAllTabs(layout.root).map((tab) => tab.tabId)).toEqual(["agent_agent-1"]);
    expect(layout.focusedPaneId).toBe(MAIN_PANE_ID);
    expect(findPaneContainingTab(layout.root, "agent_agent-1")?.id).toBe(MAIN_PANE_ID);
  });

  it("reconcileTabs canonicalizes duplicates and prunes stale entity tabs from hydrated snapshots", () => {
    const workspaceKey = createWorkspaceKey();

    workspaceLayoutStore.setState((state) => ({
      ...state,
      layoutByWorkspace: {
        ...state.layoutByWorkspace,
        [workspaceKey]: {
          root: {
            kind: "pane",
            pane: {
              id: "main",
              tabIds: ["draft_agent", "agent_agent-1", "terminal_orphan", "draft-1"],
              focusedTabId: "draft_agent",
              tabs: [
                {
                  tabId: "draft_agent",
                  target: { kind: "agent", agentId: "agent-1" },
                  createdAt: 1,
                },
                {
                  tabId: "agent_agent-1",
                  target: { kind: "agent", agentId: "agent-1" },
                  createdAt: 2,
                },
                {
                  tabId: "terminal_orphan",
                  target: { kind: "terminal", terminalId: "term-stale" },
                  createdAt: 3,
                },
                {
                  tabId: "draft-1",
                  target: { kind: "draft", draftId: "draft-1" },
                  createdAt: 4,
                },
              ],
            } as SplitPane,
          },
          focusedPaneId: "main",
        },
      },
      pinnedAgentIdsByWorkspace: {
        [workspaceKey]: new Set<string>(["agent-2"]),
      },
    }));

    workspaceLayoutStore.getState().reconcileTabs(workspaceKey, {
      agentsHydrated: true,
      terminalsHydrated: true,
      activeAgentIds: ["agent-1"],
      autoOpenAgentIds: ["agent-1"],
      knownAgentIds: ["agent-1", "agent-2"],
      standaloneTerminalIds: ["term-1"],
      hasActivePendingDraftCreate: false,
    });

    const layout = workspaceLayoutStore.getState().layoutByWorkspace[workspaceKey];
    const tabs = collectAllTabs(layout.root);

    // Agents (active + pinned) canonicalize into main and the stale terminal is
    // pruned, but the standalone terminal is NOT auto-opened: reconcile routes by
    // surface and never creates the tools pane, so with no tools pane present the
    // terminal has nowhere to attach.
    expect(tabs.map((tab) => tab.tabId)).toEqual(["agent_agent-1", "draft-1", "agent_agent-2"]);
    expect(collectAllPanes(layout.root).map((pane) => pane.id)).toEqual([MAIN_PANE_ID]);
    expect(isRightToolPanelOpen(layout)).toBe(false);
    expect(tabs.find((tab) => tab.tabId === "agent_agent-1")).toEqual({
      tabId: "agent_agent-1",
      target: { kind: "agent", agentId: "agent-1" },
      createdAt: 2,
    });
    expect(layout.focusedPaneId).toBe("main");
    expect(findPaneById(layout.root, "main")?.focusedTabId).toBe("agent_agent-1");
  });

  it("reconcileTabs preserves a draft-origin agent tab id when there is no duplicate", () => {
    const workspaceKey = createWorkspaceKey();

    workspaceLayoutStore.setState((state) => ({
      ...state,
      layoutByWorkspace: {
        ...state.layoutByWorkspace,
        [workspaceKey]: {
          root: {
            kind: "pane",
            pane: {
              id: "main",
              tabIds: ["draft-agent"],
              focusedTabId: "draft-agent",
              tabs: [
                {
                  tabId: "draft-agent",
                  target: { kind: "agent", agentId: "agent-1" },
                  createdAt: 1,
                },
              ],
            } as SplitPane,
          },
          focusedPaneId: "main",
        },
      },
    }));

    workspaceLayoutStore.getState().reconcileTabs(workspaceKey, {
      agentsHydrated: true,
      terminalsHydrated: true,
      activeAgentIds: ["agent-1"],
      autoOpenAgentIds: ["agent-1"],
      knownAgentIds: ["agent-1"],
      standaloneTerminalIds: [],
      hasActivePendingDraftCreate: false,
    });

    const layout = workspaceLayoutStore.getState().layoutByWorkspace[workspaceKey];

    expect(collectAllTabs(layout.root)).toEqual([
      {
        tabId: "draft-agent",
        target: { kind: "agent", agentId: "agent-1" },
        createdAt: 1,
      },
    ]);
    expect(findPaneById(layout.root, "main")?.focusedTabId).toBe("draft-agent");
  });

  it("reconcileTabs does not re-add locally hidden agent tabs", () => {
    const workspaceKey = createWorkspaceKey();

    workspaceLayoutStore.setState((state) => ({
      ...state,
      hiddenAgentIdsByWorkspace: {
        [workspaceKey]: new Set<string>(["agent-1"]),
      },
    }));

    workspaceLayoutStore.getState().reconcileTabs(workspaceKey, {
      agentsHydrated: true,
      terminalsHydrated: true,
      activeAgentIds: ["agent-1"],
      autoOpenAgentIds: ["agent-1"],
      knownAgentIds: ["agent-1"],
      standaloneTerminalIds: [],
      hasActivePendingDraftCreate: false,
    });

    expect(workspaceLayoutStore.getState().getWorkspaceTabs(workspaceKey)).toEqual([]);
  });

  it("reconcileTabs does not auto-open subagents omitted from autoOpenAgentIds", () => {
    const workspaceKey = createWorkspaceKey();

    workspaceLayoutStore.getState().reconcileTabs(workspaceKey, {
      agentsHydrated: true,
      terminalsHydrated: true,
      activeAgentIds: ["parent-agent", "child-agent"],
      autoOpenAgentIds: ["parent-agent"],
      knownAgentIds: ["parent-agent", "child-agent"],
      standaloneTerminalIds: [],
      hasActivePendingDraftCreate: false,
    });

    expect(
      workspaceLayoutStore
        .getState()
        .getWorkspaceTabs(workspaceKey)
        .map((tab) => tab.tabId),
    ).toEqual(["agent_parent-agent"]);
  });

  it("reconcileTabs keeps manually opened subagent tabs that remain active", () => {
    const workspaceKey = createWorkspaceKey();
    const store = workspaceLayoutStore.getState();

    store.openTabFocused(workspaceKey, { kind: "agent", agentId: "child-agent" });

    store.reconcileTabs(workspaceKey, {
      agentsHydrated: true,
      terminalsHydrated: true,
      activeAgentIds: ["parent-agent", "child-agent"],
      autoOpenAgentIds: ["parent-agent"],
      knownAgentIds: ["parent-agent", "child-agent"],
      standaloneTerminalIds: [],
      hasActivePendingDraftCreate: false,
    });

    expect(
      workspaceLayoutStore
        .getState()
        .getWorkspaceTabs(workspaceKey)
        .map((tab) => tab.tabId),
    ).toEqual(["agent_child-agent", "agent_parent-agent"]);
  });

  it("reconcileTabs prunes archived subagent tabs that are no longer active", () => {
    const workspaceKey = createWorkspaceKey();
    const store = workspaceLayoutStore.getState();

    store.openTabFocused(workspaceKey, { kind: "agent", agentId: "child-agent" });

    store.reconcileTabs(workspaceKey, {
      agentsHydrated: true,
      terminalsHydrated: true,
      activeAgentIds: ["parent-agent"],
      autoOpenAgentIds: ["parent-agent"],
      knownAgentIds: ["parent-agent", "child-agent"],
      standaloneTerminalIds: [],
      hasActivePendingDraftCreate: false,
    });

    expect(
      workspaceLayoutStore
        .getState()
        .getWorkspaceTabs(workspaceKey)
        .map((tab) => tab.tabId),
    ).toEqual(["agent_parent-agent"]);
  });

  it("openTabFocused reopens hidden subagent tabs and clears hidden intent", () => {
    const workspaceKey = createWorkspaceKey();
    const store = workspaceLayoutStore.getState();

    store.hideAgent(workspaceKey, "child-agent");
    store.reconcileTabs(workspaceKey, {
      agentsHydrated: true,
      terminalsHydrated: true,
      activeAgentIds: ["child-agent"],
      autoOpenAgentIds: [],
      knownAgentIds: ["child-agent"],
      standaloneTerminalIds: [],
      hasActivePendingDraftCreate: false,
    });

    expect(workspaceLayoutStore.getState().getWorkspaceTabs(workspaceKey)).toEqual([]);

    store.openTabFocused(workspaceKey, { kind: "agent", agentId: "child-agent" });

    const state = workspaceLayoutStore.getState();
    expect(state.hiddenAgentIdsByWorkspace[workspaceKey]).toBeUndefined();
    expect(state.getWorkspaceTabs(workspaceKey).map((tab) => tab.tabId)).toEqual([
      "agent_child-agent",
    ]);
  });

  it("reconcileTabs auto-opens only standalone terminals while keeping explicitly opened live terminals", () => {
    const workspaceKey = createWorkspaceKey();
    const store = workspaceLayoutStore.getState();

    const scriptTabId = store.openTabFocused(workspaceKey, {
      kind: "terminal",
      terminalId: "term-script",
    });

    store.reconcileTabs(workspaceKey, {
      agentsHydrated: true,
      terminalsHydrated: true,
      activeAgentIds: [],
      autoOpenAgentIds: [],
      knownAgentIds: [],
      knownTerminalIds: ["term-script", "term-manual"],
      standaloneTerminalIds: ["term-manual"],
      hasActivePendingDraftCreate: false,
    });

    const tabs = workspaceLayoutStore.getState().getWorkspaceTabs(workspaceKey);
    const layout = workspaceLayoutStore.getState().layoutByWorkspace[workspaceKey];
    expect(tabs.map((tab) => tab.tabId)).toEqual(["terminal_term-script", "terminal_term-manual"]);
    expect(findPaneById(layout.root, layout.focusedPaneId)?.focusedTabId).toBe(scriptTabId);
  });

  it("reconcileTabs does not auto-open live non-standalone terminals", () => {
    const workspaceKey = createWorkspaceKey();

    workspaceLayoutStore.getState().reconcileTabs(workspaceKey, {
      agentsHydrated: true,
      terminalsHydrated: true,
      activeAgentIds: [],
      autoOpenAgentIds: [],
      knownAgentIds: [],
      knownTerminalIds: ["term-script"],
      standaloneTerminalIds: [],
      hasActivePendingDraftCreate: false,
    });

    expect(workspaceLayoutStore.getState().getWorkspaceTabs(workspaceKey)).toEqual([]);
  });

  it("explicitly opening an agent tab clears hidden intent", () => {
    const workspaceKey = createWorkspaceKey();
    const store = workspaceLayoutStore.getState();

    store.hideAgent(workspaceKey, "agent-1");
    store.openTabFocused(workspaceKey, { kind: "agent", agentId: "agent-1" });

    const state = workspaceLayoutStore.getState();
    expect(state.hiddenAgentIdsByWorkspace[workspaceKey]).toBeUndefined();
    expect(state.getWorkspaceTabs(workspaceKey).map((tab) => tab.tabId)).toEqual(["agent_agent-1"]);
  });

  it("pinning an agent clears hidden intent", () => {
    const workspaceKey = createWorkspaceKey();
    const store = workspaceLayoutStore.getState();

    store.hideAgent(workspaceKey, "agent-1");
    expect(workspaceLayoutStore.getState().hiddenAgentIdsByWorkspace[workspaceKey]).toBeDefined();

    store.pinAgent(workspaceKey, "agent-1");

    const state = workspaceLayoutStore.getState();
    expect(state.hiddenAgentIdsByWorkspace[workspaceKey]).toBeUndefined();
    expect(Array.from(state.pinnedAgentIdsByWorkspace[workspaceKey] ?? [])).toEqual(["agent-1"]);
  });

  it("retargeting a tab to an agent clears hidden intent", () => {
    const workspaceKey = createWorkspaceKey();
    const store = workspaceLayoutStore.getState();

    store.hideAgent(workspaceKey, "agent-1");
    const tabId = store.openTabFocused(workspaceKey, { kind: "file", path: "/repo/worktree/a.ts" });
    store.retargetTab(workspaceKey, tabId!, { kind: "agent", agentId: "agent-1" });

    const state = workspaceLayoutStore.getState();
    expect(state.hiddenAgentIdsByWorkspace[workspaceKey]).toBeUndefined();
  });
});

describe("workspace-canvas surface routing", () => {
  beforeEach(() => {
    workspaceLayoutIds.reset();
    workspaceLayoutStore.setState({
      layoutByWorkspace: {},
      splitSizesByWorkspace: {},
      pinnedAgentIdsByWorkspace: {},
      hiddenAgentIdsByWorkspace: {},
      focusRestorationByWorkspace: {},
    });
  });

  const toolTargets: Record<"terminal" | "browser" | "file", WorkspaceTab["target"]> = {
    terminal: { kind: "terminal", terminalId: "term-1" },
    browser: { kind: "browser", browserId: "browser-1" },
    file: { kind: "file", path: "/repo/worktree/a.ts" },
  };
  for (const surface of ["terminal", "browser", "file"] as const) {
    it(`opening a ${surface} creates the tools pane on demand and lands there`, () => {
      // Opening the first tool consumes exactly one layout id for the tools
      // GROUP; the tools pane id is always the literal RIGHT_PANEL_PANE_ID.
      useWorkspaceLayoutIds("group-tools");
      const workspaceKey = createWorkspaceKey();
      const store = workspaceLayoutStore.getState();

      const tabId = store.openTabFocused(workspaceKey, toolTargets[surface]);
      const layout = workspaceLayoutStore.getState().layoutByWorkspace[workspaceKey];

      expect(collectAllPanes(layout.root).map((pane) => pane.id)).toEqual([
        MAIN_PANE_ID,
        RIGHT_PANEL_PANE_ID,
      ]);
      expect(getTreeDepth(layout.root)).toBe(2);
      expect(findPaneById(layout.root, MAIN_PANE_ID)?.tabIds).toEqual([]);
      expect(findPaneById(layout.root, RIGHT_PANEL_PANE_ID)?.tabIds).toEqual([tabId!]);
      expect(layout.focusedPaneId).toBe(RIGHT_PANEL_PANE_ID);
      expect(isRightToolPanelOpen(layout)).toBe(true);
    });
  }

  const conversationTargets: Record<"agent" | "draft" | "setup", WorkspaceTab["target"]> = {
    agent: { kind: "agent", agentId: "agent-1" },
    draft: { kind: "draft", draftId: "draft-1" },
    setup: { kind: "setup", workspaceId: "ws-main" },
  };
  for (const surface of ["agent", "draft", "setup"] as const) {
    it(`opening a ${surface} lands in the main pane and never opens the tools pane`, () => {
      const workspaceKey = createWorkspaceKey();
      const store = workspaceLayoutStore.getState();

      const tabId = store.openTabFocused(workspaceKey, conversationTargets[surface]);
      const layout = workspaceLayoutStore.getState().layoutByWorkspace[workspaceKey];

      expect(collectAllPanes(layout.root).map((pane) => pane.id)).toEqual([MAIN_PANE_ID]);
      expect(findPaneById(layout.root, MAIN_PANE_ID)?.tabIds).toEqual([tabId!]);
      expect(layout.focusedPaneId).toBe(MAIN_PANE_ID);
      expect(isRightToolPanelOpen(layout)).toBe(false);
    });
  }

  it("a second tool reuses the same tools pane without nesting", () => {
    useWorkspaceLayoutIds("group-tools");
    const workspaceKey = createWorkspaceKey();
    const store = workspaceLayoutStore.getState();

    const terminalTabId = store.openTabFocused(workspaceKey, {
      kind: "terminal",
      terminalId: "term-1",
    });
    const browserTabId = store.openTabFocused(workspaceKey, {
      kind: "browser",
      browserId: "browser-1",
    });
    const layout = workspaceLayoutStore.getState().layoutByWorkspace[workspaceKey];

    expect(collectAllPanes(layout.root).map((pane) => pane.id)).toEqual([
      MAIN_PANE_ID,
      RIGHT_PANEL_PANE_ID,
    ]);
    // Tree depth stays 2 — the second tool shares the pane, it does not nest.
    expect(getTreeDepth(layout.root)).toBe(2);
    expect(findPaneById(layout.root, RIGHT_PANEL_PANE_ID)?.tabIds).toEqual([
      terminalTabId!,
      browserTabId!,
    ]);
  });

  it("surface: right parks a side-chat agent in the tools pane", () => {
    useWorkspaceLayoutIds("group-tools");
    const workspaceKey = createWorkspaceKey();
    const store = workspaceLayoutStore.getState();

    const mainAgentTabId = store.openTabFocused(workspaceKey, {
      kind: "agent",
      agentId: "main-agent",
    });
    const sideAgentTabId = store.openTabFocused(
      workspaceKey,
      { kind: "agent", agentId: "side-agent" },
      "right",
    );
    const layout = workspaceLayoutStore.getState().layoutByWorkspace[workspaceKey];

    expect(sideAgentTabId).toBe("agent_side-agent");
    expect(findPaneById(layout.root, MAIN_PANE_ID)?.tabIds).toEqual([mainAgentTabId!]);
    expect(findPaneById(layout.root, RIGHT_PANEL_PANE_ID)?.tabIds).toEqual([sideAgentTabId!]);
    expect(layout.focusedPaneId).toBe(RIGHT_PANEL_PANE_ID);
  });

  it("closeRightToolPanel removes the tools pane and focuses main", () => {
    useWorkspaceLayoutIds("group-tools");
    const workspaceKey = createWorkspaceKey();
    const store = workspaceLayoutStore.getState();

    const agentTabId = store.openTabFocused(workspaceKey, { kind: "agent", agentId: "agent-1" });
    store.openTabFocused(workspaceKey, { kind: "terminal", terminalId: "term-1" });
    store.closeRightToolPanel(workspaceKey);
    const layout = workspaceLayoutStore.getState().layoutByWorkspace[workspaceKey];

    expect(collectAllPanes(layout.root).map((pane) => pane.id)).toEqual([MAIN_PANE_ID]);
    expect(layout.focusedPaneId).toBe(MAIN_PANE_ID);
    expect(findPaneById(layout.root, MAIN_PANE_ID)?.tabIds).toEqual([agentTabId!]);
    expect(isRightToolPanelOpen(layout)).toBe(false);
  });

  it("closing the last tools tab auto-collapses back to a single main pane", () => {
    useWorkspaceLayoutIds("group-tools");
    const workspaceKey = createWorkspaceKey();
    const store = workspaceLayoutStore.getState();

    store.openTabFocused(workspaceKey, { kind: "agent", agentId: "agent-1" });
    const terminalTabId = store.openTabFocused(workspaceKey, {
      kind: "terminal",
      terminalId: "term-1",
    });
    store.closeTab(workspaceKey, terminalTabId!);
    const layout = workspaceLayoutStore.getState().layoutByWorkspace[workspaceKey];

    expect(collectAllPanes(layout.root).map((pane) => pane.id)).toEqual([MAIN_PANE_ID]);
    expect(layout.focusedPaneId).toBe(MAIN_PANE_ID);
    expect(isRightToolPanelOpen(layout)).toBe(false);
  });

  it("reconcileTabs opens an agent into main while the tools pane is focused", () => {
    // Opening a terminal first creates and focuses the tools pane. Reconcile must
    // still route the agent into main (by surface, not focus) and never disturb
    // the focused tools pane.
    useWorkspaceLayoutIds("group-tools");
    const workspaceKey = createWorkspaceKey();
    const store = workspaceLayoutStore.getState();

    const terminalTabId = store.openTabFocused(workspaceKey, {
      kind: "terminal",
      terminalId: "term-1",
    });
    expect(workspaceLayoutStore.getState().layoutByWorkspace[workspaceKey].focusedPaneId).toBe(
      RIGHT_PANEL_PANE_ID,
    );

    store.reconcileTabs(workspaceKey, {
      agentsHydrated: true,
      terminalsHydrated: true,
      activeAgentIds: ["agent-1"],
      autoOpenAgentIds: ["agent-1"],
      knownAgentIds: ["agent-1"],
      knownTerminalIds: ["term-1"],
      standaloneTerminalIds: ["term-1"],
      hasActivePendingDraftCreate: false,
    });
    const layout = workspaceLayoutStore.getState().layoutByWorkspace[workspaceKey];

    expect(findPaneById(layout.root, MAIN_PANE_ID)?.tabIds).toEqual(["agent_agent-1"]);
    expect(findPaneById(layout.root, RIGHT_PANEL_PANE_ID)?.tabIds).toEqual([terminalTabId!]);
    // Reconcile routes by surface only; the focused tools pane is left untouched.
    expect(layout.focusedPaneId).toBe(RIGHT_PANEL_PANE_ID);
  });
});

describe("workspace-canvas selectors", () => {
  function singleMainLayout(): WorkspaceLayout {
    return {
      root: createPane({ id: MAIN_PANE_ID, tabIds: ["agent_agent-1"] }),
      focusedPaneId: MAIN_PANE_ID,
    };
  }

  function mainPlusToolsLayout(): WorkspaceLayout {
    return {
      root: {
        kind: "group",
        group: {
          id: "group-canvas",
          direction: "horizontal",
          sizes: [0.62, 0.38],
          children: [
            createPane({ id: MAIN_PANE_ID, tabIds: ["agent_agent-1"] }),
            createPane({ id: RIGHT_PANEL_PANE_ID, tabIds: ["terminal_term-1"] }),
          ],
        },
      },
      focusedPaneId: MAIN_PANE_ID,
    };
  }

  it("isRightToolPanelOpen is true iff a tools pane exists", () => {
    expect(isRightToolPanelOpen(singleMainLayout())).toBe(false);
    expect(isRightToolPanelOpen(mainPlusToolsLayout())).toBe(true);
    expect(isRightToolPanelOpen(null)).toBe(false);
  });

  it("getMainPaneId resolves the main conversation pane", () => {
    expect(getMainPaneId(singleMainLayout())).toBe(MAIN_PANE_ID);
    expect(getMainPaneId(mainPlusToolsLayout())).toBe(MAIN_PANE_ID);
  });

  it("getRightToolPane returns the tools pane only when present", () => {
    expect(getRightToolPane(singleMainLayout())).toBeNull();
    expect(getRightToolPane(mainPlusToolsLayout())?.id).toBe(RIGHT_PANEL_PANE_ID);
    expect(getRightToolPane(mainPlusToolsLayout())?.tabIds).toEqual(["terminal_term-1"]);
    expect(getRightToolPane(null)).toBeNull();
  });

  it("paneShowsTabBar is true for the tools pane or any multi-tab pane, false for a single-conversation main", () => {
    const singleMain = findPaneById(singleMainLayout().root, MAIN_PANE_ID)!;
    const toolsPane = findPaneById(mainPlusToolsLayout().root, RIGHT_PANEL_PANE_ID)!;
    const multiTabMain: SplitPane = {
      id: MAIN_PANE_ID,
      tabIds: ["agent_agent-1", "draft-1"],
      focusedTabId: "agent_agent-1",
    };

    expect(paneShowsTabBar(singleMain)).toBe(false);
    // The tools pane always shows its tab strip, even with a single tab.
    expect(paneShowsTabBar(toolsPane)).toBe(true);
    expect(paneShowsTabBar(multiTabMain)).toBe(true);
  });
});

describe("coerceToCanonicalLayout", () => {
  it("re-partitions a legacy 3-pane tree into [main(agents+drafts), tools(terminals)]", () => {
    const legacy = {
      root: {
        kind: "group",
        group: {
          id: "group-legacy",
          direction: "horizontal",
          sizes: [0.33, 0.33, 0.34],
          children: [
            createPane({
              id: "pane-a",
              tabIds: ["agent_agent-1"],
              targetsByTabId: { "agent_agent-1": { kind: "agent", agentId: "agent-1" } },
            }),
            createPane({
              id: "pane-b",
              tabIds: ["terminal_term-1"],
              targetsByTabId: { "terminal_term-1": { kind: "terminal", terminalId: "term-1" } },
            }),
            createPane({
              id: "pane-c",
              tabIds: ["draft-1"],
              targetsByTabId: { "draft-1": { kind: "draft", draftId: "draft-1" } },
            }),
          ],
        },
      },
      focusedPaneId: "pane-a",
    };

    let coerced: WorkspaceLayout | null = null;
    expect(() => {
      coerced = coerceToCanonicalLayout(legacy);
    }).not.toThrow();
    const layout = coerced!;

    expect(collectAllPanes(layout.root).map((pane) => pane.id)).toEqual([
      MAIN_PANE_ID,
      RIGHT_PANEL_PANE_ID,
    ]);
    expect(getTreeDepth(layout.root)).toBe(2);
    expect(findPaneById(layout.root, MAIN_PANE_ID)?.tabIds).toEqual(["agent_agent-1", "draft-1"]);
    expect(findPaneById(layout.root, RIGHT_PANEL_PANE_ID)?.tabIds).toEqual(["terminal_term-1"]);
    expect(layout.focusedPaneId).toBe(MAIN_PANE_ID);
  });

  it("preserves an already-canonical [main, tools] layout whose tools pane holds a side-chat agent", () => {
    const canonical = {
      root: {
        kind: "group",
        group: {
          id: "group-canonical",
          direction: "horizontal",
          sizes: [0.6, 0.4],
          children: [
            createPane({
              id: MAIN_PANE_ID,
              tabIds: ["agent_main-agent"],
              targetsByTabId: { "agent_main-agent": { kind: "agent", agentId: "main-agent" } },
            }),
            createPane({
              id: RIGHT_PANEL_PANE_ID,
              tabIds: ["agent_side-agent"],
              targetsByTabId: { "agent_side-agent": { kind: "agent", agentId: "side-agent" } },
            }),
          ],
        },
      },
      focusedPaneId: RIGHT_PANEL_PANE_ID,
    };

    const layout = coerceToCanonicalLayout(canonical);

    expect(collectAllPanes(layout.root).map((pane) => pane.id)).toEqual([
      MAIN_PANE_ID,
      RIGHT_PANEL_PANE_ID,
    ]);
    // The side-chat agent parked in tools survives the reload untouched.
    expect(findPaneById(layout.root, MAIN_PANE_ID)?.tabIds).toEqual(["agent_main-agent"]);
    expect(findPaneById(layout.root, RIGHT_PANEL_PANE_ID)?.tabIds).toEqual(["agent_side-agent"]);
    expect(layout.focusedPaneId).toBe(RIGHT_PANEL_PANE_ID);
  });

  it("collapses a single legacy pane down to the canonical main pane", () => {
    const legacy = {
      root: createPane({
        id: "pane-legacy",
        tabIds: ["agent_agent-1"],
        targetsByTabId: { "agent_agent-1": { kind: "agent", agentId: "agent-1" } },
      }),
      focusedPaneId: "pane-legacy",
    };

    const layout = coerceToCanonicalLayout(legacy);

    expect(collectAllPanes(layout.root).map((pane) => pane.id)).toEqual([MAIN_PANE_ID]);
    expect(findPaneById(layout.root, MAIN_PANE_ID)?.tabIds).toEqual(["agent_agent-1"]);
    expect(isRightToolPanelOpen(layout)).toBe(false);
  });
});
