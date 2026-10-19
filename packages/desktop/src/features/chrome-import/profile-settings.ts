// extensions/common/mojom/manifest.mojom ManifestLocation::kInternal: installed by the user, from
// the Chrome Web Store or a CRX file. Policy, external, component and unpacked extensions have
// other locations and are not the user's to carry over.
const INTERNAL_LOCATION = 1;
// extensions/common/extension.h InitFromValueFlags, stored as "creation_flags".
const FROM_WEBSTORE_FLAG = 8;
const WAS_INSTALLED_BY_DEFAULT_FLAG = 128;
const WAS_INSTALLED_BY_OEM_FLAG = 1024;
// Profiles from before 2025-08 may still carry "state", where 0 meant turned off.
const DISABLED_STATE = 0;

/** An extension the import can install again from the Chrome Web Store. */
export interface ChromeProfileExtension {
  id: string;
  /** Its folder as Chrome records it: below the profile's Extensions folder for packed installs. */
  path: string | null;
  /** The manifest Chrome keeps in its prefs for packed installs. */
  manifest: Record<string, unknown> | null;
}

/** What the import copies from one Chrome profile's toolbar and extensions. */
export interface ChromeProfileSettings {
  /** Null where the profile kept Chrome's default. */
  showHomeButton: boolean | null;
  homePageIsNewTabPage: boolean | null;
  homePage: string | null;
  showForwardButton: boolean | null;
  /** Chrome's action ids ("kActionDevTools"), in toolbar order. */
  pinnedActions: string[];
  pinnedExtensionIds: string[];
  /** Turned-on extensions the user installed from the Chrome Web Store. */
  webStoreExtensions: ChromeProfileExtension[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readPath(prefs: unknown, dottedName: string): unknown {
  let current: unknown = prefs;
  for (const part of dottedName.split(".")) {
    if (!isRecord(current)) {
      return undefined;
    }
    current = current[part];
  }
  return current;
}

/**
 * A pref from the profile's files, in the order given. Chrome keeps tracked prefs (the home
 * button, the homepage, extension settings) in Secure Preferences on macOS and Windows and the
 * rest in Preferences. A signed-in profile can hold a synced value under `account_values.<pref>`,
 * which Chrome prefers.
 */
function readProfilePref(files: readonly unknown[], dottedName: string): unknown {
  for (const file of files) {
    const accountValue = readPath(file, `account_values.${dottedName}`);
    if (accountValue !== undefined) {
      return accountValue;
    }
    const value = readPath(file, dottedName);
    if (value !== undefined) {
      return value;
    }
  }
  return undefined;
}

function readBoolean(files: readonly unknown[], dottedName: string): boolean | null {
  const value = readProfilePref(files, dottedName);
  return typeof value === "boolean" ? value : null;
}

function readString(files: readonly unknown[], dottedName: string): string | null {
  const value = readProfilePref(files, dottedName);
  return typeof value === "string" ? value : null;
}

function readStrings(files: readonly unknown[], dottedName: string): string[] {
  const value = readProfilePref(files, dottedName);
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string");
}

function isTurnedOn(settings: Record<string, unknown>): boolean {
  const reasons = settings.disable_reasons;
  if (Array.isArray(reasons)) {
    return reasons.length === 0;
  }
  // Older profiles stored the reasons as one bitmask.
  if (typeof reasons === "number") {
    return reasons === 0;
  }
  return settings.state !== DISABLED_STATE;
}

function isUserWebStoreInstall(settings: Record<string, unknown>): boolean {
  const flags = typeof settings.creation_flags === "number" ? settings.creation_flags : 0;
  const isFromWebStore = (flags & FROM_WEBSTORE_FLAG) !== 0 || settings.from_webstore === true;
  const isPreinstalled =
    (flags & (WAS_INSTALLED_BY_DEFAULT_FLAG | WAS_INSTALLED_BY_OEM_FLAG)) !== 0 ||
    settings.was_installed_by_default === true ||
    settings.was_installed_by_oem === true;
  return settings.location === INTERNAL_LOCATION && isFromWebStore && !isPreinstalled;
}

/** Reads a Chrome profile's `Secure Preferences` and `Preferences`. */
export function readChromeProfileSettings(input: {
  preferences: unknown;
  securePreferences: unknown;
}): ChromeProfileSettings {
  const files = [input.securePreferences, input.preferences];
  const extensionSettings = readProfilePref(files, "extensions.settings");
  const webStoreExtensions: ChromeProfileExtension[] = [];
  for (const [id, settings] of Object.entries(
    isRecord(extensionSettings) ? extensionSettings : {},
  )) {
    if (!isRecord(settings) || !isUserWebStoreInstall(settings) || !isTurnedOn(settings)) {
      continue;
    }
    webStoreExtensions.push({
      id,
      path: typeof settings.path === "string" ? settings.path : null,
      manifest: isRecord(settings.manifest) ? settings.manifest : null,
    });
  }
  return {
    showHomeButton: readBoolean(files, "browser.show_home_button"),
    homePageIsNewTabPage: readBoolean(files, "homepage_is_newtabpage"),
    homePage: readString(files, "homepage"),
    showForwardButton: readBoolean(files, "browser.show_forward_button"),
    pinnedActions: readStrings(files, "toolbar.pinned_actions"),
    pinnedExtensionIds: readStrings(files, "extensions.pinned_extensions"),
    webStoreExtensions,
  };
}
