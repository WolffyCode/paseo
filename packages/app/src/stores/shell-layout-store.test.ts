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

import { useShellLayoutStore } from "./shell-layout-store";

describe("shell-layout-store", () => {
  beforeEach(() => {
    useShellLayoutStore.setState({
      leftOpen: true,
      rightOpen: false,
      fileTreeOpen: false,
      leftWidth: 240,
      widthByRegion: {},
    });
  });

  it("defaults to the s1 landing state — left open, right and file tree closed", () => {
    const state = useShellLayoutStore.getState();
    expect(state.leftOpen).toBe(true);
    expect(state.rightOpen).toBe(false);
    expect(state.fileTreeOpen).toBe(false);
  });

  it("toggleRegion('left') flips only the left region", () => {
    useShellLayoutStore.getState().toggleRegion("left");
    const state = useShellLayoutStore.getState();
    expect(state.leftOpen).toBe(false);
    expect(state.rightOpen).toBe(false);
    expect(state.fileTreeOpen).toBe(false);
  });

  it("toggleRegion('right') flips only the right region (additive, non-exclusive)", () => {
    useShellLayoutStore.getState().toggleRegion("right");
    const state = useShellLayoutStore.getState();
    expect(state.leftOpen).toBe(true);
    expect(state.rightOpen).toBe(true);
    expect(state.fileTreeOpen).toBe(false);
  });

  it("toggleRegion('fileTree') flips only the file tree region", () => {
    useShellLayoutStore.getState().toggleRegion("fileTree");
    const state = useShellLayoutStore.getState();
    expect(state.leftOpen).toBe(true);
    expect(state.rightOpen).toBe(false);
    expect(state.fileTreeOpen).toBe(true);
  });

  it("opening every region leaves all three open simultaneously", () => {
    const store = useShellLayoutStore.getState();
    store.toggleRegion("right");
    store.toggleRegion("fileTree");
    const state = useShellLayoutStore.getState();
    expect(state.leftOpen).toBe(true);
    expect(state.rightOpen).toBe(true);
    expect(state.fileTreeOpen).toBe(true);
  });

  it("toggling a region twice returns it to its original state", () => {
    useShellLayoutStore.getState().toggleRegion("left");
    useShellLayoutStore.getState().toggleRegion("left");
    expect(useShellLayoutStore.getState().leftOpen).toBe(true);
  });

  it("setRegionOpen sets an explicit open state without touching siblings", () => {
    useShellLayoutStore.getState().setRegionOpen("right", true);
    const state = useShellLayoutStore.getState();
    expect(state.rightOpen).toBe(true);
    expect(state.leftOpen).toBe(true);
    expect(state.fileTreeOpen).toBe(false);
  });

  it("remembers a workspace tool's width per workspace", () => {
    useShellLayoutStore.getState().setRegionWidth("ws-a", "right", 360);
    expect(useShellLayoutStore.getState().widthByRegion["ws-a"]?.right).toBe(360);
  });

  it("setLeftWidth stores one global left width (clamped), never keyed by workspace", () => {
    useShellLayoutStore.getState().setLeftWidth(280);
    expect(useShellLayoutStore.getState().leftWidth).toBe(280);
    useShellLayoutStore.getState().setLeftWidth(999); // above the left max of 300
    expect(useShellLayoutStore.getState().leftWidth).toBe(300);
    // The left width never lands in a per-workspace bucket — it is global.
    expect(useShellLayoutStore.getState().widthByRegion).toEqual({});
  });

  it("keeps each workspace's remembered widths isolated", () => {
    const store = useShellLayoutStore.getState();
    store.setRegionWidth("ws-a", "right", 600);
    store.setRegionWidth("ws-b", "right", 360);
    const widths = useShellLayoutStore.getState().widthByRegion;
    expect(widths["ws-a"]?.right).toBe(600);
    expect(widths["ws-b"]?.right).toBe(360);
  });

  it("clamps a remembered width to the region's min/max", () => {
    const store = useShellLayoutStore.getState();
    store.setRegionWidth("ws-a", "right", 100); // below right min 320
    store.setRegionWidth("ws-a", "fileTree", 999); // above fileTree max 500
    const widths = useShellLayoutStore.getState().widthByRegion["ws-a"];
    expect(widths?.right).toBe(320);
    expect(widths?.fileTree).toBe(500);
  });

  it("setting one tool's width preserves other remembered widths for the same workspace", () => {
    const store = useShellLayoutStore.getState();
    store.setRegionWidth("ws-a", "fileTree", 300);
    store.setRegionWidth("ws-a", "right", 600);
    const widths = useShellLayoutStore.getState().widthByRegion["ws-a"];
    expect(widths?.fileTree).toBe(300);
    expect(widths?.right).toBe(600);
  });
});
