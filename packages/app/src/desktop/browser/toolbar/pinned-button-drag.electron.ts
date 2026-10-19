import { useEffect, type RefObject } from "react";
import type { View } from "react-native";
import { getShortcutOs } from "@/utils/shortcut-platform";
import { CHROME_LAYOUT } from "../chrome-theme";
import type { BrowserPinnableAction } from "./settings";

// Marks a drag as one of the pinned buttons, so drops from pages or files are ignored.
export const PINNED_ACTION_DRAG_TYPE = "application/x-helm-pinned-action";

/** How a pinned button reports drags and key moves to its container. */
export interface PinnedButtonDragHandlers {
  onNode: (action: BrowserPinnableAction, node: HTMLElement | null) => void;
  onDragStart: (action: BrowserPinnableAction) => void;
  onDragEnd: () => void;
  onMoveByKey: (action: BrowserPinnableAction, step: -1 | 1) => void;
}

/**
 * Makes a pinned button draggable into a new order, and movable with ⌘← and ⌘→ (Ctrl off Mac) or
 * ⇧Home and ⇧End, as pinned_action_toolbar_button.cc does. `handlers` null leaves it in place: a
 * popped-out button can't be reordered.
 */
export function usePinnedButtonDrag(
  action: BrowserPinnableAction,
  buttonRef: RefObject<View | null>,
  handlers: PinnedButtonDragHandlers | null,
): void {
  useEffect(() => {
    const node: unknown = buttonRef.current;
    if (!handlers || !(node instanceof HTMLElement)) {
      return;
    }
    const button = node;
    const { onNode, onDragStart, onDragEnd, onMoveByKey } = handlers;
    onNode(action, button);
    button.draggable = true;
    function handleDragStart(event: DragEvent) {
      if (!event.dataTransfer) {
        return;
      }
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData(PINNED_ACTION_DRAG_TYPE, action);
      // Chrome drags the button's icon.
      const icon = button.querySelector("svg");
      if (icon) {
        const iconCenter = CHROME_LAYOUT.toolbarIconSize / 2;
        event.dataTransfer.setDragImage(icon, iconCenter, iconCenter);
      }
      onDragStart(action);
    }
    function handleKeyDown(event: KeyboardEvent) {
      const hasMoveModifier = getShortcutOs() === "mac" ? event.metaKey : event.ctrlKey;
      const movesLeft =
        (hasMoveModifier && event.key === "ArrowLeft") || (event.shiftKey && event.key === "Home");
      const movesRight =
        (hasMoveModifier && event.key === "ArrowRight") || (event.shiftKey && event.key === "End");
      if (!movesLeft && !movesRight) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      onMoveByKey(action, movesLeft ? -1 : 1);
      // Reordering moves the button's element, which drops its focus.
      requestAnimationFrame(() => button.focus());
    }
    button.addEventListener("dragstart", handleDragStart);
    button.addEventListener("dragend", onDragEnd);
    button.addEventListener("keydown", handleKeyDown);
    return () => {
      onNode(action, null);
      button.draggable = false;
      button.removeEventListener("dragstart", handleDragStart);
      button.removeEventListener("dragend", onDragEnd);
      button.removeEventListener("keydown", handleKeyDown);
    };
  }, [action, buttonRef, handlers]);
}
