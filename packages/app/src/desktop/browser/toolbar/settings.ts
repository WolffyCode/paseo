import AsyncStorage from "@react-native-async-storage/async-storage";
import { z } from "zod";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { createValidatedPersistStorage } from "@/storage/validated-persist-storage";

/**
 * Chrome's toolbar actions a user can pin (Customize Chrome → 工具栏) that this browser can run,
 * in the page's order. They go by Chrome's own action ids, the strings its
 * `toolbar.pinned_actions` pref stores: an import copies a profile's pins as they are, and a pin
 * this browser can't show yet is kept for when it can.
 */
export const BROWSER_PINNABLE_ACTIONS = [
  "kActionShowDownloads",
  "kActionPrint",
  "kActionCopyUrl",
  "kActionDevTools",
] as const;
export type BrowserPinnableAction = (typeof BROWSER_PINNABLE_ACTIONS)[number];

const PINNABLE_ACTIONS = new Set<string>(BROWSER_PINNABLE_ACTIONS);

export function isBrowserPinnableAction(value: string): value is BrowserPinnableAction {
  return PINNABLE_ACTIONS.has(value);
}

const BrowserHomePageSchema = z.object({
  isNewTabPage: z.boolean(),
  url: z.string(),
});

const BrowserToolbarSettingsSchema = z.object({
  showHomeButton: z.boolean(),
  showForwardButton: z.boolean(),
  // Plain strings: a pin this build can't show stays, and must not make the record invalid.
  pinnedActions: z.array(z.string()),
  homePage: BrowserHomePageSchema,
});

type BrowserToolbarSettings = z.infer<typeof BrowserToolbarSettingsSchema>;

// A fresh Chrome profile: no home button, a forward button, nothing pinned, 首页 opens the new tab
// page.
const DEFAULT_TOOLBAR_SETTINGS: BrowserToolbarSettings = {
  showHomeButton: false,
  showForwardButton: true,
  pinnedActions: [],
  homePage: { isNewTabPage: true, url: "" },
};

/** A Chrome profile's toolbar prefs, null where the profile never changed them. */
export interface ChromeToolbarSettings {
  showHomeButton: boolean | null;
  homePageIsNewTabPage: boolean | null;
  homePage: string | null;
  showForwardButton: boolean | null;
  pinnedActions: string[];
}

interface BrowserToolbarSettingsState extends BrowserToolbarSettings {
  setShowHomeButton: (isShown: boolean) => void;
  setShowForwardButton: (isShown: boolean) => void;
  /** Pinning adds the button at the end, as Chrome's pinned actions model does. */
  setActionPinned: (action: BrowserPinnableAction, isPinned: boolean) => void;
  /** Moves a pinned button to `toIndex` among the pinned buttons this browser shows. */
  movePinnedAction: (action: BrowserPinnableAction, toIndex: number) => void;
  /** Takes over a Chrome profile's toolbar; a pref it never set keeps Chrome's default. */
  takeOverChromeToolbar: (toolbar: ChromeToolbarSettings) => void;
  /** Chrome's 重置为默认值: the buttons go back to a fresh profile's, the homepage stays. */
  resetToDefaults: () => void;
}

