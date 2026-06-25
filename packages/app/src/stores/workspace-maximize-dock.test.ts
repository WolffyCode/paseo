import { describe, expect, it, vi } from "vitest";

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

import { deriveWorkspacePaneState } from "@/screens/workspace/workspace-pane-state";
import {
  keepOnlyRightToolPanelInLayout,
  removeRightToolPanelFromLayout,
} from "@/stores/workspace-layout-actions";
import {
  collectAllTabs,
  findPaneById,
  type SplitNode,
  type SplitPane,
  type WorkspaceLayout,
} from "@/stores/workspace-layout-store";
import type { WorkspaceTab } from "@/stores/workspace-tabs-store";
import { MAIN_PANE_ID, RIGHT_PANEL_PANE_ID } from "@/workspace-tabs/tab-surface";

function pane(id: string, tab: WorkspaceTab): SplitNode {
  return {
    kind: "pane",
    pane: {
      id,
      tabIds: [tab.tabId],
      focusedTabId: tab.tabId,
      tabs: [tab],
    } as SplitPane,
  };
}

const AGENT_TAB: WorkspaceTab = {
  tabId: "agent_a1",
  target: { kind: "agent", agentId: "a1" },
  createdAt: 1,
};
const TERMINAL_TAB: WorkspaceTab = {
  tabId: "terminal_t1",
  target: { kind: "terminal", terminalId: "t1" },
  createdAt: 1,
};

// MAIN conversation + RIGHT_PANEL tool side by side — the shape that maximize acts on.
function mainAgentPlusToolLayout(): WorkspaceLayout {
  return {
    root: {
      kind: "group",
      group: {
        id: "g-canvas",
        direction: "horizontal",
        sizes: [0.6, 0.4],
        children: [pane(MAIN_PANE_ID, AGENT_TAB), pane(RIGHT_PANEL_PANE_ID, TERMINAL_TAB)],
      },
    },
    focusedPaneId: MAIN_PANE_ID,
  };
}

function singleMainLayout(): WorkspaceLayout {
  return {
    root: pane(MAIN_PANE_ID, AGENT_TAB),
    focusedPaneId: MAIN_PANE_ID,
  };
}

describe("maximize tool panel render transform", () => {
  it("keepOnly drops MAIN and keeps the tool pane focused so the tool fills the canvas", () => {
    const next = keepOnlyRightToolPanelInLayout(mainAgentPlusToolLayout());
    expect(findPaneById(next.root, MAIN_PANE_ID)).toBeNull();
    expect(findPaneById(next.root, RIGHT_PANEL_PANE_ID)?.id).toBe(RIGHT_PANEL_PANE_ID);
    expect(next.focusedPaneId).toBe(RIGHT_PANEL_PANE_ID);
  });

  it("keepOnly mirrors collapse: each keeps exactly what the other drops", () => {
    const layout = mainAgentPlusToolLayout();
    const maximized = keepOnlyRightToolPanelInLayout(layout);
    const collapsed = removeRightToolPanelFromLayout(layout);
    expect(findPaneById(maximized.root, MAIN_PANE_ID)).toBeNull();
    expect(findPaneById(maximized.root, RIGHT_PANEL_PANE_ID)).not.toBeNull();
    expect(findPaneById(collapsed.root, RIGHT_PANEL_PANE_ID)).toBeNull();
    expect(findPaneById(collapsed.root, MAIN_PANE_ID)).not.toBeNull();
  });

  it("keepOnly is a no-op when there is no tool pane to maximize", () => {
    const layout = singleMainLayout();
    expect(keepOnlyRightToolPanelInLayout(layout)).toBe(layout);
  });
});

describe("maximized composer dock data source", () => {
  it("recovers the MAIN agent from the persisted layout even though the render layout dropped MAIN", () => {
    // The dock reads the ORIGINAL layout (the persisted one), not the maximized render
    // layout, to find which conversation to keep chatting with.
    const layout = mainAgentPlusToolLayout();
    const tabs = collectAllTabs(layout.root);

    // The maximized render layout has no MAIN pane to host the composer...
    expect(findPaneById(keepOnlyRightToolPanelInLayout(layout).root, MAIN_PANE_ID)).toBeNull();

    // ...but the dock still resolves the active agent conversation from the persisted layout.
    const mainState = deriveWorkspacePaneState({ layout, paneId: MAIN_PANE_ID, tabs });
    expect(mainState.activeTab?.descriptor.target).toEqual({ kind: "agent", agentId: "a1" });
  });
});
