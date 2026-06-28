import { describe, expect, it } from "vitest";
import {
  REGION_CONSTRAINTS,
  clampRegionWidth,
  resolveRegionWidthFromDrag,
  selectTopBarModel,
  selectVisibleRegions,
  type ShellLayoutSnapshot,
  type ShellRoute,
} from "./shell-regions";

// Snapshot builder — mirrors the shell-layout-store shape so selectors can be
// exercised without a live store. Defaults match s1 (left open, right/tree closed).
function makeSnapshot(overrides: Partial<ShellLayoutSnapshot> = {}): ShellLayoutSnapshot {
  return {
    leftOpen: true,
    rightOpen: false,
    fileTreeOpen: false,
    leftWidth: 240,
    widthByRegion: {},
    ...overrides,
  };
}

function workspaceRoute(workspaceKey = "ws-a"): ShellRoute {
  return { showsShell: true, workspaceKey };
}

describe("REGION_CONSTRAINTS", () => {
  // Locks the min/max/default each side region must obey (requirement §44, s3 legend).
  it("encodes the design min/max/default for each side region", () => {
    expect(REGION_CONSTRAINTS.left).toEqual({ min: 180, max: 300, default: 240 });
    expect(REGION_CONSTRAINTS.right).toEqual({ min: 320, max: 800, default: 480 });
    expect(REGION_CONSTRAINTS.fileTree).toEqual({ min: 220, max: 500, default: 280 });
  });
});

describe("clampRegionWidth", () => {
  it("returns the width unchanged when inside the region range", () => {
    expect(clampRegionWidth("left", 240)).toBe(240);
    expect(clampRegionWidth("right", 600)).toBe(600);
    expect(clampRegionWidth("fileTree", 300)).toBe(300);
  });

  it("clamps to the region minimum when dragged below it", () => {
    expect(clampRegionWidth("left", 120)).toBe(180);
    expect(clampRegionWidth("right", 100)).toBe(320);
    expect(clampRegionWidth("fileTree", 50)).toBe(220);
  });

  it("clamps to the region maximum when dragged above it", () => {
    expect(clampRegionWidth("left", 999)).toBe(300);
    expect(clampRegionWidth("right", 999)).toBe(800);
    expect(clampRegionWidth("fileTree", 999)).toBe(500);
  });

  it("falls back to the region default for non-finite input", () => {
    expect(clampRegionWidth("left", Number.NaN)).toBe(240);
    expect(clampRegionWidth("right", Number.POSITIVE_INFINITY)).toBe(480);
  });
});

describe("resolveRegionWidthFromDrag", () => {
  it("adds the drag delta to the start width", () => {
    expect(resolveRegionWidthFromDrag({ region: "left", startWidth: 240, deltaPx: 30 })).toBe(270);
    expect(resolveRegionWidthFromDrag({ region: "right", startWidth: 480, deltaPx: -100 })).toBe(
      380,
    );
  });

  it("stops at the maximum when widened past the upper bound", () => {
    expect(resolveRegionWidthFromDrag({ region: "left", startWidth: 290, deltaPx: 80 })).toBe(300);
    expect(resolveRegionWidthFromDrag({ region: "fileTree", startWidth: 480, deltaPx: 200 })).toBe(
      500,
    );
  });

  it("stops at the minimum when shrunk past the lower bound", () => {
    expect(resolveRegionWidthFromDrag({ region: "left", startWidth: 190, deltaPx: -80 })).toBe(180);
    expect(resolveRegionWidthFromDrag({ region: "right", startWidth: 340, deltaPx: -200 })).toBe(
      320,
    );
  });
});

describe("selectVisibleRegions", () => {
  it("always renders the center region with no independent width", () => {
    const regions = selectVisibleRegions(makeSnapshot(), workspaceRoute());
    expect(regions.main).toBe(true);
    expect("width" in regions).toBe(false);
  });

  it("renders left at the default width when leftOpen and shell is shown", () => {
    const regions = selectVisibleRegions(makeSnapshot({ leftOpen: true }), workspaceRoute());
    expect(regions.left).toBe(240);
  });

  it("omits a region whose toggle is closed", () => {
    const regions = selectVisibleRegions(
      makeSnapshot({ leftOpen: false, rightOpen: false, fileTreeOpen: false }),
      workspaceRoute(),
    );
    expect(regions.left).toBeUndefined();
    expect(regions.right).toBeUndefined();
    expect(regions.fileTree).toBeUndefined();
    expect(regions.main).toBe(true);
  });

  it("renders all four regions when every toggle is open (additive max state)", () => {
    const regions = selectVisibleRegions(
      makeSnapshot({ leftOpen: true, rightOpen: true, fileTreeOpen: true }),
      workspaceRoute(),
    );
    expect(regions.left).toBe(240);
    expect(regions.right).toBe(480);
    expect(regions.fileTree).toBe(280);
    expect(regions.main).toBe(true);
  });

  it("toggling one region does not affect the visibility of the others", () => {
    // Opening right while left stays open and tree stays closed — the three are independent.
    const regions = selectVisibleRegions(
      makeSnapshot({ leftOpen: true, rightOpen: true, fileTreeOpen: false }),
      workspaceRoute(),
    );
    expect(regions.left).toBe(240);
    expect(regions.right).toBe(480);
    expect(regions.fileTree).toBeUndefined();
  });

  it("reads remembered widths for the active workspace and clamps them", () => {
    // Only the two workspace tools (right + fileTree) remember per-workspace
    // widths. The left rail is global and is asserted separately below.
    const snapshot = makeSnapshot({
      rightOpen: true,
      fileTreeOpen: true,
      widthByRegion: {
        "ws-a": { right: 700, fileTree: 999 },
      },
    });
    const regions = selectVisibleRegions(snapshot, workspaceRoute("ws-a"));
    expect(regions.right).toBe(700);
    expect(regions.fileTree).toBe(500); // 999 clamped to fileTree max
  });

  it("uses defaults for a workspace with no remembered widths", () => {
    const snapshot = makeSnapshot({
      rightOpen: true,
      widthByRegion: { "ws-other": { right: 700 } },
    });
    const regions = selectVisibleRegions(snapshot, workspaceRoute("ws-a"));
    expect(regions.right).toBe(480);
  });

  it("hides right and fileTree on a route without a workspace (they are workspace tools)", () => {
    const snapshot = makeSnapshot({ leftOpen: true, rightOpen: true, fileTreeOpen: true });
    const regions = selectVisibleRegions(snapshot, { showsShell: true, workspaceKey: null });
    expect(regions.left).toBe(240);
    expect(regions.right).toBeUndefined();
    expect(regions.fileTree).toBeUndefined();
  });

  it("renders only the center region when the shell is hidden (onboarding/splash)", () => {
    const snapshot = makeSnapshot({ leftOpen: true, rightOpen: true, fileTreeOpen: true });
    const regions = selectVisibleRegions(snapshot, { showsShell: false, workspaceKey: "ws-a" });
    expect(regions).toEqual({ main: true });
  });
});

