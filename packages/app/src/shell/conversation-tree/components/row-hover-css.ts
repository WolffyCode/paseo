import { isWeb } from "@/constants/platform";

const STYLE_ID = "conversation-tree-row-hover";
let appliedPalette: string | null = null;

/** Keep hover paint and trailing-action disclosure in the browser compositor. */
export function ensureConversationTreeHoverCss(hoverColor: string, actionHoverColor: string): void {
  if (!isWeb || typeof document === "undefined") {
    return;
  }
  const palette = `${hoverColor}|${actionHoverColor}`;
  if (appliedPalette === palette && document.getElementById(STYLE_ID)) {
    return;
  }
  let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (style === null) {
    style = document.createElement("style");
    style.id = STYLE_ID;
    document.head.appendChild(style);
  }
  style.textContent = [
    `[data-convhover]:hover { background-color: ${hoverColor} !important; }`,
    `[data-convrow]:hover [data-convaction], [data-convrow]:focus-within [data-convaction] { opacity: 1 !important; }`,
    `[data-convrow]:hover [data-convbadge], [data-convrow]:focus-within [data-convbadge] { opacity: 0 !important; }`,
    `[data-convaction]:hover { background-color: ${actionHoverColor} !important; }`,
    `[data-convsection]:hover [data-convsectionaction] { opacity: 1 !important; }`,
    `[data-convsectionaction]:hover { background-color: ${hoverColor} !important; }`,
    `@keyframes conversation-tree-dot-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.55; } }`,
    `[data-status="running"], [data-status="needsAttention"], [data-status="initializing"] { animation: conversation-tree-dot-pulse 1.8s ease-in-out infinite; }`,
  ].join("\n");
  appliedPalette = palette;
}

export const CONVERSATION_ROW_DATASET = { convrow: "1" } as const;
export const CONVERSATION_ROW_HOVER_DATASET = { convrow: "1", convhover: "1" } as const;
export const CONVERSATION_ACTION_DATASET = { convaction: "1" } as const;
export const CONVERSATION_BADGE_DATASET = { convbadge: "1" } as const;
export const CONVERSATION_SECTION_DATASET = { convsection: "1" } as const;
export const CONVERSATION_SECTION_ACTION_DATASET = { convsectionaction: "1" } as const;
