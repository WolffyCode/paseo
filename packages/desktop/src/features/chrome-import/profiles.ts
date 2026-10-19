import path from "node:path";

/** One Chrome profile the import dialog offers, by its folder inside Chrome's user data. */
export interface ChromeProfile {
  directory: string;
  name: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Where Google Chrome keeps its user data (chrome/common/chrome_paths_*). */
export function chromeUserDataDirectory(input: {
  platform: NodeJS.Platform;
  homeDirectory: string;
  localAppData: string | undefined;
}): string | null {
  if (input.platform === "darwin") {
    return path.join(input.homeDirectory, "Library", "Application Support", "Google", "Chrome");
  }
  if (input.platform === "win32") {
    return input.localAppData
      ? path.join(input.localAppData, "Google", "Chrome", "User Data")
      : null;
  }
  if (input.platform === "linux") {
    return path.join(input.homeDirectory, ".config", "google-chrome");
  }
  return null;
}

// chrome/common/chrome_constants.h: folders that hold no user's profile.
const NON_USER_PROFILE_DIRECTORIES = new Set(["Guest Profile", "System Profile"]);
// Chrome writes `profile.last_used` only once a second profile has been used.
const DEFAULT_PROFILE_DIRECTORY = "Default";

function readText(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  return typeof value === "string" ? value : "";
}

/**
 * The name Chrome's profile picker shows (profile_attributes_entry.cc): the account's name, the
 * local name when there is no account, and both when the user renamed the profile.
 */
function profileDisplayName(directory: string, info: unknown): string {
  if (!isRecord(info)) {
    return directory;
  }
  const accountName = readText(info, "gaia_given_name") || readText(info, "gaia_name");
  const localName = readText(info, "enterprise_label") || readText(info, "name") || directory;
  if (!accountName) {
    return localName;
  }
  if (accountName.toLowerCase() === localName.toLowerCase()) {
    return accountName;
  }
  const hasOwnLocalName =
    info.is_using_default_name === false || readText(info, "enterprise_label") !== "";
  return hasOwnLocalName ? `${accountName} (${localName})` : accountName;
}

/**
 * The profiles listed in Chrome's `Local State` (`profile.info_cache`), in Chrome's own order
 * (`profile.profiles_order`) with the last used one first, as Chrome's profile picker opens on it.
 */
export function readChromeProfiles(localState: unknown): ChromeProfile[] {
  if (!isRecord(localState) || !isRecord(localState.profile)) {
    return [];
  }
  const {
    info_cache: infoCache,
    profiles_order: profilesOrder,
    last_used: lastUsed,
  } = localState.profile;
  if (!isRecord(infoCache)) {
    return [];
  }
  const profiles: ChromeProfile[] = [];
  for (const [directory, info] of Object.entries(infoCache)) {
    if (!NON_USER_PROFILE_DIRECTORIES.has(directory)) {
      profiles.push({ directory, name: profileDisplayName(directory, info) });
    }
  }
  const lastUsedDirectory = typeof lastUsed === "string" ? lastUsed : DEFAULT_PROFILE_DIRECTORY;
  const order = Array.isArray(profilesOrder) ? profilesOrder : [];
  const positionOf = (directory: string): number => {
    if (directory === lastUsedDirectory) {
      return -1;
    }
    const position = order.indexOf(directory);
    return position < 0 ? order.length : position;
  };
  return profiles.sort((left, right) => positionOf(left.directory) - positionOf(right.directory));
}
