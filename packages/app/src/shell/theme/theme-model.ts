import { makeAutoObservable } from "mobx";
import type { ThemeName } from "@/styles/theme";

// The shell's theme model (class + MobX). It owns the active light/dark `scheme` and
// derives `tokens` from it; the two token sets are carried here (no app color-token pull,
// no Unistyles theme callback). This is the structural fix for the /home crash: components
// read `themeModel.tokens.X` through `observer`, and `scheme` is computed from the app's
// own state via `resolveThemeScheme` — never indexed off a style-factory `colorScheme`
// discriminant that can be undefined during adaptive-theme hydration.

export type ThemeScheme = "light" | "dark";

// The shell's token contract (taxonomy of semantic color roles). Light and dark provide
// the SAME field set with different values — that identical key set is exactly why
// `tokens.X` can never resolve to undefined regardless of scheme.
export interface ShellTokens {
  // Approach C: the solid periwinkle backdrop behind the floating cards (the no-vibrancy
  // fallback). On macOS Electron the root is painted transparent so window vibrancy reads
  // through (see SHELL_USES_VIBRANCY); this is the fallback for browser web / non-mac.
  backdrop: string;
  // Floating-card surfaces, translucent white so the vibrancy/periwinkle reads faintly
  // through. The sidebar rail is more translucent (frosted); content cards near opaque.
  surfaceSidebar: string;
  surfaceCard: string;
  foreground: string;
  foregroundMuted: string;
  // The card's only visible edge (a hairline), plus the placeholder dashed outline.
  border: string;
  // Toggle "expanded/active" fill — a very light gray, never black or primary.
  toggleActive: string;
  // Hover overlays: top-bar toggle wash / sidebar row / ghost (back button).
  toggleHover: string;
  rowHover: string;
  ghostHover: string;
  // Resize-gutter center line, by state.
  gutterIdle: string;
  gutterHover: string;
  gutterDrag: string;
}

// The two token sets, carried by the model. Values come straight from the shell ui.html
// (codePilot "github" palette + Approach C periwinkle backdrop + translucent-white cards).
export const SHELL_TOKENS: Record<ThemeScheme, ShellTokens> = {
  light: {
    backdrop: "rgba(190, 210, 238, 0.86)",
    surfaceSidebar: "rgba(255, 255, 255, 0.60)",
    surfaceCard: "rgba(255, 255, 255, 0.82)",
    foreground: "#1f2328",
    foregroundMuted: "#59636e",
    border: "#d1d9e0",
    toggleActive: "#eaeef2",
    toggleHover: "rgba(31, 35, 40, 0.07)",
    rowHover: "#eaeef2",
    ghostHover: "#f6f8fa",
    gutterIdle: "rgba(31, 35, 40, 0.13)",
    gutterHover: "rgba(31, 35, 40, 0.32)",
    gutterDrag: "rgba(31, 35, 40, 0.45)",
  },
  dark: {
    backdrop: "#0d1117",
    surfaceSidebar: "rgba(13, 17, 23, 0.62)",
    surfaceCard: "rgba(22, 27, 34, 0.85)",
    foreground: "#e6edf3",
    foregroundMuted: "#8b949e",
    border: "#30363d",
    toggleActive: "#21262d",
    toggleHover: "rgba(230, 237, 243, 0.09)",
    rowHover: "#21262d",
    ghostHover: "#161b22",
    gutterIdle: "rgba(230, 237, 243, 0.13)",
    gutterHover: "rgba(230, 237, 243, 0.32)",
    gutterDrag: "rgba(230, 237, 243, 0.45)",
  },
};

// Each registered app theme's fixed light/dark scheme. Total over ThemeName so a concrete
// theme always resolves to a defined scheme (a missing entry is the crash we are killing).
export const THEME_SCHEME: Record<ThemeName, ThemeScheme> = {
  codePilot: "light",
  light: "light",
  dark: "dark",
  zinc: "dark",
  midnight: "dark",
  claude: "dark",
  ghostty: "dark",
};

// Pure derivation of the active scheme from the app's own state. "auto" follows the live
// system scheme (collapsing a null/unknown system scheme to light so the shell always has
// a defined scheme); a concrete theme uses its fixed THEME_SCHEME entry. No React, no
// Unistyles, no DOM — directly unit-testable and independent of render timing.
export function resolveThemeScheme(
  setting: ThemeName | "auto",
  systemScheme: ThemeScheme | null,
): ThemeScheme {
  if (setting === "auto") {
    return systemScheme ?? "light";
  }
  return THEME_SCHEME[setting];
}

export class ThemeModel {
  // The active scheme. Public-observable, but written only through setScheme (the shell-root
  // bridge feeds it resolveThemeScheme(settings.theme, systemScheme)).
  scheme: ThemeScheme = "light";

  constructor() {
    // autoBind so setScheme keeps its `this` when handed to the shell-root bridge effect.
    makeAutoObservable(this, {}, { autoBind: true });
  }

  // The active token set — a cached computed off `scheme`. Components read this and paint
  // colors inline; `observer` repaints them when `scheme` flips.
  get tokens(): ShellTokens {
    return SHELL_TOKENS[this.scheme];
  }

  // The single write path for the scheme. Idempotent: re-setting the same value is a no-op
  // for observers (MobX skips equal assignments), so a steady system scheme never churns.
  setScheme(scheme: ThemeScheme): void {
    this.scheme = scheme;
  }
}

// App-wide singleton — the shell's one theme model.
export const themeModel = new ThemeModel();
