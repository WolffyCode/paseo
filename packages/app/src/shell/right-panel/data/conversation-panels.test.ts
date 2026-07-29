import { describe, expect, it, vi } from "vitest";
import { type ConversationPanelLifecycle, ConversationPanels } from "./conversation-panels";

interface FakePanel extends ConversationPanelLifecycle {
  readonly name: string;
}

/** Build the lifecycle surface needed by the collection without constructing live host wiring. */
function fakePanel(name: string): FakePanel {
  return {
    name,
    workbench: { closeAll: vi.fn() },
  };
}

describe("ConversationPanels", () => {
  it("reuses one view panel while isolating two conversations in the same workspace", () => {
    const created: FakePanel[] = [];
    const panels = new ConversationPanels("server", (_serverId, _workspaceId) => {
      const panel = fakePanel(`panel-${created.length + 1}`);
      created.push(panel);
      return panel;
    });

    const first = panels.resolve("agent-a", "shared-workspace");
    expect(panels.resolve("agent-a", "shared-workspace")).toBe(first);
    expect(panels.resolve("agent-b", "shared-workspace")).not.toBe(first);
    expect(created).toHaveLength(2);
  });

  it("moves the exact draft panel to its created agent identity", () => {
    const panel = fakePanel("draft-panel");
    const panels = new ConversationPanels("server", () => panel);
    expect(panels.resolve("draft-a", "workspace")).toBe(panel);

    panels.retarget("draft-a", "agent-a");

    expect(panels.resolve("agent-a", "workspace")).toBe(panel);
    expect(panel.workbench.closeAll).not.toHaveBeenCalled();
  });

  it("closes every cached Workbench exactly once on host disposal", () => {
    const created = [fakePanel("one"), fakePanel("two")];
    let index = 0;
    const panels = new ConversationPanels("server", () => created[index++]);
    panels.resolve("agent-a", "workspace-a");
    panels.resolve("agent-b", "workspace-b");

    panels.dispose();

    expect(created[0].workbench.closeAll).toHaveBeenCalledTimes(1);
    expect(created[1].workbench.closeAll).toHaveBeenCalledTimes(1);
  });
});
