import { beforeEach, describe, expect, it, vi } from "vitest";

// In-memory AsyncStorage so the persist middleware has a backing store under node.
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

import { partializeShellState, useShellStore } from "./shell-store";

// Reset to the s1 landing defaults before each test (setState merges, so actions stay).
beforeEach(() => {
  useShellStore.setState({
    currentPage: "conversation",
    leftOpen: true,
    rightOpen: false,
    fileTreeOpen: false,
    settingsLeftOpen: true,
    leftWidth: 240,
    widthByRegion: {},
  });
});

describe("shell-store · initial state", () => {
  // The landing state is s1 (requirement §3 "落地对话页默认态", verification 3/4):
  // conversation page, left open, right + tree closed, settings nav open, left 240.
  it("matches the s1 landing defaults", () => {
    const s = useShellStore.getState();
    expect(s.currentPage).toBe("conversation");
    expect(s.leftOpen).toBe(true);
    expect(s.rightOpen).toBe(false);
    expect(s.fileTreeOpen).toBe(false);
    expect(s.settingsLeftOpen).toBe(true);
    expect(s.leftWidth).toBe(240);
    expect(s.widthByRegion).toEqual({});
  });
});

describe("shell-store · region toggles are additive and independent", () => {
  // Each toggle flips only its own flag; the other two never move (verification 5/6).
  it("toggleLeft flips only leftOpen", () => {
    useShellStore.getState().toggleLeft();
    const s = useShellStore.getState();
    expect(s.leftOpen).toBe(false);
    expect(s.rightOpen).toBe(false);
    expect(s.fileTreeOpen).toBe(false);
  });

  it("toggleRight flips only rightOpen", () => {
    useShellStore.getState().toggleRight();
    const s = useShellStore.getState();
    expect(s.rightOpen).toBe(true);
    expect(s.leftOpen).toBe(true);
    expect(s.fileTreeOpen).toBe(false);
  });

  it("toggleFileTree flips only fileTreeOpen", () => {
    useShellStore.getState().toggleFileTree();
    const s = useShellStore.getState();
    expect(s.fileTreeOpen).toBe(true);
    expect(s.leftOpen).toBe(true);
    expect(s.rightOpen).toBe(false);
  });
});

describe("shell-store · openRight / closeRight are idempotent", () => {
  // The composition primitives "ensure open / ensure closed" must not flip on repeat —
  // calling twice lands the same as calling once (§3.3 pattern anchor).
  it("openRight sets true and stays true; closeRight sets false and stays false", () => {
    useShellStore.getState().openRight();
    expect(useShellStore.getState().rightOpen).toBe(true);
    useShellStore.getState().openRight();
    expect(useShellStore.getState().rightOpen).toBe(true);
    useShellStore.getState().closeRight();
    expect(useShellStore.getState().rightOpen).toBe(false);
    useShellStore.getState().closeRight();
    expect(useShellStore.getState().rightOpen).toBe(false);
  });
});

describe("shell-store · width writes clamp and stay scoped", () => {
  // The left rail's width is global and clamps to its own bounds (verification 7).
  it("setLeftWidth clamps to the left bounds", () => {
    useShellStore.getState().setLeftWidth(999);
    expect(useShellStore.getState().leftWidth).toBe(300);
    useShellStore.getState().setLeftWidth(10);
    expect(useShellStore.getState().leftWidth).toBe(180);
  });

  // A tool width clamps to that tool's bounds and is keyed by workspace; writing one
  // workspace's tool leaves other workspaces and the sibling tool untouched.
  it("setRegionWidth clamps and isolates by workspace + tool", () => {
    useShellStore.getState().setRegionWidth("ws-a", "right", 5000);
    useShellStore.getState().setRegionWidth("ws-b", "fileTree", 240);
    const { widthByRegion } = useShellStore.getState();
    expect(widthByRegion["ws-a"]).toEqual({ right: 800 });
    expect(widthByRegion["ws-b"]).toEqual({ fileTree: 240 });
  });
});

