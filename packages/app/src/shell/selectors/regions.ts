// Pure derivation layer for the desktop shell: from one shell-store snapshot it
// answers "which region cards render and how wide" and "what does the top bar show".
// It owns the shell's shared types and the width math, lives apart from the store and
// from React, and never touches the DOM — so every rule here is unit-testable without
// rendering. The view layer only reads these selectors; the store only writes state.

// The two main body pages. They are mutually exclusive — only one shows at a time.
// "conversation" = left rail + canvas + right tools + file tree; "settings" = left
// nav + content. The shell never routes to settings; it is in-shell page state.
export type ShellPage = "conversation" | "settings";

// The three toggleable side regions. The center canvas is always present and has no
// independent width, so it is deliberately not a ShellRegion.
export type ShellRegion = "left" | "right" | "fileTree";

// The two tools whose width is remembered per workspace. The left rail is excluded:
// it is the app's global navigation, so it carries one app-wide width that must not
// move when the active workspace changes.
export type WorkspaceRegion = "right" | "fileTree";

export interface ShellRegionConstraints {
  min: number;
  max: number;
  default: number;
}

// Per-region width bounds (px), straight from the design (requirement §6.7 / s3
// legend). Side regions clamp to these; the center fills the remainder. Relocated
// here verbatim — the shell selectors are the new owner of this geometry.
export const REGION_CONSTRAINTS: Record<ShellRegion, ShellRegionConstraints> = {
  left: { min: 180, max: 300, default: 240 },
  right: { min: 320, max: 800, default: 480 },
  fileTree: { min: 220, max: 500, default: 280 },
};

// The slice of shell-store the selectors read, kept as a plain shape so tests can
// build snapshots without a live store. Three concerns in one truth source: page
// navigation, region visibility, and region geometry.
export interface ShellSnapshot {
  currentPage: ShellPage;
  // Conversation-page visibility flags.
  leftOpen: boolean;
  rightOpen: boolean;
  fileTreeOpen: boolean;
  // Settings-page left-nav visibility. Independent of `leftOpen` on purpose — that
  // independence is what lets "return to conversation" restore the prior layout for
  // free (settings never mutates a conversation flag).
  settingsLeftOpen: boolean;
  // The left rail's single app-wide width (px). Global on purpose — not keyed by
  // workspace, so entering/leaving a conversation never moves it. Shared by the
  // settings nav (same left geometry).
  leftWidth: number;
  // workspaceKey -> tool -> remembered width (px, already clamped on write).
  widthByRegion: Record<string, Partial<Record<WorkspaceRegion, number>>>;
}

// What the current route grants the shell, independent of the model's own page state.
// `showsShell` is false pre-connection (onboarding/splash) where only the center may
// render. `workspaceKey` gates the workspace tools (right + fileTree) and keys their
// width memory; it is null on routes with no active workspace. The page is NOT here —
// page is the model's own state (snapshot.currentPage).
export interface ShellContext {
  showsShell: boolean;
  workspaceKey: string | null;
}

// Output of selectVisibleRegions: a present side key means "render it", and its value
// is the resolved width. `main` is always true and width-less (flex-1). In settings,
// `left` is the settings nav (same left geometry); right/fileTree never appear.
export interface VisibleRegions {
  main: true;
  left?: number;
  right?: number;
  fileTree?: number;
}

export interface ToggleModel {
  active: boolean;
  enabled: boolean;
}

// The top bar's derived shape. No title/project/branch — those are deferred content
// (requirement §7 a); the bar's center is a static empty slot. `showBack` drives the
// settings-page back button; right/fileTree are null on the settings page (the two
// workspace-tool toggles do not exist there).
export interface TopBarModel {
  showBack: boolean;
  left: ToggleModel;
  right: ToggleModel | null;
  fileTree: ToggleModel | null;
}

// Clamp a width to its region's bounds; non-finite input collapses to the region
// default so a corrupted stored value can never produce a broken layout.
export function clampRegionWidth(region: ShellRegion, px: number): number {
  const { min, max, default: fallback } = REGION_CONSTRAINTS[region];
  if (!Number.isFinite(px)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, px));
}

// Resolve a drag gesture into a new region width. `deltaPx` is already sign-corrected
// by the gutter for the region's grow direction, so this stays a plain add-then-clamp
// — dragging past a bound stops at the bound.
export function resolveRegionWidthFromDrag(input: {
  region: ShellRegion;
  startWidth: number;
  deltaPx: number;
}): number {
  return clampRegionWidth(input.region, input.startWidth + input.deltaPx);
}

// Resolve a workspace tool's width: the remembered width for the active workspace if
// present (re-clamped defensively), otherwise the region default.
function resolveWorkspaceRegionWidth(
  state: ShellSnapshot,
  workspaceKey: string,
  region: WorkspaceRegion,
): number {
  const stored = state.widthByRegion[workspaceKey]?.[region];
  return clampRegionWidth(region, stored ?? REGION_CONSTRAINTS[region].default);
}

// Decide which cards render and how wide each side card is. The center is always
// present and width-less. On the conversation page the left rail follows leftOpen
// (global leftWidth) and the two workspace tools additionally require a workspaceKey
// and read their per-workspace width. On the settings page the left card is the
// settings nav (settingsLeftOpen, same left geometry) and the workspace tools never
// appear. Pre-connection (showsShell=false) only the center renders.
export function selectVisibleRegions(state: ShellSnapshot, ctx: ShellContext): VisibleRegions {
  const regions: VisibleRegions = { main: true };
  if (!ctx.showsShell) {
    return regions;
  }
  if (state.currentPage === "settings") {
    if (state.settingsLeftOpen) {
      regions.left = clampRegionWidth("left", state.leftWidth);
    }
    return regions;
  }
  if (state.leftOpen) {
    regions.left = clampRegionWidth("left", state.leftWidth);
  }
  if (ctx.workspaceKey != null) {
    if (state.rightOpen) {
      regions.right = resolveWorkspaceRegionWidth(state, ctx.workspaceKey, "right");
    }
    if (state.fileTreeOpen) {
      regions.fileTree = resolveWorkspaceRegionWidth(state, ctx.workspaceKey, "fileTree");
    }
  }
  return regions;
}

// Derive the top bar. Conversation page: no back button; three toggles whose `active`
// mirrors each flag, with right/fileTree `enabled` only when a workspace is active.
// Settings page: back button shown; the single left toggle maps to settingsLeftOpen;
// right/fileTree are null (those toggles do not exist on the settings page). All
// toggles are disabled when the shell is hidden.
export function selectTopBar(state: ShellSnapshot, ctx: ShellContext): TopBarModel {
  const leftEnabled = ctx.showsShell;
  if (state.currentPage === "settings") {
    return {
      showBack: true,
      left: { enabled: leftEnabled, active: leftEnabled && state.settingsLeftOpen },
      right: null,
      fileTree: null,
    };
  }
  const toolsEnabled = ctx.showsShell && ctx.workspaceKey != null;
  return {
    showBack: false,
    left: { enabled: leftEnabled, active: leftEnabled && state.leftOpen },
    right: { enabled: toolsEnabled, active: toolsEnabled && state.rightOpen },
    fileTree: { enabled: toolsEnabled, active: toolsEnabled && state.fileTreeOpen },
  };
}
