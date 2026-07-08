import { describe, expect, it, vi } from "vitest";
import { createRightPanelController } from "./right-panel-controller";
import type { WorkbenchModel } from "./workbench-model";

// RightPanelController is the right panel's single outward entry point (replacing the legacy
// openTabFocused). It is a small orchestrator, not a read-only narrowing: openFile must ensure the
// right column is expanded BEFORE opening the tab, so a collapsed panel opens correctly.

describe("createRightPanelController · openFile", () => {
  // openFile expands the right column first, then opens the file tab — order matters so the tab lands
  // in an already-visible panel.
  it("ensures the right panel is open before opening the tab", () => {
    const openTab = vi.fn();
    const openRight = vi.fn();
    const workbench = { openTab, openLauncherType: vi.fn() } as unknown as WorkbenchModel;
    const controller = createRightPanelController({ workbench, openRight });

    controller.openFile({ path: "src/a.ts", lineStart: 3 });

    expect(openRight).toHaveBeenCalledTimes(1);
    expect(openTab).toHaveBeenCalledWith({
      kind: "file",
      location: { path: "src/a.ts", lineStart: 3 },
    });
    expect(openRight.mock.invocationCallOrder[0]).toBeLessThan(openTab.mock.invocationCallOrder[0]);
  });
});

describe("createRightPanelController · openLauncherType", () => {
  // The launcher/new-tab entry delegates straight to the workbench; only `file` is usable this round
  // (that policy lives in the workbench/table, not here).
  it("delegates the launcher kind to the workbench", () => {
    const openLauncherType = vi.fn();
    const workbench = { openTab: vi.fn(), openLauncherType } as unknown as WorkbenchModel;
    const controller = createRightPanelController({ workbench, openRight: vi.fn() });

    controller.openLauncherType("file");

    expect(openLauncherType).toHaveBeenCalledWith("file");
  });
});
