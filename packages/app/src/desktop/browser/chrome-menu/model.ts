import type { ShortcutKey } from "@/utils/format-shortcut";
import type { ChromeIconName } from "../chrome-icons";
import type { ChromeAvatarId } from "../profile/avatar-ids";

/**
 * One row of a Views menu (ui/menus/simple_menu_model.h): Chrome builds its ⋮ menu as data and
 * hands it to MenuItemView to draw, and so does this one.
 */
export type ChromeMenuEntry =
  | {
      kind: "item";
      id: string;
      label: string;
      icon?: ChromeIconName;
      shortcut?: readonly ShortcutKey[];
      isEnabled?: boolean;
    }
  | {
      kind: "submenu";
      id: string;
      label: string;
      icon?: ChromeIconName;
      entries: readonly ChromeMenuEntry[];
      /**
       * The profile row: its own tinted, rounded background (app_menu.cc PopulateMenu) and the
       * profile's avatar in a 24 dip circle, or `icon` while the profile has none picked.
       */
      profileRow?: { avatarId: ChromeAvatarId | null };
    }
  /** A heading inside a submenu, such as 保存 or 分享; it can't be chosen. */
  | { kind: "title"; label: string }
  | { kind: "separator" }
  /** SPACING_SEPARATOR: blank space with no line, as under the profile row. */
  | { kind: "spacing" }
  /** The zoom row (AppMenu::ZoomView): − percent + and full screen, all in one row. */
  | {
      kind: "zoom";
      label: string;
      percent: number;
      canZoomOut: boolean;
      canZoomIn: boolean;
      zoomOutId: string;
      zoomInId: string;
      fullscreenId: string;
      zoomOutLabel: string;
      zoomInLabel: string;
      fullscreenLabel: string;
    };

/** Rows the keyboard can land on: items that can be chosen, and submenus. */
export function isSelectableEntry(
  entry: ChromeMenuEntry,
): entry is Extract<ChromeMenuEntry, { kind: "item" | "submenu" }> {
  if (entry.kind === "item") {
    return entry.isEnabled !== false;
  }
  return entry.kind === "submenu";
}

/**
 * The row ↑ or ↓ moves to from `fromIndex`. On macOS the selection stops at the ends instead of
 * wrapping (menu_config_mac.mm: arrow_key_selection_wraps = false). From no row, ↓ picks the
 * first and ↑ the last.
 */
export function nextSelectableIndex(
  entries: readonly ChromeMenuEntry[],
  fromIndex: number | null,
  direction: 1 | -1,
): number | null {
  let index = fromIndex ?? (direction === 1 ? -1 : entries.length);
  for (index += direction; index >= 0 && index < entries.length; index += direction) {
    const entry = entries[index];
    if (entry && isSelectableEntry(entry)) {
      return index;
    }
  }
  return fromIndex;
}

// MenuController's prefix selector: letters typed this close together spell one prefix.
const TYPED_PREFIX_TIMEOUT_MS = 800;

export interface TypedPrefix {
  text: string;
  at: number;
}

/** The prefix after typing `key` at `now`: added to the last one, or a fresh one after a pause. */
export function extendTypedPrefix(
  previous: TypedPrefix | null,
  key: string,
  now: number,
): TypedPrefix {
  const isContinuing = previous !== null && now - previous.at < TYPED_PREFIX_TIMEOUT_MS;
  return { text: isContinuing ? previous.text + key : key, at: now };
}

/**
 * The row typed letters select (all_menus_use_prefix_selection on macOS), case ignored. One
 * letter moves on to the next row starting with it, so repeating it steps through them; a longer
 * prefix keeps the current row while it still matches.
 */
export function prefixMatchIndex(
  entries: readonly ChromeMenuEntry[],
  fromIndex: number | null,
  prefix: string,
): number | null {
  const needle = prefix.toLocaleLowerCase();
  if (!needle) {
    return null;
  }
  const count = entries.length;
  const start = needle.length > 1 ? (fromIndex ?? 0) - 1 : (fromIndex ?? -1);
  for (let step = 1; step <= count; step += 1) {
    const index = (((start + step) % count) + count) % count;
    const entry = entries[index];
    if (!entry || !isSelectableEntry(entry)) {
      continue;
    }
    if (entry.label.toLocaleLowerCase().startsWith(needle)) {
      return index;
    }
  }
  return null;
}

/**
 * A React key for each row: an item's id, and for rows without one (separators, headings) a key
 * taken from the row before, so keys stay put when rows elsewhere come and go.
 */
export function entryKeys(entries: readonly ChromeMenuEntry[]): string[] {
  const keys: string[] = [];
  let previousKey = "start";
  for (const entry of entries) {
    let key: string;
    if (entry.kind === "item" || entry.kind === "submenu") {
      key = entry.id;
    } else if (entry.kind === "title") {
      key = `title:${entry.label}`;
    } else {
      key = `${entry.kind}:after:${previousKey}`;
    }
    keys.push(key);
    previousKey = key;
  }
  return keys;
}
