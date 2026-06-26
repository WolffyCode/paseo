import { describe, expect, it } from "vitest";
import {
  canCloseRightPanelTab,
  MAIN_PANE_ID,
  RIGHT_PANEL_PANE_ID,
  tabSurfaceForKind,
} from "./tab-surface";

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

describe("canCloseRightPanelTab", () => {
  // R6 (董事长拍板): 右面板每个页签都可关、可从启动器/「新选项卡」重加，审查不固定第一、不例外。
  it("treats 审查/review as closeable like every other tool tab", () => {
    expect(canCloseRightPanelTab("review")).toBe(true);
  });

  it("treats every right-panel tool kind as closeable", () => {
    expect(canCloseRightPanelTab("terminal")).toBe(true);
    expect(canCloseRightPanelTab("browser")).toBe(true);
    expect(canCloseRightPanelTab("file")).toBe(true);
    expect(canCloseRightPanelTab("files")).toBe(true);
  });

  it("treats a side-chat agent docked on the right as closeable", () => {
    expect(canCloseRightPanelTab("agent")).toBe(true);
  });
});
