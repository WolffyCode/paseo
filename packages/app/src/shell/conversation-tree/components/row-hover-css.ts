import { isWeb } from "@/constants/platform";

const STYLE_ID = "conversation-tree-row-hover";
let appliedPalette: string | null = null;

/** Keep row and section hover paint in the browser compositor. */
export function ensureConversationTreeHoverCss(hoverColor: string): void {
  if (!isWeb || typeof document === "undefined") {
    return;
  }
  if (appliedPalette === hoverColor && document.getElementById(STYLE_ID)) {
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
    `[data-convsection]:hover [data-convsectionaction] { opacity: 1 !important; }`,
    `[data-convsectionaction]:hover { background-color: ${hoverColor} !important; }`,
  ].join("\n");
  appliedPalette = hoverColor;
}

export const CONVERSATION_ROW_DATASET = { convrow: "1" } as const;
export const CONVERSATION_ROW_HOVER_DATASET = { convrow: "1", convhover: "1" } as const;
export const CONVERSATION_SECTION_DATASET = { convsection: "1" } as const;
export const CONVERSATION_SECTION_ACTION_DATASET = { convsectionaction: "1" } as const;
