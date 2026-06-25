import { describe, expect, it } from "vitest";
import { MAIN_PANE_ID, RIGHT_PANEL_PANE_ID, tabSurfaceForKind } from "./tab-surface";

describe("tabSurfaceForKind", () => {
  it("routes conversation kinds to the main surface", () => {
    expect(tabSurfaceForKind("agent")).toBe("main");
    expect(tabSurfaceForKind("draft")).toBe("main");
    expect(tabSurfaceForKind("setup")).toBe("main");
  });

  it("routes tool kinds to the right surface", () => {
    expect(tabSurfaceForKind("terminal")).toBe("right");
    expect(tabSurfaceForKind("browser")).toBe("right");
    expect(tabSurfaceForKind("file")).toBe("right");
  });
});

describe("pane ids", () => {
  it("keeps main and right pane ids distinct", () => {
    expect(MAIN_PANE_ID).toBe("main");
    expect(RIGHT_PANEL_PANE_ID).not.toBe(MAIN_PANE_ID);
  });
});
