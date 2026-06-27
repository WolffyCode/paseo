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

  it("remembers a region width per workspace", () => {
    useShellLayoutStore.getState().setRegionWidth("ws-a", "left", 200);
    expect(useShellLayoutStore.getState().widthByRegion["ws-a"]?.left).toBe(200);
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

  it("setting one region width preserves other remembered widths for the same workspace", () => {
    const store = useShellLayoutStore.getState();
    store.setRegionWidth("ws-a", "left", 200);
    store.setRegionWidth("ws-a", "right", 600);
    const widths = useShellLayoutStore.getState().widthByRegion["ws-a"];
    expect(widths?.left).toBe(200);
    expect(widths?.right).toBe(600);
  });
});
