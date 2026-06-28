// Pure layout model for the desktop home shell: which side regions render, how
// wide they are, and what the unified top bar shows. Lives apart from the store
// and from React so every rule here is unit-testable without rendering — the UI
// only reads these selectors and dispatches store actions.

// The three toggleable side regions. The center canvas is always present and has
// no independent width, so it is deliberately not a ShellRegion.
export type ShellRegion = "left" | "right" | "fileTree";

// The two workspace tools whose width is remembered per workspace. The left rail
// is deliberately excluded: it is the app's global navigation, so it carries one
// app-wide width that must not move when the active workspace changes.
export type WorkspaceRegion = "right" | "fileTree";

export interface ShellRegionConstraints {
  min: number;
  max: number;
  default: number;
}

// Per-region width bounds (px), straight from the design (requirement §44 / s3
// legend). Side regions clamp to these; the center fills the remainder.
export const REGION_CONSTRAINTS: Record<ShellRegion, ShellRegionConstraints> = {
  left: { min: 180, max: 300, default: 240 },
  right: { min: 320, max: 800, default: 480 },
  fileTree: { min: 220, max: 500, default: 280 },
};

// What the current route grants the shell. `showsShell` is false pre-connection
// (onboarding / splash) where only the center card may render. `workspaceKey`
// gates the workspace-scoped tools (right + fileTree) and keys width memory; it
// is null on routes with no active workspace.
export interface ShellRoute {
  showsShell: boolean;
  workspaceKey: string | null;
}

// The slice of shell-layout-store the selectors read. Kept as a plain shape so
// tests can build snapshots without the store.
export interface ShellLayoutSnapshot {
  leftOpen: boolean;
  rightOpen: boolean;
  fileTreeOpen: boolean;
  // The left rail's single app-wide width (px). Global on purpose — it is not
  // keyed by workspace, so entering or leaving a conversation cannot move it.
  leftWidth: number;
  // Per-workspace remembered widths for the two workspace tools only.
  widthByRegion: Record<string, Partial<Record<WorkspaceRegion, number>>>;
}

// Output of selectVisibleRegions: presence of a side key means "render it", and
// its value is the resolved width. `main` is always true and width-less.
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

export interface BranchInfo {
  name: string;
  dirtyCount: number;
}

export interface TopBarModel {
  title: string | null;
  projectName: string | null;
  branch: BranchInfo | null;
  left: ToggleModel;
  right: ToggleModel;
  fileTree: ToggleModel;
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

// Resolve a drag gesture into a new region width. `deltaPx` is the width delta
// already sign-corrected by the gutter for the region's grow direction, so this
// stays a plain add-then-clamp — dragging past a bound stops at the bound.
export function resolveRegionWidthFromDrag(input: {
  region: ShellRegion;
  startWidth: number;
  deltaPx: number;
}): number {
  return clampRegionWidth(input.region, input.startWidth + input.deltaPx);
}

// Resolve a workspace tool's width: the remembered width for the active workspace
// if present (re-clamped defensively), otherwise the region default. The left rail
// is global navigation, not a workspace tool, and never flows through here.
function resolveWorkspaceRegionWidth(
  state: ShellLayoutSnapshot,
  workspaceKey: string,
  region: WorkspaceRegion,
): number {
  const stored = state.widthByRegion[workspaceKey]?.[region];
  return clampRegionWidth(region, stored ?? REGION_CONSTRAINTS[region].default);
}

// Decide which cards render and how wide each side card is. The center is always
// present; the left rail follows its toggle whenever the shell is shown and uses
// the single global leftWidth; right and fileTree are workspace tools, so they
// additionally require a workspaceKey and read their per-workspace width.
export function selectVisibleRegions(
  state: ShellLayoutSnapshot,
  route: ShellRoute,
): VisibleRegions {
  const regions: VisibleRegions = { main: true };
  if (!route.showsShell) {
    return regions;
  }
  if (state.leftOpen) {
    regions.left = clampRegionWidth("left", state.leftWidth);
  }
  if (route.workspaceKey != null) {
    if (state.rightOpen) {
      regions.right = resolveWorkspaceRegionWidth(state, route.workspaceKey, "right");
    }
    if (state.fileTreeOpen) {
      regions.fileTree = resolveWorkspaceRegionWidth(state, route.workspaceKey, "fileTree");
    }
  }
  return regions;
}

// Derive the top bar: title/project/branch pass through from their truth sources,
// and each toggle reports active (its panel is open) plus enabled (the route
// allows it). Right and fileTree are disabled without a workspace; all three are
// disabled when the shell is hidden.
export function selectTopBarModel(input: {
  route: ShellRoute;
  conversationTitle: string | null;
  projectName: string | null;
  branch: BranchInfo | null;
  layout: { leftOpen: boolean; rightOpen: boolean; fileTreeOpen: boolean };
}): TopBarModel {
  const { route, layout } = input;
  const leftEnabled = route.showsShell;
  const toolsEnabled = route.showsShell && route.workspaceKey != null;
  return {
    title: input.conversationTitle,
    projectName: input.projectName,
    branch: input.branch,
    left: { enabled: leftEnabled, active: leftEnabled && layout.leftOpen },
    right: { enabled: toolsEnabled, active: toolsEnabled && layout.rightOpen },
    fileTree: { enabled: toolsEnabled, active: toolsEnabled && layout.fileTreeOpen },
  };
}
