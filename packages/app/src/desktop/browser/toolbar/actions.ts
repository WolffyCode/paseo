import type { TFunction } from "i18next";
import { getDesktopHost } from "@/desktop/host";
import type { ChromeIconName } from "../chrome-icons";
import type { BrowserPinnableAction } from "./settings";

/** The 工具栏 page's groups (customize_toolbar.mojom CategoryId) that hold actions. */
export type PinnableActionCategory = "yourChrome" | "toolsAndActions";

interface PinnableActionPresentation {
  category: PinnableActionCategory;
  /** Chrome's name for the action: the 工具栏 page row, and the pinned button's tooltip. */
  labelKey:
    | "workspace.browser.downloads.name"
    | "workspace.browser.toolbarActions.print"
    | "workspace.browser.toolbarActions.copyLink"
    | "workspace.browser.toolbarActions.devTools";
  /** The toolbar icon, drawn at 20 dip. */
  icon: ChromeIconName;
  /** The icon Chrome draws at 16 px on the 工具栏 page: the action's smallest rep. */
  smallIcon: ChromeIconName;
}

export const PINNABLE_ACTION_PRESENTATION: Record<
  BrowserPinnableAction,
  PinnableActionPresentation
> = {
  kActionShowDownloads: {
    category: "yourChrome",
    labelKey: "workspace.browser.downloads.name",
    icon: "download",
    smallIcon: "download",
  },
  kActionPrint: {
    category: "toolsAndActions",
    labelKey: "workspace.browser.toolbarActions.print",
    icon: "print",
    smallIcon: "print",
  },
  kActionCopyUrl: {
    category: "toolsAndActions",
    labelKey: "workspace.browser.toolbarActions.copyLink",
    icon: "copyLink",
    smallIcon: "copyLinkSmall",
  },
  kActionDevTools: {
    category: "toolsAndActions",
    labelKey: "workspace.browser.toolbarActions.devTools",
    icon: "devTools",
    smallIcon: "devTools",
  },
};

export type PinMenuChoice = "pin" | "unpin" | "customizeToolbar";

const PIN_MENU_CHOICES = new Set<string>(["pin", "unpin", "customizeToolbar"]);

function isPinMenuChoice(value: string): value is PinMenuChoice {
  return PIN_MENU_CHOICES.has(value);
}

/**
 * The menu Chrome shows on a right-click of a pinned button, 首页 or a popped-out button
 * (PinnedActionToolbarButtonMenuModel): 固定 or 取消固定, then 自定义工具栏.
 */
export async function chooseFromPinMenu(input: {
  t: TFunction;
  isPinned: boolean;
  /** Chrome offers 固定 disabled for a button that can't be pinned, as 自定义 Chrome. */
  isPinnable: boolean;
  anchor: { x: number; y: number };
}): Promise<PinMenuChoice | null> {
  const popup = getDesktopHost()?.menu?.popup;
  if (!popup) {
    return null;
  }
  const { t } = input;
  const pinItem = input.isPinned
    ? { id: "unpin", label: t("workspace.browser.toolbarActions.unpin") }
    : { id: "pin", label: t("workspace.browser.toolbarActions.pin") };
  const chosen = await popup({
    x: input.anchor.x,
    y: input.anchor.y,
    items: [
      { ...pinItem, isEnabled: input.isPinnable },
      {
        id: "customizeToolbar",
        label: t("workspace.browser.toolbarActions.customizeToolbar"),
      },
    ],
  });
  if (chosen === null || !isPinMenuChoice(chosen)) {
    return null;
  }
  return chosen;
}
