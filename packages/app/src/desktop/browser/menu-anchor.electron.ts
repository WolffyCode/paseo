import type { View } from "react-native";

/** Where Chrome opens a toolbar button's menu: its top-left at the button's bottom-left. */
export function menuAnchorBelow(button: View | null): { x: number; y: number } {
  // On web a View's ref is its DOM element.
  const rect = (button as unknown as HTMLElement | null)?.getBoundingClientRect();
  return { x: Math.round(rect?.left ?? 0), y: Math.round(rect?.bottom ?? 0) };
}
