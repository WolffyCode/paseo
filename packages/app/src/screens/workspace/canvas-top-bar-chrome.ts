/**
 * Visibility model for the middle-zone canvas top bar (desktop). The empty-draft
 * state (反馈 ③) strips every conversation-context control — title, ··· menu, open
 * location, environment info — and keeps only the right-panel toggle, so a brand-new
 * draft lands on a clean canvas. Derived purely so the "empty vs in-use" chrome can be
 * asserted without rendering the 4k-line workspace screen.
 */
export interface CanvasTopBarChromeInput {
  /** True while the active tab is an unsent draft (the s1 empty state). */
  isEmptyDraft: boolean;
  /** True when the right tool panel is collapsed (its toggle then lives in this bar). */
  rightPanelCollapsed: boolean;
}

export interface CanvasTopBarChrome {
  showTitle: boolean;
  showMenu: boolean;
  showOpenLocation: boolean;
  showEnvInfo: boolean;
  showRightPanelToggle: boolean;
}

/**
 * Conversation-context controls appear only once a conversation exists; the right-panel
 * toggle is independent and shows whenever the panel is collapsed (including the empty
 * state, where it is the bar's only control).
 */
export function selectCanvasTopBarChrome(input: CanvasTopBarChromeInput): CanvasTopBarChrome {
  const showContextControls = !input.isEmptyDraft;
  return {
    showTitle: showContextControls,
    showMenu: showContextControls,
    showOpenLocation: showContextControls,
    showEnvInfo: showContextControls,
    showRightPanelToggle: input.rightPanelCollapsed,
  };
}
