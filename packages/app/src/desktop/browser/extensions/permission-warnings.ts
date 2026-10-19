import type { DesktopBrowserExtensionPermissionRequest } from "@/desktop/host";

/** A message without parameters; the name is its key under `workspace.browser.extensions.permissions`. */
export type PlainPermissionMessage =
  | "debugger"
  | "allHosts"
  | "newTabPageOverride"
  | "audioAndVideoCapture"
  | "audioCapture"
  | "videoCapture"
  | "geolocation"
  | "historyWriteOnAllDevices"
  | "historyReadOnAllDevices"
  | "historyRead"
  | "favicon"
  | "topSites"
  | "printing"
  | "printingMetrics"
  | "declarativeWebRequest"
  | "declarativeNetRequest"
  | "notifications"
  | "bookmarks"
  | "readingList"
  | "clipboardReadWrite"
  | "clipboardRead"
  | "clipboardWrite"
  | "desktopCapture"
  | "downloads"
  | "downloadsOpen"
  | "identityEmail"
  | "systemStorage"
  | "contentSettings"
  | "documentScan"
  | "input"
  | "management"
  | "mdns"
  | "nativeMessaging"
  | "privacy"
  | "tabGroups"
  | "ttsEngine"
  | "wallpaper";

export type SettingPermissionMessage = "homepage" | "searchSettings" | "startupPages";

/** A host the extension reads and changes; `isWholeDomain` for `*.example.com`. */
export interface PermissionHost {
  host: string;
  isWholeDomain: boolean;
}

/** One line of Chrome's install prompt "It can:" list. */
export type ExtensionPermissionWarning =
  | { kind: "plain"; message: PlainPermissionMessage }
  | { kind: "hosts"; hosts: PermissionHost[] }
  | { kind: "setting"; message: SettingPermissionMessage; value: string };

// Chrome's permission IDs that the rules below read. Manifest API permission names map to
// themselves; the host and override ones come from other manifest keys.
const HOSTS_ALL = "@hostsAll";
const HOST_READ_WRITE = "@hostReadWrite";
const NEW_TAB_PAGE_OVERRIDE = "@newTabPageOverride";
const HOMEPAGE = "@homepage";
const SEARCH_PROVIDER = "@searchProvider";
const STARTUP_PAGES = "@startupPages";

interface WarningRule {
  message: PlainPermissionMessage | SettingPermissionMessage | "hosts";
  required: string[];
  absorbs?: string[];
}

const HISTORY_ABSORBS = [
  "declarativeNetRequestFeedback",
  "favicon",
  "processes",
  "tabs",
  "topSites",
  "webNavigation",
];
const ALL_HOSTS_ABSORBS = [
  "declarativeWebRequest",
  "declarativeNetRequestFeedback",
  "favicon",
  HOST_READ_WRITE,
  "processes",
  "tabs",
  "topSites",
  "webNavigation",
  "declarativeNetRequest",
];

/**
 * Chrome's message rules (chrome/common/extensions/permissions/chrome_permission_message_rules.cc),
 * in Chrome's order, for the permissions a desktop browser extension can ask for. A rule needs
 * all of `required`; it then consumes those and `absorbs`, so later rules don't repeat them.
 */
const WARNING_RULES: readonly WarningRule[] = [
  { message: "debugger", required: ["debugger"] },
  { message: "allHosts", required: [HOSTS_ALL], absorbs: ALL_HOSTS_ABSORBS },
  {
    message: "allHosts",
    required: ["webAuthenticationProxy"],
    absorbs: ALL_HOSTS_ABSORBS,
  },
  { message: "hosts", required: [HOST_READ_WRITE] },
  { message: "newTabPageOverride", required: [NEW_TAB_PAGE_OVERRIDE] },
  { message: "audioAndVideoCapture", required: ["audioCapture", "videoCapture"] },
  { message: "audioCapture", required: ["audioCapture"] },
  { message: "videoCapture", required: ["videoCapture"] },
  { message: "geolocation", required: ["geolocation"] },
  { message: "historyWriteOnAllDevices", required: ["history"], absorbs: HISTORY_ABSORBS },
  {
    message: "historyReadOnAllDevices",
    required: ["tabs", "sessions"],
    absorbs: HISTORY_ABSORBS,
  },
  { message: "historyRead", required: ["tabs"], absorbs: HISTORY_ABSORBS },
  { message: "historyRead", required: ["processes"], absorbs: HISTORY_ABSORBS },
  {
    message: "historyRead",
    required: ["webNavigation"],
    absorbs: ["declarativeNetRequestFeedback", "favicon", "topSites"],
  },
  {
    message: "historyRead",
    required: ["declarativeNetRequestFeedback"],
    absorbs: ["favicon", "topSites"],
  },
  { message: "favicon", required: ["favicon"] },
  { message: "topSites", required: ["topSites"] },
  { message: "printing", required: ["printing"] },
  { message: "printingMetrics", required: ["printingMetrics"] },
  { message: "declarativeWebRequest", required: ["declarativeWebRequest"] },
  { message: "declarativeNetRequest", required: ["declarativeNetRequest"] },
  { message: "notifications", required: ["notifications"] },
  { message: "homepage", required: [HOMEPAGE] },
  { message: "searchSettings", required: [SEARCH_PROVIDER] },
  { message: "startupPages", required: [STARTUP_PAGES] },
  { message: "bookmarks", required: ["bookmarks"] },
  { message: "readingList", required: ["readingList"] },
  { message: "clipboardReadWrite", required: ["clipboardRead", "clipboardWrite"] },
  { message: "clipboardRead", required: ["clipboardRead"] },
  { message: "clipboardWrite", required: ["clipboardWrite"] },
  { message: "desktopCapture", required: ["desktopCapture"] },
  { message: "downloads", required: ["downloads"] },
  { message: "downloadsOpen", required: ["downloads.open"] },
  { message: "identityEmail", required: ["identity.email"] },
  { message: "systemStorage", required: ["system.storage"] },
  { message: "contentSettings", required: ["contentSettings"] },
  { message: "documentScan", required: ["documentScan"] },
  { message: "input", required: ["input"] },
  { message: "management", required: ["management"] },
  { message: "mdns", required: ["mdns"] },
  { message: "nativeMessaging", required: ["nativeMessaging"] },
  { message: "privacy", required: ["privacy"] },
  { message: "tabGroups", required: ["tabGroups"] },
  { message: "ttsEngine", required: ["ttsEngine"] },
  { message: "wallpaper", required: ["wallpaper"] },
];

