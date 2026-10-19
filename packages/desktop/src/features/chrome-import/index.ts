import os from "node:os";
import path from "node:path";
import { ipcMain } from "electron";
import { readChromeExtensionName } from "./extension-names.js";
import { readChromeProfileSettings } from "./profile-settings.js";
import { chromeUserDataDirectory, readChromeProfiles, type ChromeProfile } from "./profiles.js";
import { readJsonFile } from "./read-json.js";

/** What the import dialog copies from one Chrome profile. */
export interface ChromeImportData {
  /** Null where the profile kept Chrome's default. */
  showHomeButton: boolean | null;
  homePageIsNewTabPage: boolean | null;
  homePage: string | null;
  showForwardButton: boolean | null;
  /** Chrome's action ids ("kActionDevTools"), in pin order. */
  pinnedActions: string[];
  pinnedExtensionIds: string[];
  /** Turned-on Chrome Web Store extensions, named as Chrome shows them in the UI locale. */
  extensions: Array<{ id: string; name: string | null }>;
}

function chromeUserData(): string | null {
  return chromeUserDataDirectory({
    platform: process.platform,
    homeDirectory: os.homedir(),
    localAppData: process.env.LOCALAPPDATA,
  });
}

async function listChromeProfiles(): Promise<ChromeProfile[]> {
  const userData = chromeUserData();
  if (!userData) {
    return [];
  }
  return readChromeProfiles(await readJsonFile(path.join(userData, "Local State")));
}

async function readChromeProfile(
  rawDirectory: unknown,
  rawUiLocale: unknown,
): Promise<ChromeImportData | null> {
  const userData = chromeUserData();
  if (!userData || typeof rawDirectory !== "string" || typeof rawUiLocale !== "string") {
    return null;
  }
  // Only a profile Chrome itself lists, so the reader never leaves Chrome's profile folders.
  const profiles = await listChromeProfiles();
  if (!profiles.some((profile) => profile.directory === rawDirectory)) {
    return null;
  }
  const profileDirectory = path.join(userData, rawDirectory);
  const [preferences, securePreferences] = await Promise.all([
    readJsonFile(path.join(profileDirectory, "Preferences")),
    readJsonFile(path.join(profileDirectory, "Secure Preferences")),
  ]);
  const settings = readChromeProfileSettings({ preferences, securePreferences });
  const extensionsDirectory = path.join(profileDirectory, "Extensions");
  const extensions = await Promise.all(
    settings.webStoreExtensions.map(async (extension) => ({
      id: extension.id,
      name: await readChromeExtensionName({
        extensionsDirectory,
        extension,
        uiLocale: rawUiLocale,
      }),
    })),
  );
  return {
    showHomeButton: settings.showHomeButton,
    homePageIsNewTabPage: settings.homePageIsNewTabPage,
    homePage: settings.homePage,
    showForwardButton: settings.showForwardButton,
    pinnedActions: settings.pinnedActions,
    pinnedExtensionIds: settings.pinnedExtensionIds,
    extensions,
  };
}

/**
 * Chrome's files are read only from these handlers: the profile list when the user opens the
 * import dialog, and one profile when they press Import.
 */
export function registerChromeImportIpc(): void {
  ipcMain.handle("paseo:browser:chrome-import:profiles", () => listChromeProfiles());
  ipcMain.handle(
    "paseo:browser:chrome-import:read",
    (_event, directory: unknown, uiLocale: unknown) => readChromeProfile(directory, uiLocale),
  );
}
