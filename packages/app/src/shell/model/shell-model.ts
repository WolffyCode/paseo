import { makeAutoObservable, toJS } from "mobx";
import {
  clampRegionWidth,
  REGION_CONSTRAINTS,
  selectTopBar,
  selectVisibleRegions,
  type ShellContext,
  type ShellPage,
  type ShellRegion,
  type TopBarModel,
  type VisibleRegions,
  type WorkspaceRegion,
} from "../selectors/regions";

// The desktop shell's single model (class + MobX). Page mode, region visibility, region
// geometry, and the route context live in one transactional truth source. The view layer
// is `observer`-wrapped and reads the observables + computeds; state changes only through
// the actions. Switching to settings and back is a cross-slice move, so these concerns
// share one model (not three). Geometry math + visibility rules stay pure in
// selectors/regions.ts; the computeds here just feed those selectors the model's own state.

// Re-export the shared shapes so view code + the route have one shell import surface.
export type { ShellContext, ShellPage, ShellRegion, TopBarModel, VisibleRegions, WorkspaceRegion };

// The four open flags, named so the visibility primitive can stay data-driven.
type OpenField = "leftOpen" | "rightOpen" | "fileTreeOpen" | "settingsLeftOpen";

// The fields that survive a reload. currentPage and the route context are excluded on
// purpose (a reload always lands on the conversation page; the context is route-derived).
export interface ShellPersistedState {
  leftOpen: boolean;
  rightOpen: boolean;
  fileTreeOpen: boolean;
  settingsLeftOpen: boolean;
  leftWidth: number;
  widthByRegion: Record<string, Partial<Record<WorkspaceRegion, number>>>;
}

// The AsyncStorage key for the persisted layout slice.
export const SHELL_STATE_STORAGE_KEY = "helm-shell-state";

// The s1 landing values, reused as both the model's field initializers and the
// per-field fallback when a persisted value is missing/corrupt.
const LANDING_DEFAULTS: ShellPersistedState = {
  leftOpen: true,
  rightOpen: false,
  fileTreeOpen: false,
  settingsLeftOpen: true,
  leftWidth: REGION_CONSTRAINTS.left.default,
  widthByRegion: {},
};

// Project the model down to exactly the persisted slice (plain, deep-copied so the
// persistence layer serializes a snapshot, not a live observable). Exported so the
// persistence shape is a unit-testable pure function, not a side effect hidden in wiring.
export function partializeShellState(model: ShellModel): ShellPersistedState {
  return {
    leftOpen: model.leftOpen,
    rightOpen: model.rightOpen,
    fileTreeOpen: model.fileTreeOpen,
    settingsLeftOpen: model.settingsLeftOpen,
    leftWidth: model.leftWidth,
    widthByRegion: toJS(model.widthByRegion),
  };
}

// Coerce an untrusted stored value into a complete, well-typed persisted slice: a non-object
// returns null (keep defaults, no hydrate); otherwise each field falls back to its landing
// default when missing/wrong-typed. Widths are read back through the selectors' clamp, so a
// stale number is tolerated here; the only job is to never feed garbage into the model.
export function parsePersistedShellState(raw: unknown): ShellPersistedState | null {
  if (typeof raw !== "object" || raw === null) {
    return null;
  }
  const r = raw as Record<string, unknown>;
  const bool = (v: unknown, fallback: boolean) => (typeof v === "boolean" ? v : fallback);
  const num = (v: unknown, fallback: number) =>
    typeof v === "number" && Number.isFinite(v) ? v : fallback;
  return {
    leftOpen: bool(r.leftOpen, LANDING_DEFAULTS.leftOpen),
    rightOpen: bool(r.rightOpen, LANDING_DEFAULTS.rightOpen),
    fileTreeOpen: bool(r.fileTreeOpen, LANDING_DEFAULTS.fileTreeOpen),
    settingsLeftOpen: bool(r.settingsLeftOpen, LANDING_DEFAULTS.settingsLeftOpen),
    leftWidth: num(r.leftWidth, LANDING_DEFAULTS.leftWidth),
    widthByRegion: parseWidthByRegion(r.widthByRegion),
  };
}

// Keep only well-formed workspace → tool → finite-number entries; drop anything else so a
// corrupt map can never reach the model.
function parseWidthByRegion(
  raw: unknown,
): Record<string, Partial<Record<WorkspaceRegion, number>>> {
  if (typeof raw !== "object" || raw === null) {
    return {};
  }
  const out: Record<string, Partial<Record<WorkspaceRegion, number>>> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value !== "object" || value === null) {
      continue;
    }
    const tools = value as Record<string, unknown>;
    const entry: Partial<Record<WorkspaceRegion, number>> = {};
    for (const tool of ["right", "fileTree"] as const) {
      const w = tools[tool];
      if (typeof w === "number" && Number.isFinite(w)) {
        entry[tool] = w;
      }
    }
    if (Object.keys(entry).length > 0) {
      out[key] = entry;
    }
  }
  return out;
}

export class ShellModel {
  // Page-navigation slice. The shell never routes to settings; it is in-shell page state.
  currentPage: ShellPage = "conversation";

  // Conversation-page visibility flags. Additive + independent (s1 landing defaults: left
  // open, right + tree closed).
  leftOpen = true;
  rightOpen = false;
  fileTreeOpen = false;
  // Settings-page left-nav visibility. Independent of leftOpen on purpose — that
  // independence is what lets "return to conversation" restore the prior layout for free.
  settingsLeftOpen = true;

