import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useBrowserStore } from "@/desktop/browser/store";
import { getShortcutOs } from "@/utils/shortcut-platform";
import { ChromeMenu } from "../chrome-menu/chrome-menu.electron";
import { appMenuChoice, buildAppMenuEntries, type BrowserAppMenuChoice } from "./app-menu";

/** Chrome's ⋮ menu for one page, hanging from its button. */
export function BrowserAppMenu({
  anchor,
  zoomFactor,
  onChoice,
  onClose,
}: {
  anchor: HTMLElement | null;
  zoomFactor: number;
  /** Return true to keep the menu open, as the zoom buttons do. */
  onChoice: (choice: BrowserAppMenuChoice) => boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const recentlyClosed = useBrowserStore((state) => state.closedBrowsers);
  const entries = useMemo(
    () => buildAppMenuEntries({ t, os: getShortcutOs(), zoomFactor, recentlyClosed }),
    [recentlyClosed, t, zoomFactor],
  );
  const handleSelect = useCallback(
    (id: string) => {
      const choice = appMenuChoice(id);
      return choice ? onChoice(choice) : false;
    },
    [onChoice],
  );
  return (
    <ChromeMenu
      anchor={anchor}
      entries={entries}
      onSelect={handleSelect}
      onClose={onClose}
      testID="browser-app-menu-popup"
    />
  );
}