/** Which optional buttons the browser toolbar shows and where 首页 goes (Chrome's prefs). */
export const useBrowserToolbarSettingsStore = create<BrowserToolbarSettingsState>()(
  persist(
    (set) => ({
      ...DEFAULT_TOOLBAR_SETTINGS,
      setShowHomeButton: (isShown) => set({ showHomeButton: isShown }),
      setShowForwardButton: (isShown) => set({ showForwardButton: isShown }),
      setActionPinned: (action, isPinned) => {
        set((state) => {
          const others = state.pinnedActions.filter((pinned) => pinned !== action);
          return { pinnedActions: isPinned ? [...others, action] : others };
        });
      },
      movePinnedAction: (action, toIndex) => {
        set((state) => ({
          pinnedActions: pinnedActionsAfterMove(state.pinnedActions, action, toIndex),
        }));
      },
      takeOverChromeToolbar: (toolbar) => {
        const homePageUrl = toolbar.homePage ?? DEFAULT_TOOLBAR_SETTINGS.homePage.url;
        const isHomePageNewTabPage =
          toolbar.homePageIsNewTabPage ?? DEFAULT_TOOLBAR_SETTINGS.homePage.isNewTabPage;
        set({
          showHomeButton: toolbar.showHomeButton ?? DEFAULT_TOOLBAR_SETTINGS.showHomeButton,
          showForwardButton:
            toolbar.showForwardButton ?? DEFAULT_TOOLBAR_SETTINGS.showForwardButton,
          // Chrome keys pinned buttons by action, so a repeated id is one button.
          pinnedActions: [...new Set(toolbar.pinnedActions)],
          homePage: { isNewTabPage: isHomePageNewTabPage, url: homePageUrl },
        });
      },
      resetToDefaults: () => {
        set({
          showHomeButton: DEFAULT_TOOLBAR_SETTINGS.showHomeButton,
          showForwardButton: DEFAULT_TOOLBAR_SETTINGS.showForwardButton,
          pinnedActions: DEFAULT_TOOLBAR_SETTINGS.pinnedActions,
        });
      },
    }),
    {
      name: "browser-toolbar-settings",
      storage: createValidatedPersistStorage(AsyncStorage, BrowserToolbarSettingsSchema),
      partialize: (state) => ({
        showHomeButton: state.showHomeButton,
        showForwardButton: state.showForwardButton,
        pinnedActions: state.pinnedActions,
        homePage: state.homePage,
      }),
    },
  ),
);

/**
 * The address 首页 opens, or null for the new tab page. Chrome's Profile::GetHomePage falls back
 * to the new tab page when the address is empty.
 */
export function homePageAddress(homePage: BrowserToolbarSettings["homePage"]): string | null {
  const address = homePage.url.trim();
  if (homePage.isNewTabPage || address === "") {
    return null;
  }
  return address;
}

/** The pinned buttons this browser can show, in pin order. */
export function knownPinnedActions(pinnedActions: readonly string[]): BrowserPinnableAction[] {
  return pinnedActions.filter(isBrowserPinnableAction);
}

/**
 * The pinned list after dragging `action` to `toIndex` among the buttons this browser shows. Pins
 * it can't show keep their slots in the stored list.
 */
export function pinnedActionsAfterMove(
  pinnedActions: readonly string[],
  action: BrowserPinnableAction,
  toIndex: number,
): string[] {
  if (!pinnedActions.includes(action)) {
    return [...pinnedActions];
  }
  const shownActions = knownPinnedActions(pinnedActions).filter((pinned) => pinned !== action);
  const clampedIndex = Math.max(0, Math.min(toIndex, shownActions.length));
  shownActions.splice(clampedIndex, 0, action);
  let nextShownIndex = 0;
  return pinnedActions.map((pinned) => {
    if (!isBrowserPinnableAction(pinned)) {
      return pinned;
    }
    const movedAction = shownActions[nextShownIndex];
    nextShownIndex += 1;
    return movedAction;
  });
}

/**
 * Whether the toolbar is a fresh profile's, which disables 重置为默认值. Only the pins this browser
 * shows count: Chrome's default list holds Chrome Labs, which no Stable toolbar shows either.
 */
export function isDefaultToolbar(settings: {
  showHomeButton: boolean;
  showForwardButton: boolean;
  pinnedActions: readonly string[];
}): boolean {
  return (
    settings.showHomeButton === DEFAULT_TOOLBAR_SETTINGS.showHomeButton &&
    settings.showForwardButton === DEFAULT_TOOLBAR_SETTINGS.showForwardButton &&
    knownPinnedActions(settings.pinnedActions).length === 0
  );
}
