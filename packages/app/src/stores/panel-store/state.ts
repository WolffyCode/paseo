export type MobilePanelView = "agent" | "agent-list" | "file-explorer";

export interface DesktopSidebarState {
  agentListOpen: boolean;
  fileExplorerOpen: boolean;
  focusModeEnabled: boolean;
}

export type SortOption = "name" | "modified" | "size";

export const DEFAULT_SIDEBAR_WIDTH = 320;
export const MIN_SIDEBAR_WIDTH = 200;
export const MAX_SIDEBAR_WIDTH = 600;

export interface PanelVisibilityState {
  isAgentListOpen: boolean;
  isFileExplorerOpen: boolean;
}

export interface PanelLayoutInput {
  isCompact: boolean;
}

export interface PanelCoreState {
  mobileView: MobilePanelView;
  desktop: DesktopSidebarState;
}

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.max(min, Math.min(max, value));
}

export function clampSidebarWidth(width: number): number {
  return clampNumber(width, MIN_SIDEBAR_WIDTH, MAX_SIDEBAR_WIDTH);
}

export function selectPanelVisibility(
  state: PanelCoreState,
  input: PanelLayoutInput,
): PanelVisibilityState {
  if (input.isCompact) {
    return {
      isAgentListOpen: state.mobileView === "agent-list",
      isFileExplorerOpen: state.mobileView === "file-explorer",
    };
  }
  return {
    isAgentListOpen: state.desktop.agentListOpen,
    isFileExplorerOpen: state.desktop.fileExplorerOpen,
  };
}

export function selectIsAgentListOpen(state: PanelCoreState, input: PanelLayoutInput): boolean {
  return selectPanelVisibility(state, input).isAgentListOpen;
}

type MigratablePanelState = Record<string, unknown>;

function migratePanelDesktopFocusMode(state: MigratablePanelState): void {
  const desktop = state.desktop as Record<string, unknown> | undefined;
  if (!desktop) {
    return;
  }
  if ("zoomed" in desktop) {
    desktop.focusModeEnabled = desktop.zoomed;
    delete desktop.zoomed;
  }
  if ("focused" in desktop) {
    desktop.focusModeEnabled = desktop.focused;
    delete desktop.focused;
  }
  if (typeof desktop.focusModeEnabled !== "boolean") {
    desktop.focusModeEnabled = false;
  }
}

export function migratePanelState(
  persistedState: unknown,
  version: number,
  _options: { isWeb: boolean },
): MigratablePanelState {
  const state = (persistedState ?? {}) as MigratablePanelState;

  if (version < 8) {
    migratePanelDesktopFocusMode(state);
  }
  if (version < 6 || typeof state.sidebarWidth !== "number") {
    state.sidebarWidth = DEFAULT_SIDEBAR_WIDTH;
  }
  if (
    version < 9 ||
    typeof state.expandedPathsByWorkspace !== "object" ||
    !state.expandedPathsByWorkspace
  ) {
    state.expandedPathsByWorkspace = {};
  }
  if (
    version < 10 ||
    typeof state.diffExpandedPathsByWorkspace !== "object" ||
    !state.diffExpandedPathsByWorkspace
  ) {
    state.diffExpandedPathsByWorkspace = {};
  }
  if (typeof state.explorerShowHiddenFiles !== "boolean") {
    state.explorerShowHiddenFiles = true;
  }

  return state;
}
