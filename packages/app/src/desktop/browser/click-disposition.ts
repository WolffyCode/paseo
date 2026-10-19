import type { GestureResponderEvent } from "react-native";
import { getShortcutOs } from "@/utils/shortcut-platform";

/**
 * Where a toolbar command opens what it shows. "saveToDisk" is Chrome's Alt-click: a link would
 * download, a toolbar button navigates nowhere.
 */
export type BrowserClickDisposition =
  | "currentTab"
  | "newBackgroundTab"
  | "newForegroundTab"
  | "saveToDisk";

interface ClickInput {
  isMiddleButton: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  isMac: boolean;
}

/**
 * Chrome's ui::DispositionFromEventFlags: a middle click or ⌘-click (Ctrl-click off Mac) opens a
 * background tab, Shift brings it to the front. Chrome opens a new window for a Shift-click; a
 * column holds one browser window, so that becomes a tab in front too.
 */
export function clickDisposition(input: ClickInput): BrowserClickDisposition {
  const hasNewTabModifier = input.isMac ? input.metaKey : input.ctrlKey;
  if (input.isMiddleButton || hasNewTabModifier) {
    return input.shiftKey ? "newForegroundTab" : "newBackgroundTab";
  }
  if (input.shiftKey) {
    return "newForegroundTab";
  }
  return input.altKey ? "saveToDisk" : "currentTab";
}

function isModifierDown(
  nativeEvent: object,
  name: "metaKey" | "ctrlKey" | "shiftKey" | "altKey",
): boolean {
  return name in nativeEvent && Reflect.get(nativeEvent, name) === true;
}

/** The disposition of a button press; on web the press carries the DOM click's modifiers. */
export function pressDisposition(event: GestureResponderEvent): BrowserClickDisposition {
  const nativeEvent: object = event.nativeEvent;
  return clickDisposition({
    isMiddleButton: false,
    metaKey: isModifierDown(nativeEvent, "metaKey"),
    ctrlKey: isModifierDown(nativeEvent, "ctrlKey"),
    shiftKey: isModifierDown(nativeEvent, "shiftKey"),
    altKey: isModifierDown(nativeEvent, "altKey"),
    isMac: getShortcutOs() === "mac",
  });
}

/** The disposition of a middle click on a toolbar button. */
export function middleClickDisposition(event: MouseEvent): BrowserClickDisposition {
  return clickDisposition({
    isMiddleButton: true,
    metaKey: event.metaKey,
    ctrlKey: event.ctrlKey,
    shiftKey: event.shiftKey,
    altKey: event.altKey,
    isMac: getShortcutOs() === "mac",
  });
}
