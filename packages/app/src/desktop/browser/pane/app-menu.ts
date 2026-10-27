import type { TFunction } from "i18next";
import { browserPageLabel } from "@/desktop/browser/page-presentation";
import type { BrowserClosedEntry } from "@/desktop/browser/store";
import { PRODUCT_NAME } from "@/constants/product";
import type { ShortcutOs } from "@/utils/format-shortcut";
import type { ChromeMenuEntry } from "../chrome-menu/model";
import type { ChromeAvatarId } from "../profile/avatar-ids";
import { nextZoomFactor, zoomPercent } from "../zoom";

/** Chrome's browser commands (IDC_*) that this browser has: the menu and shortcuts run them. */
export const BROWSER_COMMANDS = [
  "newTab",
  "reopenClosedTab",
  "showDownloads",
  "focusLocation",
  "back",
  "forward",
  "home",
  "importSettings",
  "manageExtensions",
  "visitWebStore",
  "zoomIn",
  "zoomOut",
  "zoomReset",
  "fullscreen",
  "print",
  "savePage",
  "copyLink",
  "createQrCode",
  "find",
  "cut",
  "copy",
  "paste",
  "customizeChrome",
  "showCustomizeChromeSidePanel",
  "showAvatarMenu",
  "taskManager",
  "devTools",
  "clearBrowsingData",
  "showSettings",
] as const;

export type BrowserCommand = (typeof BROWSER_COMMANDS)[number];

export type BrowserAppMenuChoice =
  | { kind: "command"; command: BrowserCommand }
  | { kind: "reopenClosed"; closedIndex: number };

const COMMAND_IDS = new Set<string>(BROWSER_COMMANDS);
const REOPEN_CHOICE_PREFIX = "reopen:";
// Chrome's history submenu lists this many recently closed tabs.
const RECENT_TABS_IN_MENU = 8;
const REOPEN_SHORTCUT = ["mod", "shift", "T"];
// The two rows whose keys differ off macOS (accelerator_table.cc).
const DOWNLOADS_SHORTCUT: Record<ShortcutOs, string[]> = {
  mac: ["alt", "mod", "L"],
  "non-mac": ["ctrl", "J"],
};
const CLEAR_BROWSING_DATA_SHORTCUT: Record<ShortcutOs, string[]> = {
  mac: ["shift", "mod", "Backspace"],
  "non-mac": ["ctrl", "shift", "Delete"],
};
const DEV_TOOLS_SHORTCUT: Record<ShortcutOs, string[]> = {
  mac: ["alt", "mod", "I"],
  "non-mac": ["ctrl", "shift", "I"],
};
// kAppMenuMaximumCharacterLength: how much of the profile's name its row shows.
const PROFILE_NAME_MAX_LENGTH = 30;
const ELLIPSIS = "…";

/**
 * The profile row's label: gfx::TruncateString with CHARACTER_BREAK, which ends a longer name in
 * an ellipsis after the whole characters that fit before it.
 */
export function appMenuProfileName(name: string): string {
  if (name.length <= PROFILE_NAME_MAX_LENGTH) {
    return name;
  }
  let kept = "";
  for (const { segment } of new Intl.Segmenter().segment(name)) {
    if (kept.length + segment.length > PROFILE_NAME_MAX_LENGTH - ELLIPSIS.length) break;
    kept += segment;
  }
  return `${kept}${ELLIPSIS}`;
}

function recentTabsEntries(
  t: TFunction,
  recentlyClosed: readonly BrowserClosedEntry[],
): ChromeMenuEntry[] {
  // With nothing closed Chrome shows the heading as a disabled row that carries ⇧⌘T.
  if (recentlyClosed.length === 0) {
    return [
      {
        kind: "item",
        id: "recentTabs",
        label: t("workspace.browser.appMenu.recentTabs"),
        isEnabled: false,
        shortcut: REOPEN_SHORTCUT,
      },
    ];
  }
  const closedTabEntries = recentlyClosed
    .slice(0, RECENT_TABS_IN_MENU)
    .map<ChromeMenuEntry>((entry, index) => ({
      kind: "item",
      id: `${REOPEN_CHOICE_PREFIX}${index}`,
      // Helm's own pages have no document title; they go by the name their tab shows.
      label: browserPageLabel(entry, t),
      shortcut: index === 0 ? REOPEN_SHORTCUT : undefined,
    }));
  return [{ kind: "title", label: t("workspace.browser.appMenu.recentTabs") }, ...closedTabEntries];
}

