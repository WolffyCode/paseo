import { describe, expect, it } from "vitest";
import {
  canDismissPaneInLayout,
  closeTabInLayout,
  createDefaultLayout,
  splitPaneEmptyInLayout,
  type WorkspaceLayout,
} from "@/stores/workspace-layout-actions";
import {
  createWorkbenchLayout,
  focusedContentTab,
  reconcileWorkbenchLayout,
  showsWorkbenchTabBar,
  workbenchContentPaneId,
  workbenchPanes,
} from "./layout";

function layoutWithEmptyContent(): WorkspaceLayout {
  return {
    root: {
      kind: "group",
      group: {
        id: "workbench",
        direction: "horizontal",
        sizes: [1, 1, 1],
        children: [
          {
            kind: "pane",
            pane: {
              id: "workbench:conversations",
              tabs: [
                {
                  tabId: "conversation",
                  target: { kind: "agent", agentId: "agent-1" },
                  createdAt: 0,
                },
              ],
              tabIds: ["conversation"],
              focusedTabId: "conversation",
            },
          },
          {
            kind: "pane",
            pane: {
              id: workbenchContentPaneId("agent:agent-1"),
              tabs: [],
              tabIds: [],
              focusedTabId: null,
            },
          },
          {
            kind: "pane",
            pane: {
              id: "workbench:files:agent:agent-1",
              tabs: [{ tabId: "tree", target: { kind: "files" }, createdAt: 0 }],
              tabIds: ["tree"],
              focusedTabId: "tree",
            },
          },
        ],
      },
    },
    focusedPaneId: "workbench:conversations",
  };
}

describe("column 2", () => {
  it("has no tab bar while column 3 keeps one", () => {
    expect(showsWorkbenchTabBar("workbench:conversations")).toBe(false);
    expect(showsWorkbenchTabBar(workbenchContentPaneId("agent:agent-1"))).toBe(true);
    expect(showsWorkbenchTabBar("main-pane")).toBe(true);
  });

  it("does not split the conversation pane", () => {
    const result = splitPaneEmptyInLayout({
      layout: layoutWithEmptyContent(),
      targetPaneId: "workbench:conversations",
      position: "right",
      maxTreeDepth: 6,
      createNodeId: (prefix) => `${prefix}-1`,
    });
    expect(result).toBeNull();
  });

  it("does not dismiss the conversation pane", () => {
    const layout = layoutWithEmptyContent();
    expect(canDismissPaneInLayout(layout, "workbench:conversations")).toBe(false);
    expect(canDismissPaneInLayout(layout, "workbench:conversations:pane-2")).toBe(false);
    expect(canDismissPaneInLayout(layout, workbenchContentPaneId("agent:agent-1"))).toBe(false);
  });

  it("folds an extra conversation region back into the one conversation pane", () => {
    const source = layoutWithEmptyContent();
    const root = source.root.kind === "group" ? source.root : null;
    if (!root) return;
    const split: WorkspaceLayout = {
      ...source,
      root: {
        kind: "group",
        group: {
          ...root.group,
          children: [
            {
              kind: "group",
              group: {
                id: "workbench:conversation-board",
                direction: "horizontal",
                sizes: [0.5, 0.5],
                children: [
                  root.group.children[0],
                  {
                    kind: "pane",
                    pane: {
                      id: "workbench:conversations:pane-2",
                      tabs: [
                        {
                          tabId: "other",
                          target: { kind: "agent", agentId: "agent-2" },
                          createdAt: 0,
                        },
                      ],
                      tabIds: ["other"],
                      focusedTabId: "other",
                    },
                  },
                ],
              },
            },
            ...root.group.children.slice(1),
          ],
        },
      },
    };
    const layout = reconcileWorkbenchLayout(split);
    const conversations = workbenchPanes(layout).filter(
      (pane) =>
        pane.id === "workbench:conversations" || pane.id.startsWith("workbench:conversations:"),
    );
    expect(conversations).toHaveLength(1);
    expect(conversations[0]?.tabs?.map((tab) => tab.tabId)).toEqual(["conversation", "other"]);
  });
});

describe("reconcileWorkbenchLayout", () => {
  it("fills an empty content pane with the home tab", () => {
    const layout = reconcileWorkbenchLayout(layoutWithEmptyContent());
    const content = layout.root.kind === "group" ? layout.root.group.children[1] : null;
    const tab = content?.kind === "pane" ? content.pane.tabs?.[0] : null;
    expect(tab?.target.kind).toBe("new_tab");
  });

  it("keeps an empty conversation pane on a new tab", () => {
    const source = layoutWithEmptyContent();
    const root = source.root.kind === "group" ? source.root : null;
    if (!root) return;
    const layout = closeTabInLayout({
      layout: {
        ...source,
        root: {
          kind: "group",
          group: {
            ...root.group,
            children: [
              {
                kind: "pane",
                pane: {
                  id: "workbench:conversations",
                  tabs: [
                    { tabId: "draft", target: { kind: "draft", draftId: "draft-1" }, createdAt: 0 },
                  ],
                  tabIds: ["draft"],
                  focusedTabId: "draft",
                },
              },
              {
                kind: "pane",
                pane: {
                  id: workbenchContentPaneId("draft:draft-1"),
                  tabs: [
                    { tabId: "page", target: { kind: "file", path: "notes.md" }, createdAt: 0 },
                  ],
                  tabIds: ["page"],
                  focusedTabId: "page",
                },
              },
            ],
          },
        },
      },
      tabId: "draft",
      explorerSidebarPaneId: null,
    });
    const children = layout?.root.kind === "group" ? layout.root.group.children : [];
    const conversation = children[0];
    expect(conversation?.kind === "pane" ? conversation.pane.tabs?.[0]?.target.kind : null).toBe(
      "new_tab",
    );

    const closedContent = closeTabInLayout({
      layout: layout ?? source,
      tabId: "page",
      explorerSidebarPaneId: null,
    });
    const content =
      closedContent?.root.kind === "group" ? closedContent.root.group.children[1] : null;
    const contentTab = content?.kind === "pane" ? content.pane.tabs?.[0] : null;
    expect(contentTab?.target.kind).toBe("new_tab");
  });
});

describe("focusedContentTab", () => {
  it("returns the tab column 3 shows for the active conversation", () => {
    const layout = createWorkbenchLayout({
      tabs: [
        { tabId: "one", target: { kind: "agent", agentId: "one" }, createdAt: 0 },
        { tabId: "two", target: { kind: "agent", agentId: "two" }, createdAt: 0 },
        { tabId: "one-file", target: { kind: "file", path: "a.ts" }, createdAt: 0 },
        { tabId: "two-file", target: { kind: "file", path: "b.ts" }, createdAt: 0 },
      ],
      focusedTabId: "two",
      parentTabIdByTabId: { "one-file": "one", "two-file": "two" },
    });

    expect(focusedContentTab(layout)?.tabId).toBe("two-file");
  });

  it("returns null outside the four-column layout", () => {
    expect(focusedContentTab(createDefaultLayout())).toBeNull();
  });
});
