// Web-only CSS :hover for the tab bar — the single hover paint path (mirrors file-tree's row-hover-css.ts:
// JS onHoverIn/pointerenter miss hover when a tab re-renders/reflows under a stationary cursor, and this
// repo forbids onPointerEnter/Leave). Inactive tabs opt in via data-rptab: the rule washes the tab
// background on hover and swaps the trailing dirty-dot ↔ ✕ (dirty ● at rest, ✕ on hover). Active tabs
// paint their pill + always-visible ✕ inline, so they carry NO data-rptab and are never contested.

import { isWeb } from "@/constants/platform";

const STYLE_ID = "rp-tab-hover";
let appliedPalette: string | null = null;

// Idempotently install/update the tab hover rules with the CURRENT chrome hover token (no-op off web).
// Called from the tab bar observer on render, so a scheme flip re-tints the wash.
export function ensureTabHoverCss(tabHoverColor: string, foregroundColor: string): void {
  if (!isWeb || typeof document === "undefined") {
    return;
  }
  const palette = `${tabHoverColor}|${foregroundColor}`;
  if (appliedPalette === palette && document.getElementById(STYLE_ID)) {
    return;
  }
  let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement("style");
    style.id = STYLE_ID;
    document.head.appendChild(style);
  }
  style.textContent = [
    `[data-rptab]:hover { background-color: ${tabHoverColor} !important; }`,
    `[data-rptab]:hover [data-rptitle] { color: ${foregroundColor} !important; }`,
    `[data-rptab]:hover svg { color: ${foregroundColor} !important; stroke: ${foregroundColor} !important; }`,
    `[data-rptab]:hover [data-rpx] { opacity: 1 !important; }`,
    `[data-rptab]:hover [data-rpdirty] { opacity: 0 !important; }`,
  ].join("\n");
  appliedPalette = palette;
}

// The dataSets marking an inactive tab hover-eligible and its swappable trailing dirty-dot / ✕.
export const TAB_HOVER_DATASET = { rptab: "1" } as const;
export const TAB_TITLE_DATASET = { rptitle: "1" } as const;
export const TAB_X_DATASET = { rpx: "1" } as const;
export const TAB_DIRTY_DATASET = { rpdirty: "1" } as const;
