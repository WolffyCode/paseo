import type { DesktopBrowserNavigationHistory, DesktopNativeMenuItem } from "@/desktop/host";

// Chrome lists this many entries in a back or forward menu (BackForwardMenuModel::kMaxHistoryItems).
const MAX_HISTORY_MENU_ITEMS = 12;

export type HistoryMenuDirection = "back" | "forward";

/** The session history entries a back or forward menu lists, nearest first. */
export function historyMenuIndices(input: {
  activeIndex: number;
  entryCount: number;
  direction: HistoryMenuDirection;
}): number[] {
  const indices: number[] = [];
  const step = input.direction === "back" ? -1 : 1;
  for (let offset = 1; offset <= MAX_HISTORY_MENU_ITEMS; offset += 1) {
    const index = input.activeIndex + step * offset;
    if (index < 0 || index >= input.entryCount) {
      break;
    }
    indices.push(index);
  }
  return indices;
}

/** Chrome's menu rows: each entry's title, or its address when the page had none. */
export function historyMenuItems(
  history: DesktopBrowserNavigationHistory,
  direction: HistoryMenuDirection,
): DesktopNativeMenuItem[] {
  const indices = historyMenuIndices({
    activeIndex: history.activeIndex,
    entryCount: history.entries.length,
    direction,
  });
  return indices.map((index) => {
    const entry = history.entries[index];
    return { id: String(index), label: entry?.title || entry?.url || "" };
  });
}
