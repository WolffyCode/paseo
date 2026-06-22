import { describe, expect, it } from "vitest";
import {
  migratePanelState,
  selectIsAgentListOpen,
  selectPanelVisibility,
  type PanelCoreState,
} from "./state";

function makePanelState(overrides: Partial<PanelCoreState> = {}): PanelCoreState {
  return {
    mobileView: "agent",
    desktop: {
      agentListOpen: false,
      fileExplorerOpen: false,
      focusModeEnabled: false,
    },
    ...overrides,
  };
}

describe("panel-store migration", () => {
  it("defaults hidden-file visibility to showing hidden files", () => {
    const state = migratePanelState({}, 10, { isWeb: false });

    expect(state.explorerShowHiddenFiles).toBe(true);
  });
});

describe("panel-store visibility selectors", () => {
  it("uses mobileView for compact layout visibility", () => {
    const state = makePanelState({
      mobileView: "file-explorer",
      desktop: { agentListOpen: true, fileExplorerOpen: false, focusModeEnabled: false },
    });

    expect(selectPanelVisibility(state, { isCompact: true })).toEqual({
      isAgentListOpen: false,
      isFileExplorerOpen: true,
    });
    expect(selectIsAgentListOpen(state, { isCompact: true })).toBe(false);
  });

  it("uses desktop flags for expanded layout visibility", () => {
    const state = makePanelState({
      mobileView: "file-explorer",
      desktop: { agentListOpen: true, fileExplorerOpen: false, focusModeEnabled: false },
    });

    expect(selectPanelVisibility(state, { isCompact: false })).toEqual({
      isAgentListOpen: true,
      isFileExplorerOpen: false,
    });
    expect(selectIsAgentListOpen(state, { isCompact: false })).toBe(true);
  });
});
