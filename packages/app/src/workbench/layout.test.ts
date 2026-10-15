import { describe, expect, it } from "vitest";
import { BROWSER_START_URL } from "@/desktop/browser/start-page";
import { useBrowserStore } from "@/desktop/browser/store";
import { closeTabInLayout, type WorkspaceLayout } from "@/stores/workspace-layout-actions";
import { reconcileWorkbenchLayout, workbenchContentPaneId } from "./layout";

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

describe("reconcileWorkbenchLayout", () => {
  it("fills an empty content pane with a browser start page", () => {
    const layout = reconcileWorkbenchLayout(layoutWithEmptyContent());
    const content = layout.root.kind === "group" ? layout.root.group.children[1] : null;
    const tab = content?.kind === "pane" ? content.pane.tabs?.[0] : null;
    expect(tab?.target.kind).toBe("browser");
    if (tab?.target.kind !== "browser") return;
    expect(useBrowserStore.getState().browsersById[tab.target.browserId]?.url).toBe(
      BROWSER_START_URL,
    );
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
    expect(contentTab?.target.kind).toBe("browser");
    if (contentTab?.target.kind !== "browser") return;
    expect(useBrowserStore.getState().browsersById[contentTab.target.browserId]?.url).toBe(
      BROWSER_START_URL,
    );
  });
});