  // The left rail's single app-wide width (px). Global on purpose — not keyed by workspace.
  leftWidth = REGION_CONSTRAINTS.left.default;
  // workspaceKey -> tool -> remembered width (px, already clamped on write).
  widthByRegion: Record<string, Partial<Record<WorkspaceRegion, number>>> = {};

  // The route context the model cannot know on its own: whether the shell chrome shows
  // (false pre-connection) and the active workspace key (gates the workspace tools + keys
  // their width memory). Runtime-only; fed by the shell-root bridge via setContext.
  showsShell = false;
  workspaceKey: string | null = null;

  constructor() {
    // autoBind so actions keep their `this` when passed straight to event handlers
    // (onPress={shellModel.toggleLeft}) — the MobX 6 way to hand actions to the view.
    makeAutoObservable(this, {}, { autoBind: true });
  }

  // Which cards render and how wide — derived from the model state + the route context.
  get visibleRegions(): VisibleRegions {
    return selectVisibleRegions(
      {
        currentPage: this.currentPage,
        leftOpen: this.leftOpen,
        rightOpen: this.rightOpen,
        fileTreeOpen: this.fileTreeOpen,
        settingsLeftOpen: this.settingsLeftOpen,
        leftWidth: this.leftWidth,
        widthByRegion: this.widthByRegion,
      },
      { showsShell: this.showsShell, workspaceKey: this.workspaceKey },
    );
  }

  // The derived top bar: back button + the region toggles' active/enabled states.
  get topBar(): TopBarModel {
    return selectTopBar(
      {
        currentPage: this.currentPage,
        leftOpen: this.leftOpen,
        rightOpen: this.rightOpen,
        fileTreeOpen: this.fileTreeOpen,
        settingsLeftOpen: this.settingsLeftOpen,
        leftWidth: this.leftWidth,
        widthByRegion: this.widthByRegion,
      },
      { showsShell: this.showsShell, workspaceKey: this.workspaceKey },
    );
  }

  // Feed the route context. Entering/leaving a workspace or connecting a host updates this;
  // the computeds re-derive and observer components repaint.
  setContext(ctx: ShellContext): void {
    this.showsShell = ctx.showsShell;
    this.workspaceKey = ctx.workspaceKey;
  }

  // Page navigation. Entering settings must not touch any conversation flag/width — that
  // isolation restores the prior layout for free on return (no snapshot).
  openSettings(): void {
    this.currentPage = "settings";
  }
  closeSettings(): void {
    this.currentPage = "conversation";
  }

  // Region visibility. The three conversation toggles are additive and independent; the
  // settings-nav toggle drives its own slice. openRight/closeRight are idempotent so
  // composed content actions can "ensure open/closed" without flip ambiguity.
  toggleLeft(): void {
    this._setOpen("leftOpen", !this.leftOpen);
  }
  toggleRight(): void {
    this._setOpen("rightOpen", !this.rightOpen);
  }
  toggleFileTree(): void {
    this._setOpen("fileTreeOpen", !this.fileTreeOpen);
  }
  toggleSettingsLeft(): void {
    this._setOpen("settingsLeftOpen", !this.settingsLeftOpen);
  }
  openRight(): void {
    this._setOpen("rightOpen", true);
  }
  closeRight(): void {
    this._setOpen("rightOpen", false);
  }

  // Region geometry. Left width is global; right/fileTree widths are per-workspace. Both
  // clamp on write so a stale stored value can never produce a broken layout.
  setLeftWidth(px: number): void {
    this.leftWidth = clampRegionWidth("left", px);
  }
  setRegionWidth(workspaceKey: string, region: WorkspaceRegion, px: number): void {
    const existing = this.widthByRegion[workspaceKey] ?? {};
    this.widthByRegion[workspaceKey] = { ...existing, [region]: clampRegionWidth(region, px) };
  }

  // Gutter double-click reset: left globally, a tool by workspace key (a no-op without a
  // key, since the tool's width is keyed by workspace).
  resetRegionWidth(region: ShellRegion, workspaceKey?: string): void {
    if (region === "left") {
      this.leftWidth = REGION_CONSTRAINTS.left.default;
      return;
    }
    if (workspaceKey == null) {
      return;
    }
    this.setRegionWidth(workspaceKey, region, REGION_CONSTRAINTS[region].default);
  }

  // Apply a persisted layout slice on cold start. Leaves currentPage on conversation and
  // the route context untouched (both are runtime-only / route-derived).
  hydrate(slice: ShellPersistedState): void {
    this.leftOpen = slice.leftOpen;
    this.rightOpen = slice.rightOpen;
    this.fileTreeOpen = slice.fileTreeOpen;
    this.settingsLeftOpen = slice.settingsLeftOpen;
    this.leftWidth = slice.leftWidth;
    this.widthByRegion = slice.widthByRegion;
  }

  // The single internal write primitive for the open flags: sets one field, never a
  // sibling. Every toggle/openRight/closeRight routes through it so the "additive, isolated"
  // guarantee lives in exactly one place.
  private _setOpen(field: OpenField, open: boolean): void {
    this[field] = open;
  }
}

// App-wide singleton — the shell's one layout model.
export const shellModel = new ShellModel();
