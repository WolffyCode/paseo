import { BROWSER_START_URL, isBrowserStartUrl } from "./start-page";
import { normalizeWorkspaceBrowserUrl } from "./store";

/** Chrome's default search engine, by the name the omnibox shows. */
export const SEARCH_ENGINE_NAME = "Google";
// The engine's search page and the parameters Chrome adds to an omnibox search.
const GOOGLE_SEARCH_URL = "https://www.google.com/search";
const SCHEMES_THE_OMNIBOX_OPENS = new Set([
  "http:",
  "https:",
  "file:",
  "about:",
  "data:",
  "blob:",
  "view-source:",
  "chrome-extension:",
  "paseo:",
]);
const SCHEME_PREFIX = /^([a-z][a-z\d+.-]*:)/i;
const LOCAL_OR_IP_HOST = /^(localhost|\d{1,3}(?:\.\d{1,3}){3}|\[[\da-f:.]+\])(?::\d+)?(?:[/?#]|$)/i;
// A host with a dot and a letters-only top-level label, optionally with a port; IDN labels
// count as letters.
const DOMAIN_HOST = /^(?:[\p{L}\p{N}-]+\.)+\p{L}{2,}\.?(?::\d+)?$/u;

/** A Google search for `query`, as Chrome's omnibox sends it. */
export function googleSearchUrl(query: string): string {
  const params = new URLSearchParams({ q: query, sourceid: "chrome", ie: "UTF-8" });
  return `${GOOGLE_SEARCH_URL}?${params}`;
}

/** Whether typed text names an address rather than words to search for. */
export function isAddressInput(text: string): boolean {
  const trimmed = text.trim();
  const scheme = SCHEME_PREFIX.exec(trimmed)?.[1]?.toLowerCase();
  if (scheme && SCHEMES_THE_OMNIBOX_OPENS.has(scheme)) {
    return true;
  }
  if (/\s/.test(trimmed)) {
    return false;
  }
  if (LOCAL_OR_IP_HOST.test(trimmed)) {
    return true;
  }
  const host = trimmed.split(/[/?#]/, 1)[0] ?? "";
  return DOMAIN_HOST.test(host);
}

/**
 * What the omnibox opens for typed text: the address it names, or a Google search for anything
 * else, the way Chrome treats input with Google as the default engine.
 */
export function resolveAddressInput(text: string): string {
  const trimmed = text.trim();
  if (isBrowserStartUrl(trimmed)) {
    return BROWSER_START_URL;
  }
  if (isAddressInput(trimmed)) {
    return normalizeWorkspaceBrowserUrl(trimmed);
  }
  return googleSearchUrl(trimmed);
}
