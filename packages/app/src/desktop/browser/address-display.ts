import { isBrowserStartUrl } from "./start-page";

/** What the omnibox chip says about a page, as LocationBarModel does. */
export type AddressSecurity = "secure" | "notSecure" | "file" | "internal" | "extension" | "none";

/** A piece of the displayed address; Chrome draws only the host at full strength. */
export interface AddressSegment {
  part: "viewSource" | "scheme" | "host" | "rest";
  text: string;
  isHost: boolean;
}

const TRIVIAL_SUBDOMAIN = "www.";
const VIEW_SOURCE_PREFIX = "view-source:";

/**
 * The page a view-source address shows the source of, or null for any other address. Chrome
 * refuses a doubled prefix (url_formatter FormatUrl).
 */
function viewSourceTarget(url: string): string | null {
  const isViewSource = url.startsWith(VIEW_SOURCE_PREFIX);
  const isDoubled = url.startsWith(`${VIEW_SOURCE_PREFIX}${VIEW_SOURCE_PREFIX}`);
  if (!isViewSource || isDoubled) {
    return null;
  }
  return url.slice(VIEW_SOURCE_PREFIX.length);
}

export function addressSecurity(url: string): AddressSecurity {
  // A page's source is as secure as the page.
  const sourcePage = viewSourceTarget(url);
  if (sourcePage) {
    return addressSecurity(sourcePage);
  }
  if (isBrowserStartUrl(url)) {
    return "none";
  }
  let protocol: string;
  try {
    protocol = new URL(url).protocol;
  } catch {
    // An address that doesn't parse gets no chip.
    return "none";
  }
  switch (protocol) {
    case "https:":
      return "secure";
    case "http:":
      return "notSecure";
    case "file:":
      return "file";
    case "paseo:":
      return "internal";
    case "chrome-extension:":
      return "extension";
    default:
      return "none";
  }
}

/**
 * The address as the omnibox shows it at rest (GetURLForDisplay): http and https schemes, a
 * leading "www.", credentials and a lone trailing slash are dropped, and file URLs show their
 * path. Only the host is emphasized; extension pages are dimmed throughout.
 */
export function addressDisplaySegments(url: string): AddressSegment[] {
  // FormatViewSourceUrl: the prefix, then the page's own address formatted the same way.
  const sourcePage = viewSourceTarget(url);
  if (sourcePage) {
    return [
      { part: "viewSource", text: VIEW_SOURCE_PREFIX, isHost: false },
      ...addressDisplaySegments(sourcePage),
    ];
  }
  if (isBrowserStartUrl(url)) {
    return [];
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    // Typed text that isn't an address is shown as typed.
    return [{ part: "rest", text: url, isHost: false }];
  }
  const isWebPage = parsed.protocol === "http:" || parsed.protocol === "https:";
  if (parsed.protocol === "file:") {
    return [{ part: "rest", text: decodeURI(parsed.pathname), isHost: false }];
  }
  if (!isWebPage) {
    const isExtension = parsed.protocol === "chrome-extension:";
    const prefix = `${parsed.protocol}//`;
    const rest = url.slice(prefix.length + parsed.host.length);
    const segments: AddressSegment[] = [
      { part: "scheme", text: prefix, isHost: false },
      { part: "host", text: parsed.host, isHost: !isExtension },
      { part: "rest", text: rest, isHost: false },
    ];
    return segments.filter((segment) => segment.text.length > 0);
  }
  const host = parsed.host.startsWith(TRIVIAL_SUBDOMAIN)
    ? parsed.host.slice(TRIVIAL_SUBDOMAIN.length)
    : parsed.host;
  const pathAndMore = `${parsed.pathname}${parsed.search}${parsed.hash}`;
  const tail = pathAndMore === "/" ? "" : pathAndMore;
  const segments: AddressSegment[] = [
    { part: "host", text: host, isHost: true },
    { part: "rest", text: tail, isHost: false },
  ];
  return segments.filter((segment) => segment.text.length > 0);
}
