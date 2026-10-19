import { useEffect, type ComponentType, type ReactElement, type RefObject } from "react";
import type { View } from "react-native";
import { withUnistyles } from "react-native-unistyles";
import { Shortcut } from "@/components/ui/shortcut";
import { isWeb } from "@/constants/platform";
import { useShortcutKeys } from "@/hooks/use-shortcut-keys";
import type { PanelIconProps } from "@/panels/panel-registry";
import { ICON_SIZE } from "@/styles/theme";

/** Every launcher row leads with the same glyph box so labels share one rail. */
export const LAUNCHER_ICON_SIZE = ICON_SIZE.md;

/** Marks a pressable as a launcher row, so arrow keys can reach it. */
export const LAUNCHER_ROW_DATA_SET = { newTabLauncherRow: "true" };
const LAUNCHER_ROW_SELECTOR = '[data-new-tab-launcher-row="true"]';

function LauncherIcon({
  Icon,
  color = "",
}: {
  Icon: ComponentType<PanelIconProps>;
  color?: string;
}) {
  return <Icon size={LAUNCHER_ICON_SIZE} color={color} />;
}

export const ThemedLauncherIcon = withUnistyles(LauncherIcon);

export function LauncherShortcut({ actionId }: { actionId: string }): ReactElement | null {
  const keys = useShortcutKeys(actionId);
  return keys ? <Shortcut chord={keys} /> : null;
}

/**
 * On web, arrow keys move between rows and Enter presses one. A launcher preselects its first
 * row. Without `preselectFirstRow` the container takes focus instead, so no row looks selected
 * until an arrow key picks one; the container must then be focusable.
 */
export function useLauncherRowNavigation(input: {
  containerRef: RefObject<View | null>;
  isInteractive: boolean;
  focusPane: () => void;
  preselectFirstRow: boolean;
}): void {
  const { containerRef, isInteractive, focusPane, preselectFirstRow } = input;

  useEffect(() => {
    if (!isWeb || !isInteractive) return;
    const container: unknown = containerRef.current;
    if (!(container instanceof HTMLElement)) return;
    const webContainer = container as HTMLElement;

    function rows() {
      return Array.from(webContainer.querySelectorAll(LAUNCHER_ROW_SELECTOR)) as HTMLElement[];
    }
    function focusEntry() {
      if (preselectFirstRow) {
        rows()[0]?.focus({ preventScroll: true });
        return;
      }
      webContainer.focus({ preventScroll: true });
    }
    function handlePointerDown(event: PointerEvent) {
      focusPane();
      if (!(event.target instanceof Element) || !event.target.closest(LAUNCHER_ROW_SELECTOR)) {
        requestAnimationFrame(focusEntry);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      const availableRows = rows();
      const currentIndex = availableRows.findIndex((row) => row === document.activeElement);
      let direction = 0;
      if (event.key === "ArrowDown") {
        direction = 1;
      } else if (event.key === "ArrowUp") {
        direction = -1;
      }
      if (direction !== 0 && availableRows.length > 0) {
        event.preventDefault();
        let start = currentIndex;
        if (currentIndex < 0) {
          start = direction > 0 ? -1 : 0;
        }
        const nextIndex = (start + direction + availableRows.length) % availableRows.length;
        availableRows[nextIndex]?.focus();
      }
      if (event.key === "Enter" && currentIndex >= 0) {
        event.preventDefault();
        availableRows[currentIndex]?.click();
      }
    }

    webContainer.addEventListener("pointerdown", handlePointerDown, true);
    webContainer.addEventListener("keydown", handleKeyDown);
    focusEntry();
    return () => {
      webContainer.removeEventListener("pointerdown", handlePointerDown, true);
      webContainer.removeEventListener("keydown", handleKeyDown);
    };
  }, [containerRef, focusPane, isInteractive, preselectFirstRow]);
}
