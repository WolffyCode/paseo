import type { WorkspaceTabTarget } from "@/stores/workspace-tabs-store/state";

/**
 * The two surfaces in the single-conversation layout: the main conversation pane
 * and the collapsible right-side tool panel.
 *
 * - `main` shows exactly one active conversation (`agent`/`draft`/`setup`) and has
 *   no tab bar. Conversations are switched from the left sidebar.
 * - `right` is the optional tool panel (terminal/browser/file/review/side-chat),
 *   hidden by default and toggled from the top bar. It carries its own tab bar.
 */
export type TabSurface = "main" | "right";

/** Conversation pane id. Mirrors `DEFAULT_PANE_ID` in `workspace-layout-actions`. */
export const MAIN_PANE_ID = "main";

/** Right tool-panel pane id. The canonical layout is at most `[main, tools]`. */
export const RIGHT_PANEL_PANE_ID = "tools";

/**
 * Default surface for a tab kind:
 * - `agent` / `draft` / `setup` → `main` (the single conversation surface)
 * - `terminal` / `browser` / `file` → `right` (the tool panel)
 *
 * Side-chat is the one deliberate exception: it is an `agent` target the user
 * explicitly opens on the right. Those callers pass an explicit surface instead
 * of relying on this classifier (see `openTabOnSurface`).
 */
/**
 * Right-panel tab kinds that are pinned (cannot be closed). R6 (董事长拍板): there are none —
 * 审查/review is closeable like every other tool tab. Pinning a kind later is a one-line edit
 * here that trips `canCloseRightPanelTab`'s test, instead of a gate scattered across the UI.
 */
const PINNED_RIGHT_PANEL_TAB_KINDS: ReadonlySet<WorkspaceTabTarget["kind"]> = new Set();

/**
 * Whether a right-panel tab of this kind may be closed. Single source of truth for the right
 * panel's close policy (the close ✕ + context menu read it). R6: every tab — 审查 included —
 * is closeable and re-addable from the launcher / 「新选项卡」menu; no "review pinned first".
 */
export function canCloseRightPanelTab(kind: WorkspaceTabTarget["kind"]): boolean {
  return !PINNED_RIGHT_PANEL_TAB_KINDS.has(kind);
}

export function tabSurfaceForKind(kind: WorkspaceTabTarget["kind"]): TabSurface {
  switch (kind) {
    case "terminal":
    case "browser":
    case "file":
    case "review":
    case "files":
      return "right";
    case "agent":
    case "draft":
    case "setup":
      return "main";
    default: {
      // Exhaustiveness guard: a newly added tab kind must declare its surface.
      const _exhaustive: never = kind;
      return "main";
    }
  }
}
