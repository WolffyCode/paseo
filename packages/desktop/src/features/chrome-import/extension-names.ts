import { readdir } from "node:fs/promises";
import path from "node:path";
import log from "electron-log/main";
import type { ChromeProfileExtension } from "./profile-settings.js";
import { readJsonFile } from "./read-json.js";

// extensions/common/message_bundle.cc: "__MSG_appName__" names a message in _locales.
const MESSAGE_REFERENCE = /^__MSG_(\w+)__$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The installed version folder: the one Chrome recorded (relative to the Extensions folder for
 * packed installs, absolute otherwise), else the last one on disk.
 */
async function extensionFolder(
  extensionsDirectory: string,
  extension: ChromeProfileExtension,
): Promise<string | null> {
  if (extension.path) {
    return path.resolve(extensionsDirectory, extension.path);
  }
  let versions: string[];
  try {
    versions = await readdir(path.join(extensionsDirectory, extension.id));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      log.warn("[chrome-import] unreadable extension folder", { id: extension.id, error });
    }
    return null;
  }
  const latestVersion = versions
    .filter((version) => !version.startsWith("."))
    .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }))
    .at(-1);
  return latestVersion ? path.join(extensionsDirectory, extension.id, latestVersion) : null;
}

/** Chrome's locale fallback for messages: the UI locale, its language, then the default. */
function messageLocales(uiLocale: string, defaultLocale: unknown): string[] {
  const chromeLocale = uiLocale.replace("-", "_");
  const language = chromeLocale.split("_")[0] ?? chromeLocale;
  const locales = [chromeLocale, language];
  if (typeof defaultLocale === "string") {
    locales.push(defaultLocale);
  }
  return locales;
}

async function resolveMessage(input: {
  folder: string;
  messageName: string;
  uiLocale: string;
  defaultLocale: unknown;
}): Promise<string | null> {
  // Message names are case-insensitive.
  const wanted = input.messageName.toLowerCase();
  for (const locale of messageLocales(input.uiLocale, input.defaultLocale)) {
    const messages = await readJsonFile(
      path.join(input.folder, "_locales", locale, "messages.json"),
    );
    if (!isRecord(messages)) {
      continue;
    }
    for (const [name, entry] of Object.entries(messages)) {
      if (name.toLowerCase() === wanted && isRecord(entry) && typeof entry.message === "string") {
        return entry.message;
      }
    }
  }
  return null;
}

/** An installed Chrome extension's name in the given UI locale, as Chrome shows it. */
export async function readChromeExtensionName(input: {
  extensionsDirectory: string;
  extension: ChromeProfileExtension;
  uiLocale: string;
}): Promise<string | null> {
  const folder = await extensionFolder(input.extensionsDirectory, input.extension);
  if (!folder) {
    return null;
  }
  // Chrome keeps packed installs' manifests in its prefs; the files have it too.
  const manifest =
    input.extension.manifest ?? (await readJsonFile(path.join(folder, "manifest.json")));
  if (!isRecord(manifest) || typeof manifest.name !== "string") {
    return null;
  }
  const messageName = MESSAGE_REFERENCE.exec(manifest.name)?.[1];
  if (!messageName) {
    return manifest.name;
  }
  return resolveMessage({
    folder,
    messageName,
    uiLocale: input.uiLocale,
    defaultLocale: manifest.default_locale,
  });
}
