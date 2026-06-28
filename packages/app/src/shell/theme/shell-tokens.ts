import { getIsElectronMac, isWeb } from "@/constants/platform";

// The shell's own, self-contained design tokens — written from scratch, importing no
// existing theme/card module. Values are taken by reference from the shell ui.html
// (codePilot "github" palette + Approach C periwinkle backdrop). Components read
// SHELL_COLORS[theme.colorScheme] so the shell follows light/dark without pulling any
// app color token. Keeping geometry + color here means the shell is one new building.

export type ShellScheme = "light" | "dark";

interface ShellColorSet {
  // Approach C: the solid light-blue (periwinkle) backdrop behind the floating cards —
  // the no-vibrancy fallback. On macOS Electron the window itself is transparent +
  // vibrancy, so the root is painted transparent instead (see SHELL_USES_VIBRANCY) and
  // this value is the fallback for browser web and non-mac desktop.
  backdrop: string;
  // Floating-card surfaces, translucent white so the vibrancy/periwinkle reads faintly
  // through them. Sidebar/settings-nav cards are more translucent (frosted rail); the
  // content cards (canvas / right tools / file tree) are nearer opaque for readability.
  surfaceSidebar: string;
  surfaceCard: string;
  foreground: string;
  foregroundMuted: string;
  // The card's only visible edge (a hairline), plus the placeholder dashed outline.
  border: string;
  // Toggle "expanded/active" fill — a very light gray (#eaeef2), never black or primary.
  toggleActive: string;
  // Hover overlays: top-bar toggle = faint foreground wash; sidebar row = sidebar-accent;
  // ghost (back button) = the lightest accent.
  toggleHover: string;
  rowHover: string;
  ghostHover: string;
  // Resize-gutter center line, by state.
  gutterIdle: string;
  gutterHover: string;
  gutterDrag: string;
}

export const SHELL_COLORS: Record<ShellScheme, ShellColorSet> = {
  light: {
    backdrop: "#d3deef",
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

// On macOS Electron the desktop window is transparent with native vibrancy, so the shell
// root must be painted transparent to let that blur read through. Everywhere else there
// is no vibrancy, so the root paints the periwinkle backdrop fallback. The shell model
// never reads this — it is a pure presentation gate.
export const SHELL_USES_VIBRANCY = getIsElectronMac();

// Shell geometry (px), fixed by the design (ui.html). Not on any theme — intentionally
// static constants.
export const TOP_BAR_HEIGHT = 40;
export const TOGGLE_SIZE = 28;
export const TOGGLE_RADIUS = 8;
export const GUTTER_WIDTH = 8;
export const CARD_RADIUS = 12;
export const CONTROL_RADIUS = 6;
// Outer window padding: 8 top (under the title bar), 16 sides + bottom (ui.html .win).
export const WINDOW_PADDING = { top: 8, horizontal: 16, bottom: 16 } as const;
// Left inset on the top bar reserving the macOS traffic-light footprint (Electron draws
// them natively at ~x16; browser web draws its own dots into this gap). Native: none.
export const TRAFFIC_LIGHT_INSET = isWeb ? 72 : 0;

// Web-only frosted blur for the translucent cards (no native equivalent — native shows
// the flat translucent color). Mirrors the codePilot sidebar treatment over vibrancy.
export const WEB_FROSTED = isWeb
  ? ({
      backdropFilter: "blur(28px) saturate(1.5)",
      WebkitBackdropFilter: "blur(28px) saturate(1.5)",
    } as object)
  : null;

// Web-only card lift: a soft drop shadow (GitHub flat card) plus a 1px inset white
// highlight ring as the card's edge — adjacent gray borders would read as hard divider
// lines in the gutters, so the edge is this ring, not a border.
export const WEB_CARD_SHADOW = isWeb
  ? ({
      boxShadow:
        "0 1px 0 rgba(31,35,40,0.04), 0 1px 3px rgba(31,35,40,0.08), inset 0 0 0 1px rgba(255,255,255,0.16)",
    } as object)
  : null;
