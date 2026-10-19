/**
 * chrome://settings as this browser has it (chrome/browser/resources/settings/route.ts): each
 * section of the left menu is its own route, a subpage route shows in place of its section, and a
 * dialog route opens over its section.
 */

export const SETTINGS_SECTIONS = [
  "people",
  "privacy",
  "appearance",
  "search",
  "downloads",
  "reset",
  "about",
] as const;

export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];

const SECTION_ROUTES: Record<SettingsSection, string> = {
  people: "/people",
  privacy: "/privacy",
  appearance: "/appearance",
  search: "/search",
  downloads: "/downloads",
  reset: "/reset",
  about: "/help",
};

export const SETTINGS_SUBPAGES = ["manageProfile"] as const;

export type SettingsSubpage = (typeof SETTINGS_SUBPAGES)[number];

const SUBPAGE_ROUTES: Record<SettingsSubpage, { route: string; section: SettingsSection }> = {
  manageProfile: { route: "/manageProfile", section: "people" },
};

export const SETTINGS_DIALOGS = ["clearBrowserData", "resetProfileSettings", "importData"] as const;

export type SettingsDialog = (typeof SETTINGS_DIALOGS)[number];

const DIALOG_ROUTES: Record<SettingsDialog, { route: string; section: SettingsSection }> = {
  clearBrowserData: { route: "/clearBrowserData", section: "privacy" },
  resetProfileSettings: { route: "/resetProfileSettings", section: "reset" },
  importData: { route: "/importData", section: "people" },
};

/** Opens 删除浏览数据 over the 隐私与安全 page. */
export const CLEAR_BROWSER_DATA_ROUTE = DIALOG_ROUTES.clearBrowserData.route;

/** Opens 导入书签和设置 over the 我与 Google page. */
export const IMPORT_DATA_ROUTE = DIALOG_ROUTES.importData.route;

/** The sections listed in the menu's groups; 关于 sits apart, after the extensions link. */
export type SettingsMenuSection = Exclude<SettingsSection, "about">;

/**
 * The left menu in Chrome's groups: the basic sections, then the advanced ones. Sections this
 * browser lacks are left out of their group.
 */
export const SETTINGS_MENU_GROUPS: readonly (readonly SettingsMenuSection[])[] = [
  ["people", "privacy", "appearance", "search"],
  ["downloads", "reset"],
];

/** The sections a settings search looks through: every one in the menu, in its order. */
export const SEARCHABLE_SECTIONS: readonly SettingsMenuSection[] = SETTINGS_MENU_GROUPS.flat();

export function settingsSectionRoute(section: SettingsSection): string {
  return SECTION_ROUTES[section];
}

export function settingsSubpageRoute(subpage: SettingsSubpage): string {
  return SUBPAGE_ROUTES[subpage].route;
}

export function settingsDialogRoute(dialog: SettingsDialog): string {
  return DIALOG_ROUTES[dialog].route;
}

export interface ResolvedSettingsRoute {
  section: SettingsSection;
  subpage: SettingsSubpage | null;
  dialog: SettingsDialog | null;
  /** The settings page itself (Chrome's basic route), not a section or dialog of it. */
  isBasicPage: boolean;
}

// The settings page itself, and any route this browser doesn't have, show the first section, as
// Chrome redirects an unknown route to its basic page.
const FIRST_SECTION: SettingsSection = SETTINGS_SECTIONS[0];

/** The section a route shows and the dialog open over it. */
export function resolveSettingsRoute(route: string): ResolvedSettingsRoute {
  const section = SETTINGS_SECTIONS.find((candidate) => SECTION_ROUTES[candidate] === route);
  if (section) {
    return { section, subpage: null, dialog: null, isBasicPage: false };
  }
  const subpage = SETTINGS_SUBPAGES.find((candidate) => SUBPAGE_ROUTES[candidate].route === route);
  if (subpage) {
    return { section: SUBPAGE_ROUTES[subpage].section, subpage, dialog: null, isBasicPage: false };
  }
  const dialog = SETTINGS_DIALOGS.find((candidate) => DIALOG_ROUTES[candidate].route === route);
  if (dialog) {
    return { section: DIALOG_ROUTES[dialog].section, subpage: null, dialog, isBasicPage: false };
  }
  return { section: FIRST_SECTION, subpage: null, dialog: null, isBasicPage: true };
}