describe("selectVisibleRegions — left rail is one global width (problem ①)", () => {
  // The left rail is the app's global navigation, not a workspace tool, so its
  // width is a single value that must NOT change when you enter/leave a
  // conversation. Right + fileTree stay per-workspace; left does not.
  it("reads the left width from the global leftWidth, identical with or without a workspace", () => {
    const snapshot = makeSnapshot({ leftWidth: 280 });
    const emptyState = selectVisibleRegions(snapshot, { showsShell: true, workspaceKey: null });
    const inConversation = selectVisibleRegions(snapshot, workspaceRoute("ws-a"));
    expect(emptyState.left).toBe(280);
    expect(inConversation.left).toBe(280);
    // The whole point: entering a conversation must not move the left rail.
    expect(emptyState.left).toBe(inConversation.left);
  });

  it("clamps the global left width to the left region's min/max", () => {
    expect(selectVisibleRegions(makeSnapshot({ leftWidth: 999 }), workspaceRoute()).left).toBe(300);
    expect(selectVisibleRegions(makeSnapshot({ leftWidth: 50 }), workspaceRoute()).left).toBe(180);
  });

  it("ignores any per-workspace remembered width for the left region (single truth)", () => {
    const snapshot = makeSnapshot({
      leftWidth: 240,
      rightOpen: true,
      fileTreeOpen: true,
      // A workspace that happened to remember right/fileTree widths must not
      // pull the left rail off its single global value.
      widthByRegion: { "ws-a": { right: 700, fileTree: 300 } },
    });
    const regions = selectVisibleRegions(snapshot, workspaceRoute("ws-a"));
    expect(regions.left).toBe(240);
    expect(regions.right).toBe(700);
    expect(regions.fileTree).toBe(300);
  });
});

describe("selectTopBarModel", () => {
  const layout = { leftOpen: true, rightOpen: false, fileTreeOpen: false };

  it("passes through the title, project and branch from the truth source", () => {
    const model = selectTopBarModel({
      route: workspaceRoute(),
      conversationTitle: "重构 checkout 子系统",
      projectName: "paseo-main",
      branch: { name: "develop", dirtyCount: 2 },
      layout,
    });
    expect(model.title).toBe("重构 checkout 子系统");
    expect(model.projectName).toBe("paseo-main");
    expect(model.branch).toEqual({ name: "develop", dirtyCount: 2 });
  });

  it("marks the left toggle active when the left region is open", () => {
    const model = selectTopBarModel({
      route: workspaceRoute(),
      conversationTitle: null,
      projectName: "paseo-main",
      branch: null,
      layout: { leftOpen: true, rightOpen: false, fileTreeOpen: false },
    });
    expect(model.left).toEqual({ active: true, enabled: true });
  });

  it("derives each toggle active flag independently from its own region", () => {
    const model = selectTopBarModel({
      route: workspaceRoute(),
      conversationTitle: null,
      projectName: null,
      branch: null,
      layout: { leftOpen: false, rightOpen: true, fileTreeOpen: true },
    });
    expect(model.left.active).toBe(false);
    expect(model.right.active).toBe(true);
    expect(model.fileTree.active).toBe(true);
  });

  it("disables the right and fileTree toggles on a route without a workspace", () => {
    const model = selectTopBarModel({
      route: { showsShell: true, workspaceKey: null },
      conversationTitle: null,
      projectName: null,
      branch: null,
      layout: { leftOpen: true, rightOpen: true, fileTreeOpen: true },
    });
    expect(model.left).toEqual({ active: true, enabled: true });
    expect(model.right).toEqual({ active: false, enabled: false });
    expect(model.fileTree).toEqual({ active: false, enabled: false });
  });

  it("disables every toggle when the shell is hidden", () => {
    const model = selectTopBarModel({
      route: { showsShell: false, workspaceKey: "ws-a" },
      conversationTitle: null,
      projectName: null,
      branch: null,
      layout: { leftOpen: true, rightOpen: true, fileTreeOpen: true },
    });
    expect(model.left.enabled).toBe(false);
    expect(model.right.enabled).toBe(false);
    expect(model.fileTree.enabled).toBe(false);
  });
});
