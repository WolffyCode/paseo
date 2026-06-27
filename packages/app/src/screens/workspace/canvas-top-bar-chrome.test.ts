import { describe, expect, it } from "vitest";
import { selectCanvasTopBarChrome } from "./canvas-top-bar-chrome";

describe("selectCanvasTopBarChrome", () => {
  it("shows every conversation-context control while a conversation is in use", () => {
    const chrome = selectCanvasTopBarChrome({ isEmptyDraft: false, rightPanelCollapsed: true });

    expect(chrome).toEqual({
      showTitle: true,
      showMenu: true,
      showOpenLocation: true,
      showEnvInfo: true,
      showRightPanelToggle: true,
    });
  });

  it("hides the right-panel toggle when the right panel is already expanded", () => {
    const chrome = selectCanvasTopBarChrome({ isEmptyDraft: false, rightPanelCollapsed: false });

    expect(chrome.showRightPanelToggle).toBe(false);
    // Context controls are unaffected by the right panel's state.
    expect(chrome.showTitle).toBe(true);
    expect(chrome.showOpenLocation).toBe(true);
    expect(chrome.showEnvInfo).toBe(true);
  });

  it("strips context controls in the empty-draft state, leaving only the right-panel toggle", () => {
    const chrome = selectCanvasTopBarChrome({ isEmptyDraft: true, rightPanelCollapsed: true });

    expect(chrome).toEqual({
      showTitle: false,
      showMenu: false,
      showOpenLocation: false,
      showEnvInfo: false,
      showRightPanelToggle: true,
    });
  });

  it("shows nothing in an empty draft when the right panel is expanded", () => {
    const chrome = selectCanvasTopBarChrome({ isEmptyDraft: true, rightPanelCollapsed: false });

    expect(chrome).toEqual({
      showTitle: false,
      showMenu: false,
      showOpenLocation: false,
      showEnvInfo: false,
      showRightPanelToggle: false,
    });
  });
});