/**
 * Chrome's ⋮ menu (AppMenuModel::Build) with the rows this browser has, in Chrome's order and
 * with its icons and macOS shortcuts. Rows for what Helm can't do — signing in to Google, Gemini,
 * Lens, casting, sending to a device — are left out rather than shown dead, and so is 打开新的窗口:
 * a page is a column-3 tab, with no browser window of its own to open another of.
 */
export function buildAppMenuEntries(input: {
  t: TFunction;
  os: ShortcutOs;
  zoomFactor: number;
  recentlyClosed: readonly BrowserClosedEntry[];
  /** The profile's name as it shows (its default name included) and its picked avatar. */
  profile: { name: string; avatarId: ChromeAvatarId | null };
}): ChromeMenuEntry[] {
  const { t, os, zoomFactor, profile } = input;
  const product = { product: PRODUCT_NAME };
  return [
    {
      kind: "item",
      id: "newTab",
      label: t("workspace.browser.appMenu.newTab"),
      icon: "menuNewTab",
      shortcut: ["mod", "T"],
    },
    { kind: "separator" },
    // ProfileSubMenuModel with no Google sign-in and one profile: 关闭此个人资料 would close every
    // window, and the other-profile rows need profiles this browser doesn't have.
    {
      kind: "submenu",
      id: "profile",
      label: appMenuProfileName(profile.name),
      icon: "menuProfile",
      profileRow: { avatarId: profile.avatarId },
      entries: [
        {
          kind: "item",
          id: "customizeChrome",
          label: t("workspace.browser.appMenu.customizeYourChrome", product),
          icon: "menuCustomize",
        },
      ],
    },
    { kind: "spacing" },
    {
      kind: "submenu",
      id: "history",
      label: t("workspace.browser.appMenu.history"),
      icon: "menuHistory",
      entries: recentTabsEntries(t, input.recentlyClosed),
    },
    {
      kind: "item",
      id: "showDownloads",
      label: t("workspace.browser.downloads.name"),
      icon: "menuDownloads",
      shortcut: DOWNLOADS_SHORTCUT[os],
    },
    {
      kind: "submenu",
      id: "bookmarks",
      label: t("workspace.browser.appMenu.bookmarksAndLists"),
      icon: "menuBookmarks",
      entries: [
        {
          kind: "item",
          id: "importSettings",
          label: t("workspace.browser.appMenu.importSettings"),
        },
      ],
    },
    {
      kind: "submenu",
      id: "extensions",
      label: t("workspace.browser.appMenu.extensions"),
      icon: "menuExtensions",
      entries: [
        {
          kind: "item",
          id: "manageExtensions",
          label: t("workspace.browser.appMenu.manageExtensions"),
          icon: "menuExtensions",
        },
        { kind: "item", id: "visitWebStore", label: t("workspace.browser.appMenu.visitWebStore") },
      ],
    },
    {
      kind: "item",
      id: "clearBrowsingData",
      label: t("workspace.browser.appMenu.deleteBrowsingData"),
      icon: "menuDeleteData",
      shortcut: CLEAR_BROWSING_DATA_SHORTCUT[os],
    },
    { kind: "separator" },
    {
      kind: "zoom",
      label: t("workspace.browser.appMenu.zoom"),
      percent: zoomPercent(zoomFactor),
      canZoomOut: nextZoomFactor(zoomFactor, -1) !== zoomFactor,
      canZoomIn: nextZoomFactor(zoomFactor, 1) !== zoomFactor,
      zoomOutId: "zoomOut",
      zoomInId: "zoomIn",
      fullscreenId: "fullscreen",
      zoomOutLabel: t("workspace.browser.appMenu.zoomOut"),
      zoomInLabel: t("workspace.browser.appMenu.zoomIn"),
      fullscreenLabel: t("workspace.browser.appMenu.fullscreen"),
    },
    { kind: "separator" },
    {
      kind: "item",
      id: "print",
      label: t("workspace.browser.appMenu.print"),
      icon: "menuPrint",
      shortcut: ["mod", "P"],
    },
    {
      kind: "submenu",
      id: "findAndEdit",
      label: t("workspace.browser.appMenu.findAndEdit"),
      icon: "menuFind",
      entries: [
        {
          kind: "item",
          id: "find",
          label: t("workspace.browser.appMenu.find"),
          icon: "menuFind",
          shortcut: ["mod", "F"],
        },
        { kind: "separator" },
        {
          kind: "item",
          id: "cut",
          label: t("workspace.browser.appMenu.cut"),
          icon: "menuCut",
          shortcut: ["mod", "X"],
        },
        {
          kind: "item",
          id: "copy",
          label: t("workspace.browser.appMenu.copy"),
          icon: "menuCopy",
          shortcut: ["mod", "C"],
        },
        {
          kind: "item",
          id: "paste",
          label: t("workspace.browser.appMenu.paste"),
          icon: "menuPaste",
          shortcut: ["mod", "V"],
        },
      ],
    },
    // Without casting Chrome names this 保存并分享 and drops its 投放 section.
    {
      kind: "submenu",
      id: "saveAndShare",
      label: t("workspace.browser.appMenu.saveAndShare"),
      icon: "menuSaveAndShare",
      entries: [
        { kind: "title", label: t("workspace.browser.appMenu.save") },
        {
          kind: "item",
          id: "savePage",
          label: t("workspace.browser.appMenu.savePage"),
          icon: "menuSaveAndShare",
          shortcut: ["mod", "S"],
        },
        { kind: "separator" },
        { kind: "title", label: t("workspace.browser.appMenu.share") },
        {
          kind: "item",
          id: "copyLink",
          label: t("workspace.browser.appMenu.copyLink"),
          icon: "menuCopyLink",
        },
        {
          kind: "item",
          id: "createQrCode",
          label: t("workspace.browser.appMenu.createQrCode"),
          icon: "menuQrCode",
        },
      ],
    },
    {
      kind: "submenu",
      id: "moreTools",
      label: t("workspace.browser.appMenu.moreTools"),
      icon: "menuMoreTools",
      entries: [
        {
          kind: "item",
          id: "showCustomizeChromeSidePanel",
          label: t("workspace.browser.customizeChrome.title", product),
          icon: "menuCustomize",
        },
        // Chrome ends the browser-tools block with 任务管理器, just before 开发者工具's separator.
        {
          kind: "item",
          id: "taskManager",
          label: t("workspace.browser.taskManager.menuItem"),
          icon: "menuTaskManager",
        },
        { kind: "separator" },
        {
          kind: "item",
          id: "devTools",
          label: t("workspace.browser.appMenu.devTools"),
          icon: "menuDevTools",
          shortcut: DEV_TOOLS_SHORTCUT[os],
        },
      ],
    },
    { kind: "separator" },
    {
      kind: "item",
      id: "showSettings",
      label: t("workspace.browser.appMenu.settings"),
      icon: "menuSettings",
      // Chrome's ⌘, is a macOS menu-bar key; elsewhere the row carries none.
      shortcut: os === "mac" ? ["mod", ","] : undefined,
    },
  ];
}

/** What choosing a row of the ⋮ menu asks for. */
export function appMenuChoice(id: string): BrowserAppMenuChoice | null {
  if (id.startsWith(REOPEN_CHOICE_PREFIX)) {
    return { kind: "reopenClosed", closedIndex: Number(id.slice(REOPEN_CHOICE_PREFIX.length)) };
  }
  if (COMMAND_IDS.has(id)) {
    return { kind: "command", command: id as BrowserCommand };
  }
  return null;
}
