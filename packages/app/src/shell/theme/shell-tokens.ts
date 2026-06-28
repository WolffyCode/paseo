import { getIsElectronMac, isWeb } from "@/constants/platform";

// The shell's static, scheme-independent constants: geometry (fixed px from ui.html) +
// platform presentation gates. Color tokens live in ThemeModel (they vary by light/dark);
// everything here does NOT change with scheme, so it stays plain static constants.

// On macOS Electron the desktop window is transparent with native vibrancy, so the shell
// root is painted transparent to let that blur read through. Everywhere else there is no
// vibrancy, so the root paints the periwinkle backdrop token. Scheme-independent (a
// platform gate), so it stays here, not on ThemeModel.
export const SHELL_USES_VIBRANCY = getIsElectronMac();

// Shell geometry (px), fixed by the design (ui.html). Intentionally static constants.
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

// Web-only frosted blur for the translucent cards (no native equivalent — native shows the
// flat translucent color). Mirrors the codePilot sidebar treatment over vibrancy.
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
