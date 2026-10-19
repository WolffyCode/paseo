import { searchUrl, type SearchEngine } from "./search-engines";
import { BROWSER_START_URL, isBrowserStartUrl } from "./start-page";
import { normalizeWorkspaceBrowserUrl } from "./store";

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
 * What the omnibox opens for typed text: the address it names, or a search with the default
 * engine for anything else.
 */
export function resolveAddressInput(text: string, engine: SearchEngine): string {
  const trimmed = text.trim();
  if (isBrowserStartUrl(trimmed)) {
    return BROWSER_START_URL;
  }
  if (isAddressInput(trimmed)) {
    return normalizeWorkspaceBrowserUrl(trimmed);
  }
  return searchUrl(engine, trimmed);
}
