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
    const workbench = { openTab } as unknown as WorkbenchModel;
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

describe("createRightPanelController · openConversation", () => {
  it("ensures the right panel is open before opening the conversation tab", () => {
    const openTab = vi.fn();
    const openRight = vi.fn();
    const workbench = { openTab } as unknown as WorkbenchModel;
    const controller = createRightPanelController({ workbench, openRight });
    const request = {
      kind: "conversation",
      target: { kind: "agent", agentId: "agent-1" },
      workspaceId: "workspace-1",
      title: "Agent 1",
      readOnly: true,
    } as const;

    controller.openConversation(request);

    expect(openTab).toHaveBeenCalledWith(request);
    expect(openRight.mock.invocationCallOrder[0]).toBeLessThan(openTab.mock.invocationCallOrder[0]);
  });
});
