import { isWeb } from "@/constants/platform";

// The one definition of Helm's floating-card chrome, shared by the home-shell region frames
// (left / center / right tools / file tree) and the workspace split panes so every card reads
// identically. Mirrors CodePilot's macOS floating-card model (globals.css darwin profile).

// 14px = CodePilot's floating-card radius. It sits between token xl(12) and 2xl(16), so it is a
// card-specific constant rather than a bent radius step.
export const CARD_RADIUS = 14;

// CodePilot's card shadow flattened onto a single overflow:hidden card (overflow:hidden — unlike
// clip-path — does NOT crop an outer box-shadow, so one node suffices). Outer: three diffuse drops
// (rgba .06) for the lift off the vibrancy backdrop. Inset: a 1px white highlight ring
// (rgba 255,255,255,.18) — the card's only visible edge, NOT a grey border (adjacent grey borders
// read as hard divider lines in the gutters; CodePilot "Round 33" deleted them). Web-only; native
// falls back to the RN shadow object on the consuming card style.
export const WEB_CARD_SHADOW = isWeb
  ? ({
      boxShadow:
        "0 1px 1px -0.5px rgba(0,0,0,0.06), 0 3px 3px -1.5px rgba(0,0,0,0.06), 0 6px 6px -3px rgba(0,0,0,0.06), inset 0 0 0 1px rgba(255,255,255,0.18)",
    } as object)
  : null;

// backdrop-filter is web-only CSS (no native equivalent); the frosted (translucent) cards degrade
// to their solid translucent color on native. blur(28px) saturate(1.5) matches CodePilot's
// --platform-surface-sidebar treatment over the window vibrancy.
export const WEB_FROSTED = isWeb
  ? ({
      backdropFilter: "blur(28px) saturate(1.5)",
      WebkitBackdropFilter: "blur(28px) saturate(1.5)",
    } as object)
  : null;
