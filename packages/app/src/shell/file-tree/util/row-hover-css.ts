// Web-only CSS :hover for tree/search rows — the SINGLE hover paint path. JS onHoverIn/onHoverOut
// misses pointerenter when rows re-render/reflow under a stationary cursor (progressive results
// streaming in, portals opening) — the chairman's "hover sometimes doesn't show". Browser :hover
// is evaluated by the compositor every frame and cannot miss, so rows carry NO JS hover state at
// all (review 2026-07-07: the earlier JS branch was dead — this rule's !important always won).
// Rows opt in via data-fthover ONLY while unhighlighted, so the wash never covers the
// selected/context-target fill (those paint via inline style on rows without the attribute).

import { isWeb } from "@/constants/platform";

const STYLE_ID = "ft-row-hover-fallback";

let appliedColor: string | null = null;

/**
 * Idempotently install/update the hover rule with the CURRENT theme's hover token (no-op off web).
 * Called from the observer panel components on render, so a scheme flip re-tints the rule.
 */
export function ensureRowHoverCss(color: string): void {
  if (!isWeb || typeof document === "undefined") {
    return;
  }
  if (appliedColor === color && document.getElementById(STYLE_ID)) {
    return;
  }
  let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement("style");
    style.id = STYLE_ID;
    document.head.appendChild(style);
  }
  // !important so the rule beats RN-web's inline background-color (transparent) on idle rows;
  // highlighted rows don't carry data-fthover, so their inline fill is never contested.
  style.textContent = `[data-fthover]:hover { background-color: ${color} !important; }`;
  appliedColor = color;
}

/** The dataSet marking a row as hover-eligible (spread as `dataSet={ROW_HOVER_DATASET}`). */
export const ROW_HOVER_DATASET = { fthover: "1" } as const;
