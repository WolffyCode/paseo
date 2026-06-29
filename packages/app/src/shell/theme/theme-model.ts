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
  // The flat solid behind the cards: on web/electron it is the base under the gradient layer (a
  // brief flash before that layer paints); on native it is the only backdrop (no CSS gradients).
  // Set to the average of the four gradient corners so the flat fallback matches the overall tone.
  backdrop: string;
  // The four window corners of the bilinear backdrop gradient (web/electron). The shell backdrop
  // layer interpolates these across the whole window. They are the TRUE rendered corners of the
  // design's `--win-backdrop` (ui.html), so the diagonal reads as the design does: bright top-left
  // (the white radial glow), deep periwinkle bottom-right (the blue radial glow). On macOS Electron
  // the backdrop is painted at <1 group opacity so the real desktop shows through this light-blue
  // wash; the corner colors themselves stay fully opaque.
  backdropGradient: {
    topLeft: string;
    topRight: string;
    bottomLeft: string;
    bottomRight: string;
  };
  // The left sidebar rail surface: an opaque pale cyan-tint (chairman-fixed) — a flat solid, so it
  // presents that exact color sitting over the translucent backdrop.
  surfaceSidebar: string;
  // Content/main card surfaces: an OPAQUE solid (the cards are not frosted/translucent). Cards sit
  // solid over the translucent window backdrop — the desktop shows through the BACKDROP, never
  // through a card.
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

// The two token sets, carried by the model. Values come straight from the design (codePilot
// "github" palette + the four-corner backdrop sampled from the design's `--win-backdrop` +
// solid cards floating over a translucent window backdrop). The backdrop is made translucent by
// ShellBackdrop's group opacity, not by alpha on these colors.
export const SHELL_TOKENS: Record<ThemeScheme, ShellTokens> = {
  light: {
    backdrop: "rgb(207, 220, 237)",
    backdropGradient: {
      topLeft: "rgb(228, 235, 245)",
      topRight: "rgb(204, 217, 235)",
      bottomLeft: "rgb(204, 217, 235)",
      bottomRight: "rgb(193, 209, 233)",
    },
    surfaceSidebar: "rgb(228, 238, 240)",
    surfaceCard: "rgb(255, 255, 255)",
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
    backdropGradient: {
      topLeft: "rgb(24, 30, 42)",
      topRight: "rgb(22, 27, 36)",
      bottomLeft: "rgb(13, 17, 23)",
      bottomRight: "rgb(15, 19, 27)",
    },
    surfaceSidebar: "rgb(13, 17, 23)",
    surfaceCard: "rgb(22, 27, 34)",
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
