import { describe, expect, it } from "vitest";
import {
  type SplitNode,
  selectRightPanelMode,
  type WorkspaceLayout,
} from "@/stores/workspace-layout-actions";
import { MAIN_PANE_ID, RIGHT_PANEL_PANE_ID } from "@/workspace-tabs/tab-surface";

// Minimal pane node: selectRightPanelMode only inspects the tools pane's tab count.
function pane(id: string, tabIds: string[]): SplitNode {
  return {
    kind: "pane",
    pane: { id, tabIds, focusedTabId: tabIds[tabIds.length - 1] ?? null },
  };
}

function layoutOf(root: SplitNode, focusedPaneId: string): WorkspaceLayout {
  return { root, focusedPaneId };
}

function singleMainLayout(): WorkspaceLayout {
  return layoutOf(pane(MAIN_PANE_ID, ["agent_a"]), MAIN_PANE_ID);
}

function mainPlusToolsLayout(toolTabIds: string[]): WorkspaceLayout {
  return layoutOf(
    {
      kind: "group",
      group: {
        id: "group-canvas",
        direction: "horizontal",
        sizes: [0.62, 0.38],
        children: [pane(MAIN_PANE_ID, ["agent_a"]), pane(RIGHT_PANEL_PANE_ID, toolTabIds)],
      },
    },
    MAIN_PANE_ID,
  );
}

describe("selectRightPanelMode", () => {
  // 反馈② 启动器默认态：右面板刚打开（空 pane）或全部 tab 关完 → 显启动器，不显 tab 页签条/「+」。
  it("returns 'launcher' when there is no tools pane at all", () => {
    expect(selectRightPanelMode(singleMainLayout())).toBe("launcher");
  });

  it("returns 'launcher' for null / undefined layouts", () => {
    expect(selectRightPanelMode(null)).toBe("launcher");
    expect(selectRightPanelMode(undefined)).toBe("launcher");
  });

  // 「关完所有 tab = 回启动器默认态」: an empty-but-present tools pane is the launcher state.
  it("returns 'launcher' when the tools pane exists but holds no tabs", () => {
    expect(selectRightPanelMode(mainPlusToolsLayout([]))).toBe("launcher");
  });

  // Once any tool tab is open the panel shows its tab strip (and the「新选项卡 +」).
  it("returns 'tabs' as soon as the tools pane holds at least one tab", () => {
    expect(selectRightPanelMode(mainPlusToolsLayout(["terminal_t1"]))).toBe("tabs");
    expect(selectRightPanelMode(mainPlusToolsLayout(["review_ws", "browser_b1"]))).toBe("tabs");
  });
});
