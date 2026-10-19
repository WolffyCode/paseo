import type { BrowserRecordPatch } from "@/desktop/browser/store";

/** Helm's own pages, drawn in React inside a tab the way Chrome draws its chrome:// pages. */
export type BrowserInternalPage = "extensions" | "downloads" | "settings";

const INTERNAL_PROTOCOL = "paseo:";
const INTERNAL_PAGES = new Set<string>(["extensions", "downloads", "settings"]);

/** Chrome's chrome://downloads. */
export const BROWSER_DOWNLOADS_URL = "paseo://downloads";

/** Chrome's chrome://settings; its sections are paths, as /privacy or /clearBrowserData. */
export const BROWSER_SETTINGS_URL = "paseo://settings";

export function settingsUrl(route: string): string {
  return `${BROWSER_SETTINGS_URL}${route}`;
}

/** The settings route an address shows: its path, "/" for the settings page itself. */
export function settingsRoute(url: string): string {
  try {
    return new URL(url).pathname || "/";
  } catch {
    // An address that doesn't parse shows the settings page itself.
    return "/";
  }
}

/** Chrome's chrome://extensions; `?id=<extension>` opens that extension's details. */
export const BROWSER_EXTENSIONS_URL = "paseo://extensions";
const EXTENSION_ID_PARAM = "id";

export function extensionDetailsUrl(extensionId: string): string {
  return `${BROWSER_EXTENSIONS_URL}?${EXTENSION_ID_PARAM}=${extensionId}`;
}

/** The extension whose details an extensions page address shows, or null for the list. */
export function extensionDetailsId(url: string): string | null {
  try {
    return new URL(url).searchParams.get(EXTENSION_ID_PARAM);
  } catch {
    // An address that doesn't parse shows no extension.
    return null;
  }
}

/** The internal page an address shows, or null for an ordinary web page. */
export function browserInternalPage(url: string): BrowserInternalPage | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    // An address that doesn't parse is not one of Helm's pages.
    return null;
  }
  if (parsed.protocol !== INTERNAL_PROTOCOL || !INTERNAL_PAGES.has(parsed.hostname)) {
    return null;
  }
  return parsed.hostname as BrowserInternalPage;
}

/**
 * What a tab records when it shows one of Helm's own pages: nothing loads, and the guest's
 * history went with the guest.
 */
export function internalPageRecord(url: string) {
  return {
    url,
    isLoading: false,
    canGoBack: false,
    canGoForward: false,
    title: "",
    faviconUrl: null,
    lastError: null,
  } satisfies BrowserRecordPatch;
}
