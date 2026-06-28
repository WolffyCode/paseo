import { describe, expect, it } from "vitest";
import {
  REGION_CONSTRAINTS,
  clampRegionWidth,
  resolveRegionWidthFromDrag,
  selectTopBar,
  selectVisibleRegions,
  type ShellContext,
  type ShellSnapshot,
} from "./regions";

// Snapshot builder — mirrors the shell-store state shape so the pure selectors can be
// exercised without a live store. Defaults match s1 (conversation page, left open,
// right/tree closed, settings nav open, left width 240).
function snap(overrides: Partial<ShellSnapshot> = {}): ShellSnapshot {
  return {
    currentPage: "conversation",
    leftOpen: true,
    rightOpen: false,
    fileTreeOpen: false,
    settingsLeftOpen: true,
    leftWidth: 240,
    widthByRegion: {},
    ...overrides,
  };
}

// A connected context with an active workspace (keys the right/fileTree width memory
// and gates those two tools). `showsShell` is true once a host is connected.
function shown(workspaceKey: string | null = "srv:ws"): ShellContext {
  return { showsShell: true, workspaceKey };
}

describe("REGION_CONSTRAINTS", () => {
  // Locks the min/max/default each side region must obey (requirement §6.7, s3 legend).
  // These values are the shell's geometry contract and must not drift.
  it("encodes the design min/max/default for each side region", () => {
    expect(REGION_CONSTRAINTS.left).toEqual({ min: 180, max: 300, default: 240 });
    expect(REGION_CONSTRAINTS.right).toEqual({ min: 320, max: 800, default: 480 });
    expect(REGION_CONSTRAINTS.fileTree).toEqual({ min: 220, max: 500, default: 280 });
  });
});

describe("clampRegionWidth", () => {
  // Below-min / above-max inputs stop at the bound so a drag past the edge or a stale
  // stored value can never produce a region narrower/wider than the design allows.
  it("clamps to the region bounds", () => {
    expect(clampRegionWidth("left", 100)).toBe(180);
    expect(clampRegionWidth("left", 999)).toBe(300);
    expect(clampRegionWidth("right", 200)).toBe(320);
    expect(clampRegionWidth("right", 1200)).toBe(800);
    expect(clampRegionWidth("fileTree", 0)).toBe(220);
    expect(clampRegionWidth("fileTree", 600)).toBe(500);
  });

  // A non-finite input (corrupted persisted value) collapses to the region default
  // rather than producing NaN geometry that would break the layout.
  it("falls back to the region default for non-finite input", () => {
    expect(clampRegionWidth("left", Number.NaN)).toBe(240);
    expect(clampRegionWidth("right", Number.POSITIVE_INFINITY)).toBe(480);
  });
});

describe("resolveRegionWidthFromDrag", () => {
  // A drag delta is added to the start width then clamped; dragging past a bound
  // stops at the bound (no overshoot).
  it("adds the delta then clamps to bounds", () => {
    expect(resolveRegionWidthFromDrag({ region: "left", startWidth: 240, deltaPx: 20 })).toBe(260);
    expect(resolveRegionWidthFromDrag({ region: "left", startWidth: 240, deltaPx: 999 })).toBe(300);
    expect(resolveRegionWidthFromDrag({ region: "right", startWidth: 480, deltaPx: -400 })).toBe(
      320,
    );
  });
});

describe("selectVisibleRegions · conversation page", () => {
  // The center canvas is always present and width-less regardless of any toggle —
  // requirement §6.5 "对话区始终在场、自适应填满剩余宽度、无独立宽度".
  it("always includes main and never gives it a width", () => {
    const regions = selectVisibleRegions(snap({ leftOpen: false }), shown());
    expect(regions.main).toBe(true);
    expect("width" in (regions as object)).toBe(false);
  });

  // Enumerate all 2³ = 8 toggle combinations (s3 matrix). The three toggles are
  // additive and independent: each region appears exactly when its own flag is set,
  // with no toggle suppressing another. left=global leftWidth; right=480; fileTree=280.
  it("renders exactly the open regions across all 8 toggle combinations", () => {
    for (let mask = 0; mask < 8; mask++) {
      const leftOpen = Boolean(mask & 0b100);
      const rightOpen = Boolean(mask & 0b010);
      const fileTreeOpen = Boolean(mask & 0b001);
      const regions = selectVisibleRegions(snap({ leftOpen, rightOpen, fileTreeOpen }), shown());
      expect(regions.main).toBe(true);
      expect(regions.left).toBe(leftOpen ? 240 : undefined);
      expect(regions.right).toBe(rightOpen ? 480 : undefined);
      expect(regions.fileTree).toBe(fileTreeOpen ? 280 : undefined);
    }
  });

  // right + fileTree are workspace-scoped tools: without an active workspaceKey they
  // stay closed even when their flags are true. The left rail is global navigation, so
  // it still opens on leftOpen with no workspace.
  it("hides right + fileTree without a workspaceKey but keeps the global left", () => {
    const regions = selectVisibleRegions(
      snap({ leftOpen: true, rightOpen: true, fileTreeOpen: true }),
      shown(null),
    );
    expect(regions.left).toBe(240);
    expect(regions.right).toBeUndefined();
    expect(regions.fileTree).toBeUndefined();
  });

  // A per-workspace remembered width (already clamped) is used for the tool when
  // present; a sibling workspace's memory and the sibling tool stay untouched.
  it("uses the per-workspace remembered width for a tool", () => {
    const regions = selectVisibleRegions(
      snap({ rightOpen: true, widthByRegion: { "srv:ws": { right: 600 } } }),
      shown("srv:ws"),
    );
    expect(regions.right).toBe(600);
  });
});