const WEB_SCHEMES = new Set(["http", "https", "*"]);
const ALL_URLS_PATTERN = "<all_urls>";

/** The host of a match pattern such as `https://*.example.com/*`, for web schemes only. */
function patternHost(pattern: string): string | null {
  const match = /^([^:]+):\/\/([^/]*)/.exec(pattern);
  if (!match || !WEB_SCHEMES.has(match[1] ?? "")) {
    return null;
  }
  return (match[2] ?? "").replace(/:\d+$/, "");
}

// Chrome warns about every site for `*` and for whole top-level domains such as `*.com`.
function coversAllHosts(host: string): boolean {
  return host === "*" || (host.startsWith("*.") && !host.slice(2).includes("."));
}

function readHosts(hostPatterns: readonly string[]): { isAll: boolean; hosts: string[] } {
  const hosts = new Set<string>();
  for (const pattern of hostPatterns) {
    if (pattern === ALL_URLS_PATTERN) {
      return { isAll: true, hosts: [] };
    }
    const host = patternHost(pattern);
    if (host === null) continue;
    if (coversAllHosts(host)) {
      return { isAll: true, hosts: [] };
    }
    hosts.add(host);
  }
  return { isAll: false, hosts: [...hosts].sort() };
}

/** The sites an extension reads and changes: every site, or the listed hosts. */
export function extensionSiteAccess(request: DesktopBrowserExtensionPermissionRequest): {
  isAllSites: boolean;
  hosts: string[];
} {
  const access = readHosts(request.hostPatterns);
  return { isAllSites: access.isAll, hosts: access.hosts };
}

function isSettingMessage(message: string): message is SettingPermissionMessage {
  return message === "homepage" || message === "searchSettings" || message === "startupPages";
}

function hostOfUrl(url: string): string {
  try {
    return new URL(url).host || url;
  } catch {
    // Chrome shows the raw value when the manifest URL doesn't parse.
    return url;
  }
}

/** Chrome's install prompt warnings for what an extension asks for, in Chrome's order. */
export function extensionPermissionWarnings(
  request: DesktopBrowserExtensionPermissionRequest,
): ExtensionPermissionWarning[] {
  const hostAccess = readHosts(request.hostPatterns);
  const remaining = new Set(request.apiPermissions);
  if (hostAccess.isAll) remaining.add(HOSTS_ALL);
  if (hostAccess.hosts.length > 0) remaining.add(HOST_READ_WRITE);
  if (request.overridesNewTabPage) remaining.add(NEW_TAB_PAGE_OVERRIDE);
  if (request.homepageUrl) remaining.add(HOMEPAGE);
  if (request.searchUrl) remaining.add(SEARCH_PROVIDER);
  if (request.startupPageUrl) remaining.add(STARTUP_PAGES);
  const settingValues: Record<SettingPermissionMessage, string> = {
    homepage: hostOfUrl(request.homepageUrl ?? ""),
    searchSettings: hostOfUrl(request.searchUrl ?? ""),
    startupPages: hostOfUrl(request.startupPageUrl ?? ""),
  };

  const warnings: ExtensionPermissionWarning[] = [];
  for (const rule of WARNING_RULES) {
    if (!rule.required.every((permission) => remaining.has(permission))) continue;
    for (const permission of rule.required) remaining.delete(permission);
    if (rule.message === "hosts") {
      warnings.push({
        kind: "hosts",
        hosts: hostAccess.hosts.map((host) => ({
          host: host.startsWith("*.") ? host.slice(2) : host,
          isWholeDomain: host.startsWith("*."),
        })),
      });
      continue;
    }
    if (isSettingMessage(rule.message)) {
      warnings.push({ kind: "setting", message: rule.message, value: settingValues[rule.message] });
      continue;
    }
    for (const permission of rule.absorbs ?? []) remaining.delete(permission);
    warnings.push({ kind: "plain", message: rule.message });
  }
  return warnings;
}
