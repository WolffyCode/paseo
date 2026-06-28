import { autorun } from "mobx";
import { beforeEach, describe, expect, it } from "vitest";
import { parsePersistedShellState, partializeShellState, ShellModel } from "./shell-model";

// The desktop shell's single model (class + MobX): page mode, region visibility, region
// geometry, and the route context in one transactional truth source. Each test builds a
// fresh instance (no shared singleton), so state never leaks between cases.
let model: ShellModel;
beforeEach(() => {
  model = new ShellModel();
});

describe("ShellModel · initial state", () => {
  // The landing state is s1 (requirement §3 "落地对话页默认态"): conversation page, left
  // open, right + tree closed, settings nav open, left 240. Context defaults to "no shell,
  // no workspace" until the route feeds it via setContext.
  it("matches the s1 landing defaults", () => {
    expect(model.currentPage).toBe("conversation");
    expect(model.leftOpen).toBe(true);
    expect(model.rightOpen).toBe(false);
    expect(model.fileTreeOpen).toBe(false);
    expect(model.settingsLeftOpen).toBe(true);
    expect(model.leftWidth).toBe(240);
    expect(model.widthByRegion).toEqual({});
    expect(model.showsShell).toBe(false);
    expect(model.workspaceKey).toBeNull();
  });
});

describe("ShellModel · region toggles are additive and independent", () => {
  // Each toggle flips only its own flag; the other two never move.
  it("toggleLeft flips only leftOpen", () => {
    model.toggleLeft();
    expect(model.leftOpen).toBe(false);
    expect(model.rightOpen).toBe(false);
    expect(model.fileTreeOpen).toBe(false);
  });

  it("toggleRight flips only rightOpen", () => {
    model.toggleRight();
    expect(model.rightOpen).toBe(true);
    expect(model.leftOpen).toBe(true);
    expect(model.fileTreeOpen).toBe(false);
  });

  it("toggleFileTree flips only fileTreeOpen", () => {
    model.toggleFileTree();
    expect(model.fileTreeOpen).toBe(true);
    expect(model.leftOpen).toBe(true);
    expect(model.rightOpen).toBe(false);
  });
});

describe("ShellModel · openRight / closeRight are idempotent", () => {
  // The composition primitives "ensure open / ensure closed" must not flip on repeat —
  // calling twice lands the same as calling once.
  it("openRight sets true and stays true; closeRight sets false and stays false", () => {
    model.openRight();
    expect(model.rightOpen).toBe(true);
    model.openRight();
    expect(model.rightOpen).toBe(true);
    model.closeRight();
    expect(model.rightOpen).toBe(false);
    model.closeRight();
    expect(model.rightOpen).toBe(false);
  });
});

describe("ShellModel · width writes clamp and stay scoped", () => {
  // The left rail's width is global and clamps to its own bounds.
  it("setLeftWidth clamps to the left bounds", () => {
    model.setLeftWidth(999);
    expect(model.leftWidth).toBe(300);
    model.setLeftWidth(10);
    expect(model.leftWidth).toBe(180);
  });

  // A tool width clamps to that tool's bounds and is keyed by workspace; writing one
  // workspace's tool leaves other workspaces and the sibling tool untouched.
  it("setRegionWidth clamps and isolates by workspace + tool", () => {
    model.setRegionWidth("ws-a", "right", 5000);
    model.setRegionWidth("ws-b", "fileTree", 240);
    expect(model.widthByRegion["ws-a"]).toEqual({ right: 800 });
    expect(model.widthByRegion["ws-b"]).toEqual({ fileTree: 240 });
  });
});

describe("ShellModel · resetRegionWidth returns to the design default", () => {
  // Gutter double-click resets a region to its default: left globally, right/tree by key.
  it("resets left globally and a tool by workspace key", () => {
    model.setLeftWidth(180);
    model.resetRegionWidth("left");
    expect(model.leftWidth).toBe(240);

    model.setRegionWidth("ws-a", "right", 320);
    model.resetRegionWidth("right", "ws-a");
    expect(model.widthByRegion["ws-a"]?.right).toBe(480);
  });
});

describe("ShellModel · settings isolation (the return-restores-for-free invariant)", () => {
  // Entering settings must not mutate any conversation flag or width — that isolation is
  // what makes "return to conversation" restore the prior layout with no snapshot.
  it("openSettings changes only currentPage", () => {
    model.toggleLeft(); // leftOpen → false
    model.openRight(); // rightOpen → true
    model.toggleFileTree(); // fileTreeOpen → true
    model.setLeftWidth(260);
    model.setRegionWidth("ws-a", "right", 520);
    model.openSettings();
    expect(model.currentPage).toBe("settings");
    expect(model.leftOpen).toBe(false);
    expect(model.rightOpen).toBe(true);
    expect(model.fileTreeOpen).toBe(true);
    expect(model.leftWidth).toBe(260);
    expect(model.widthByRegion).toEqual({ "ws-a": { right: 520 } });
  });

  // A full enter → toggle settings nav → return cycle leaves the conversation layout
  // exactly as it was before entering settings.
  it("closeSettings restores the conversation layout after toggling the settings nav", () => {
    model.toggleLeft();
    model.openRight();
    model.setLeftWidth(280);
    const before = {
      leftOpen: model.leftOpen,
      rightOpen: model.rightOpen,
      fileTreeOpen: model.fileTreeOpen,
      leftWidth: model.leftWidth,
    };
    model.openSettings();
    model.toggleSettingsLeft();
    model.closeSettings();
    expect(model.currentPage).toBe("conversation");
    expect({
      leftOpen: model.leftOpen,
      rightOpen: model.rightOpen,
      fileTreeOpen: model.fileTreeOpen,
      leftWidth: model.leftWidth,
    }).toEqual(before);
  });

  // The settings-nav toggle is the settings slice's own flag; it must never reach into the
  // conversation left rail.
  it("toggleSettingsLeft flips only settingsLeftOpen, never leftOpen", () => {
    model.toggleSettingsLeft();
    expect(model.settingsLeftOpen).toBe(false);
    expect(model.leftOpen).toBe(true);
  });
});