describe("shell-store · resetRegionWidth returns to the design default", () => {
  // Gutter double-click resets a region to its default: left globally, right/tree by key.
  it("resets left globally and a tool by workspace key", () => {
    useShellStore.getState().setLeftWidth(180);
    useShellStore.getState().resetRegionWidth("left");
    expect(useShellStore.getState().leftWidth).toBe(240);

    useShellStore.getState().setRegionWidth("ws-a", "right", 320);
    useShellStore.getState().resetRegionWidth("right", "ws-a");
    expect(useShellStore.getState().widthByRegion["ws-a"]?.right).toBe(480);
  });
});

describe("shell-store · settings isolation (the return-restores-for-free invariant)", () => {
  // Entering settings must not mutate any conversation flag or width — that isolation
  // is what makes "return to conversation" restore the prior layout with no snapshot
  // (architecture §0 insight; supports verification 12).
  it("openSettings changes only currentPage", () => {
    useShellStore.setState({
      leftOpen: false,
      rightOpen: true,
      fileTreeOpen: true,
      leftWidth: 260,
      widthByRegion: { "ws-a": { right: 520 } },
    });
    useShellStore.getState().openSettings();
    const s = useShellStore.getState();
    expect(s.currentPage).toBe("settings");
    expect(s.leftOpen).toBe(false);
    expect(s.rightOpen).toBe(true);
    expect(s.fileTreeOpen).toBe(true);
    expect(s.leftWidth).toBe(260);
    expect(s.widthByRegion).toEqual({ "ws-a": { right: 520 } });
  });

  // A full enter → toggle the settings nav → return cycle leaves the five conversation
  // layout fields exactly as they were before entering settings (verification 12).
  it("closeSettings restores the conversation layout after toggling the settings nav", () => {
    useShellStore.setState({
      leftOpen: false,
      rightOpen: true,
      fileTreeOpen: false,
      leftWidth: 280,
      widthByRegion: { "ws-a": { fileTree: 300 } },
    });
    const before = {
      leftOpen: useShellStore.getState().leftOpen,
      rightOpen: useShellStore.getState().rightOpen,
      fileTreeOpen: useShellStore.getState().fileTreeOpen,
      leftWidth: useShellStore.getState().leftWidth,
      widthByRegion: useShellStore.getState().widthByRegion,
    };
    useShellStore.getState().openSettings();
    useShellStore.getState().toggleSettingsLeft();
    useShellStore.getState().closeSettings();
    const s = useShellStore.getState();
    expect(s.currentPage).toBe("conversation");
    expect({
      leftOpen: s.leftOpen,
      rightOpen: s.rightOpen,
      fileTreeOpen: s.fileTreeOpen,
      leftWidth: s.leftWidth,
      widthByRegion: s.widthByRegion,
    }).toEqual(before);
  });

  // The settings-nav toggle is the settings slice's own flag; it must never reach into
  // the conversation left rail (verification 11/13).
  it("toggleSettingsLeft flips only settingsLeftOpen, never leftOpen", () => {
    useShellStore.getState().toggleSettingsLeft();
    expect(useShellStore.getState().settingsLeftOpen).toBe(false);
    expect(useShellStore.getState().leftOpen).toBe(true);
  });
});

describe("shell-store · persistence excludes the page mode", () => {
  // currentPage is intentionally not persisted: a reload always lands on the
  // conversation page, never a stale settings page. The hydration flag is runtime-only.
  it("partialize omits currentPage and the hydration flag", () => {
    useShellStore.setState({ currentPage: "settings" });
    const persisted = partializeShellState(useShellStore.getState());
    expect("currentPage" in persisted).toBe(false);
    expect("_hydrated" in persisted).toBe(false);
    expect(persisted).toEqual({
      leftOpen: true,
      rightOpen: false,
      fileTreeOpen: false,
      settingsLeftOpen: true,
      leftWidth: 240,
      widthByRegion: {},
    });
  });
});