describe("selectVisibleRegions · settings page", () => {
  // Settings is [left nav | content]. The left nav shares the left geometry and opens
  // on settingsLeftOpen; the content fills the rest (main). right/fileTree never appear.
  it("shows the settings nav (left geometry) when settingsLeftOpen", () => {
    const regions = selectVisibleRegions(snap({ currentPage: "settings" }), shown());
    expect(regions.main).toBe(true);
    expect(regions.left).toBe(240);
    expect(regions.right).toBeUndefined();
    expect(regions.fileTree).toBeUndefined();
  });

  // Collapsing the settings nav hides the left card; content occupies the full width.
  it("hides the settings nav when settingsLeftOpen is false", () => {
    const regions = selectVisibleRegions(
      snap({ currentPage: "settings", settingsLeftOpen: false }),
      shown(),
    );
    expect(regions.left).toBeUndefined();
  });

  // The workspace-tool flags belong to the conversation page; settings must never leak
  // a right/fileTree card even if those flags were left open before entering settings.
  it("never shows right/fileTree even when their flags are open", () => {
    const regions = selectVisibleRegions(
      snap({ currentPage: "settings", rightOpen: true, fileTreeOpen: true }),
      shown(),
    );
    expect(regions.right).toBeUndefined();
    expect(regions.fileTree).toBeUndefined();
  });
});

describe("selectVisibleRegions · pre-connection", () => {
  // Before a host connects the shell chrome is suppressed: only the center renders so
  // onboarding/splash fill the window edge to edge.
  it("returns only main when the shell is not shown", () => {
    const regions = selectVisibleRegions(snap({ leftOpen: true }), {
      showsShell: false,
      workspaceKey: null,
    });
    expect(regions).toEqual({ main: true });
  });
});

describe("selectTopBar · conversation page", () => {
  // The conversation top bar has no back button and three independent region toggles,
  // each active when its panel is open.
  it("reports no back button and toggle active states from the flags", () => {
    const bar = selectTopBar(
      snap({ leftOpen: true, rightOpen: false, fileTreeOpen: true }),
      shown(),
    );
    expect(bar.showBack).toBe(false);
    expect(bar.left).toEqual({ active: true, enabled: true });
    expect(bar.right).toEqual({ active: false, enabled: true });
    expect(bar.fileTree).toEqual({ active: true, enabled: true });
  });

  // right + fileTree toggles require an active workspace; without one they are disabled
  // (and therefore inactive). The left toggle stays enabled (global navigation).
  it("disables the workspace-tool toggles without a workspaceKey", () => {
    const bar = selectTopBar(snap({ rightOpen: true, fileTreeOpen: true }), shown(null));
    expect(bar.left.enabled).toBe(true);
    expect(bar.right).toEqual({ active: false, enabled: false });
    expect(bar.fileTree).toEqual({ active: false, enabled: false });
  });
});

describe("selectTopBar · settings page", () => {
  // The settings top bar shows the back button and only the left-nav toggle (driven by
  // settingsLeftOpen). The two workspace-tool toggles do not exist on this page.
  it("shows back, maps left to settingsLeftOpen, and drops right/fileTree", () => {
    const bar = selectTopBar(
      snap({ currentPage: "settings", settingsLeftOpen: true, leftOpen: false }),
      shown(),
    );
    expect(bar.showBack).toBe(true);
    expect(bar.left).toEqual({ active: true, enabled: true });
    expect(bar.right).toBeNull();
    expect(bar.fileTree).toBeNull();
  });
});