describe("ShellModel · context-driven computeds", () => {
  // Pre-context (showsShell false) the shell chrome is suppressed: visibleRegions is only
  // the center, and every top-bar toggle is disabled.
  it("suppresses chrome until a context is set", () => {
    expect(model.visibleRegions).toEqual({ main: true });
    expect(model.topBar.left.enabled).toBe(false);
  });

  // Once the route feeds a shown context with an active workspace, the computeds reflect
  // the open flags: default left rail visible, tools enabled-but-closed.
  it("reflects the open flags after setContext", () => {
    model.setContext({ showsShell: true, workspaceKey: "srv:ws" });
    expect(model.visibleRegions).toEqual({ main: true, left: 240 });
    expect(model.topBar.showBack).toBe(false);
    expect(model.topBar.left).toEqual({ active: true, enabled: true });
    expect(model.topBar.right).toEqual({ active: false, enabled: true });
    expect(model.topBar.fileTree).toEqual({ active: false, enabled: true });
  });

  // The computeds are reactive: opening a tool after the context is set re-derives
  // visibleRegions (an autorun re-runs), which is what repaints observer components.
  it("re-derives visibleRegions when a toggle changes", () => {
    model.setContext({ showsShell: true, workspaceKey: "srv:ws" });
    const widths: (number | undefined)[] = [];
    const dispose = autorun(() => widths.push(model.visibleRegions.right));
    model.toggleRight();
    dispose();
    expect(widths).toEqual([undefined, 480]);
  });
});

describe("ShellModel · persistence excludes the page mode and the route context", () => {
  // currentPage is intentionally not persisted (a reload always lands on conversation);
  // the route context (showsShell / workspaceKey) is runtime-only. Only the layout slice
  // survives a reload.
  it("partialize keeps only the layout slice", () => {
    model.openSettings();
    model.setContext({ showsShell: true, workspaceKey: "srv:ws" });
    const persisted = partializeShellState(model);
    expect("currentPage" in persisted).toBe(false);
    expect("showsShell" in persisted).toBe(false);
    expect("workspaceKey" in persisted).toBe(false);
    expect(persisted).toEqual({
      leftOpen: true,
      rightOpen: false,
      fileTreeOpen: false,
      settingsLeftOpen: true,
      leftWidth: 240,
      widthByRegion: {},
    });
  });

  // hydrate applies a persisted slice (e.g. on cold start) without touching the page mode
  // or the route context — the reload lands on the conversation page with restored widths.
  it("hydrate restores the layout slice and leaves the page mode on conversation", () => {
    model.hydrate({
      leftOpen: false,
      rightOpen: true,
      fileTreeOpen: false,
      settingsLeftOpen: false,
      leftWidth: 280,
      widthByRegion: { "ws-a": { right: 520 } },
    });
    expect(model.currentPage).toBe("conversation");
    expect(model.leftOpen).toBe(false);
    expect(model.rightOpen).toBe(true);
    expect(model.settingsLeftOpen).toBe(false);
    expect(model.leftWidth).toBe(280);
    expect(model.widthByRegion).toEqual({ "ws-a": { right: 520 } });
  });
});

describe("parsePersistedShellState", () => {
  // A non-object stored value (null / corrupt) yields null so cold start keeps the landing
  // defaults rather than crashing on garbage.
  it("returns null for a non-object value", () => {
    expect(parsePersistedShellState(null)).toBeNull();
    expect(parsePersistedShellState("nope")).toBeNull();
    expect(parsePersistedShellState(42)).toBeNull();
  });

  // A well-formed slice round-trips intact, including the per-workspace width map.
  it("passes a well-formed slice through", () => {
    const slice = {
      leftOpen: false,
      rightOpen: true,
      fileTreeOpen: true,
      settingsLeftOpen: false,
      leftWidth: 280,
      widthByRegion: { "ws-a": { right: 520, fileTree: 300 } },
    };
    expect(parsePersistedShellState(slice)).toEqual(slice);
  });

  // Missing / wrong-typed fields fall back to their landing defaults, and malformed
  // width-map entries are dropped — the model can never be fed garbage.
  it("coerces missing and malformed fields to safe defaults", () => {
    const parsed = parsePersistedShellState({
      leftOpen: "yes",
      leftWidth: Number.NaN,
      widthByRegion: { "ws-a": { right: "wide" }, "ws-b": { fileTree: 240 }, "ws-c": 5 },
    });
    expect(parsed).toEqual({
      leftOpen: true,
      rightOpen: false,
      fileTreeOpen: false,
      settingsLeftOpen: true,
      leftWidth: 240,
      widthByRegion: { "ws-b": { fileTree: 240 } },
    });
  });
});
