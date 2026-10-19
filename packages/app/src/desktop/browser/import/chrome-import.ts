import {
  getDesktopHost,
  type DesktopChromeImportData,
  type DesktopChromeProfile,
} from "@/desktop/host";
import { useBrowserExtensionPinsStore } from "@/desktop/browser/extensions/store";
import { useBrowserToolbarSettingsStore } from "@/desktop/browser/toolbar/settings";

/** What the user ticked in the import dialog. */
export interface ChromeImportChoices {
  extensions: boolean;
  toolbar: boolean;
}

export interface ChromeImportOutcome {
  /** Extensions the Chrome Web Store could not install, by the name Chrome shows. */
  failedExtensionNames: string[];
}

/** The user's Chrome profiles; read when they open the import dialog. */
export async function listChromeProfiles(): Promise<DesktopChromeProfile[]> {
  const chromeImport = getDesktopHost()?.browser?.chromeImport;
  return chromeImport ? chromeImport.listProfiles() : [];
}

/**
 * Installs the profile's Web Store extensions one after another, then pins the ones Chrome had
 * pinned, in Chrome's order.
 */
async function installExtensions(data: DesktopChromeImportData): Promise<string[]> {
  const extensionsBridge = getDesktopHost()?.browser?.extensions;
  const installedIds = new Set<string>();
  const failedNames: string[] = [];
  for (const extension of data.extensions) {
    const outcome = extensionsBridge ? await extensionsBridge.install(extension.id) : "failed";
    if (outcome === "failed") {
      failedNames.push(extension.name ?? extension.id);
    } else {
      installedIds.add(extension.id);
    }
  }
  const { setPinned } = useBrowserExtensionPinsStore.getState();
  for (const extensionId of data.pinnedExtensionIds) {
    if (installedIds.has(extensionId)) {
      setPinned(extensionId, true);
    }
  }
  return failedNames;
}

/** Copies what the user picked from one Chrome profile, read only now that they pressed Import. */
export async function importFromChrome(input: {
  directory: string;
  uiLocale: string;
  choices: ChromeImportChoices;
}): Promise<ChromeImportOutcome> {
  const data = await getDesktopHost()?.browser?.chromeImport?.read(input.directory, input.uiLocale);
  if (!data) {
    throw new Error(`Chrome profile ${input.directory} could not be read`);
  }
  if (input.choices.toolbar) {
    useBrowserToolbarSettingsStore.getState().takeOverChromeToolbar(data);
  }
  const failedExtensionNames = input.choices.extensions ? await installExtensions(data) : [];
  return { failedExtensionNames };
}
