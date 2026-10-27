/**
 * TaskManagerView's look (chrome/browser/ui/views/task_manager_view.cc and the views it builds),
 * resolved to Chrome 155's baseline colors for each scheme.
 */

const COLORS = {
  light: {
    background: "#FFFFFF",
    text: "#1F1F1F",
    secondaryText: "#474747",
    primary: "#0B57D0",
    onPrimary: "#FFFFFF",
    buttonHover: "#2468D4",
    buttonFocused: "#0D50BB",
    disabledBackground: "#E5E5E5",
    disabledText: "#9A9A9A",
    divider: "#D3E3FD",
    tableBackground: "#EFF3FA",
    rowSelected: "#D3E3FD",
    rowHover: "#E3E7ED",
    iconPlate: "#FFFFFF",
    subtleHover: "rgba(31,31,31,0.059)",
  },
  dark: {
    background: "#1F1F1F",
    text: "#E3E3E3",
    secondaryText: "#C7C7C7",
    primary: "#A8C7FA",
    onPrimary: "#062E6F",
    buttonHover: "#A0BDED",
    buttonFocused: "#AFCAF7",
    disabledBackground: "#363636",
    disabledText: "#777777",
    divider: "#5E5E5E",
    tableBackground: "#333438",
    rowSelected: "#004A77",
    rowHover: "#48484C",
    iconPlate: "#1F1F1F",
    subtleHover: "rgba(253,252,251,0.102)",
  },
} as const;

function colorVariables(scheme: keyof typeof COLORS): string {
  return Object.entries(COLORS[scheme])
    .map(([name, value]) => `--${name}: ${value};`)
    .join(" ");
}

// Chrome's UI font on macOS: the system font, PingFang for Chinese (platform_font_mac.mm).
const FONT_FAMILY = `-apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", sans-serif`;

export const TASK_MANAGER_FONT_FAMILY = FONT_FAMILY;

export const TASK_MANAGER_STYLES = `
:root { color-scheme: light; ${colorVariables("light")} }
:root[data-scheme="dark"] { color-scheme: dark; ${colorVariables("dark")} }
html, body { margin: 0; height: 100%; overflow: hidden; background: var(--background); }
body { font-family: ${FONT_FAMILY}; -webkit-user-select: none; user-select: none; cursor: default; }
button { font: inherit; }
.tm { display: flex; flex-direction: column; height: 100%; box-sizing: border-box; padding: 4px 20px 0; }

.tm-header { position: relative; flex: none; height: 50px; display: flex; align-items: center; }
.tm-tabs { position: relative; flex: none; display: flex; height: 50px; }
.tm-tab { all: unset; box-sizing: border-box; height: 50px; padding: 2px 18px; display: flex; align-items: center; justify-content: center; gap: 8px; font: 500 13px/20px ${FONT_FAMILY}; color: var(--secondaryText); white-space: nowrap; }
.tm-tab[aria-selected="true"] { color: var(--primary); }
.tm-tab:focus-visible { outline: 2px solid -webkit-focus-ring-color; outline-offset: -2px; }
.tm-tab svg { width: 16px; height: 16px; flex: none; }
.tm-tab-bar { position: absolute; bottom: 0; left: 0; width: 0; height: 2px; background: var(--primary); z-index: 1; }
/* BoxLayout gives each its preferred width (the search 160 dip), then splits what is left 7:3. */
.tm-header-space { flex: 7 1 0; }
.tm-search { flex: 3 1 160px; min-width: 160px; height: 36px; display: flex; align-items: center; border-radius: 16px; }
.tm-search-icon { width: 20px; height: 20px; margin: 0 4px; flex: none; color: var(--secondaryText); }
.tm-search input { all: unset; flex: 1; min-width: 0; height: 36px; font: 12px ${FONT_FAMILY}; color: var(--text); cursor: text; -webkit-user-select: text; user-select: text; }
.tm-search input::placeholder { color: var(--secondaryText); }
.tm-clear { all: unset; flex: none; width: 20px; height: 20px; margin: 0 4px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: var(--secondaryText); }
.tm-clear[hidden] { display: none; }
.tm-clear:hover { background: var(--subtleHover); }
.tm-clear svg { width: 20px; height: 20px; }
.tm-divider { position: absolute; left: 0; right: 0; bottom: 0; height: 2px; background: var(--divider); }

.tm-table { flex: 1 1 0; min-height: 0; margin-top: 16px; display: flex; flex-direction: column; border-radius: 8px; overflow: hidden; background: var(--tableBackground); }
.tm-head { overflow: hidden; flex: none; height: 44px; box-sizing: border-box; display: flex; border-bottom: 1px solid var(--divider); font: 500 13px/16px ${FONT_FAMILY}; color: var(--text); }
.tm-hcell { position: relative; flex: none; box-sizing: border-box; padding: 0 12px; display: flex; align-items: center; white-space: nowrap; overflow: hidden; }
.tm-hcell.is-right { justify-content: flex-end; }
.tm-hcell::after { content: ""; position: absolute; right: 0; top: 16px; width: 1px; height: 12px; background: var(--divider); }
.tm-hcell-title { overflow: hidden; text-overflow: ellipsis; }
.tm-sort { flex: none; width: 0; height: 0; margin-left: 7px; border-left: 4px solid transparent; border-right: 4px solid transparent; }
.tm-sort.is-ascending { border-bottom: 8px solid currentColor; }
.tm-sort.is-descending { border-top: 8px solid currentColor; }
.tm-hcell.is-right .tm-sort { margin-right: 7px; }
.tm-resize { position: absolute; top: 0; bottom: 0; width: 10px; margin-left: -5px; cursor: col-resize; z-index: 2; }
.tm-body { flex: 1 1 0; min-height: 0; overflow-x: auto; overflow-y: auto; outline: none; }
.tm-row { min-width: max-content; display: flex; height: 30px; font: 12px/18px ${FONT_FAMILY}; color: var(--text); }
.tm-row.is-hovered { background: var(--rowHover); }
.tm-row.is-selected { background: var(--rowSelected); }
.tm-cell { flex: none; box-sizing: border-box; padding: 0 12px; display: flex; align-items: center; white-space: nowrap; overflow: hidden; }
.tm-cell.is-right { justify-content: flex-end; }
.tm-cell-text { overflow: hidden; text-overflow: ellipsis; }
.tm-task-icon { position: relative; flex: none; width: 16px; height: 16px; margin-right: 12px; color: var(--text); }
.tm-task-icon.has-plate::before { content: ""; position: absolute; inset: -4px; border-radius: 4px; background: var(--iconPlate); }
.tm-task-icon img, .tm-task-icon svg { position: relative; display: block; width: 16px; height: 16px; }

.tm-buttons { flex: none; display: flex; justify-content: flex-end; align-items: center; gap: 16px; padding: 24px 0 20px; }
.tm-end { all: unset; box-sizing: border-box; height: 36px; min-width: 64px; padding: 0 16px; border-radius: 18px; display: inline-flex; align-items: center; justify-content: center; font: 500 13px/20px ${FONT_FAMILY}; background: var(--primary); color: var(--onPrimary); white-space: nowrap; }
.tm-end:hover:not(:disabled) { background: var(--buttonHover); }
.tm-end:focus-visible { background: var(--buttonFocused); outline: 2px solid -webkit-focus-ring-color; outline-offset: 2px; }
.tm-end:disabled { background: var(--disabledBackground); color: var(--disabledText); }
.tm-status { flex: 1; min-width: 0; font: 12px/18px ${FONT_FAMILY}; color: var(--secondaryText); }
`;
