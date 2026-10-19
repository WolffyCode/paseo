export const BROWSER_NEW_TAB_REQUEST_EVENT = "paseo:event:browser-new-tab-request";

export type BrowserWindowOpenDisposition =
  | "default"
  | "foreground-tab"
  | "background-tab"
  | "new-window"
  | "other";

export type BrowserWindowOpenDecision =
  | { kind: "deny" }
  | { kind: "popup" }
  /** `isActive` false for a background tab: a ⌘-click or a middle click on a link. */
  | { kind: "workspace-tab"; url: string; isActive: boolean };

/** A new-tab request that waits for its page to register. */
export interface PendingBrowserNewTab {
  url: string;
  isActive: boolean;
}

const MAX_PENDING_WINDOW_OPEN_REQUESTS_PER_GUEST = 20;
const POPUP_WINDOW_GEOMETRY_FEATURE_NAMES = new Set([
  "height",
  "innerheight",
  "innerwidth",
  "left",
  "outerheight",
  "outerwidth",
  "screenx",
  "screeny",
  "top",
  "width",
  "x",
  "y",
]);
const POPUP_WINDOW_UI_FEATURE_NAMES = new Set([
  "location",
  "menubar",
  "resizable",
  "scrollbars",
  "status",
  "toolbar",
]);
const NON_POPUP_WINDOW_FEATURE_NAMES = new Set([
  "attributionsrc",
  "noopener",
  "noreferrer",
  "popup",
]);

export class PendingBrowserWindowOpenRequests {
  private readonly requestsByWebContentsId = new Map<number, PendingBrowserNewTab[]>();

  public add(webContentsId: number, request: PendingBrowserNewTab): void {
    if (!isAllowedBrowserWebviewUrl(request.url)) {
      return;
    }
    const requests = this.requestsByWebContentsId.get(webContentsId) ?? [];
    if (requests.length >= MAX_PENDING_WINDOW_OPEN_REQUESTS_PER_GUEST) {
      return;
    }
    requests.push(request);
    this.requestsByWebContentsId.set(webContentsId, requests);
  }

  public take(webContentsId: number): PendingBrowserNewTab[] {
    const requests = this.requestsByWebContentsId.get(webContentsId) ?? [];
    this.requestsByWebContentsId.delete(webContentsId);
    return requests;
  }

  public delete(webContentsId: number): void {
    this.requestsByWebContentsId.delete(webContentsId);
  }
}

// Extension pages (a new tab page, an options page) are tabs too, as in Chrome, and so is a
// page's source (view-source:).
const BROWSER_PAGE_PROTOCOLS = new Set(["http:", "https:", "chrome-extension:", "view-source:"]);

export function isAllowedBrowserWebviewUrl(value: string | undefined): boolean {
  if (!value) {
    return true;
  }
  try {
    const parsed = new URL(value);
    return BROWSER_PAGE_PROTOCOLS.has(parsed.protocol) || parsed.href === "about:blank";
  } catch {
    return false;
  }
}

export function decideBrowserWindowOpenRequest(input: {
  url: string;
  disposition: BrowserWindowOpenDisposition;
  frameName: string;
  features: string;
  hasPostBody: boolean;
}): BrowserWindowOpenDecision {
  if (!isAllowedBrowserWebviewUrl(input.url)) {
    return { kind: "deny" };
  }

  const featureIntent = getBrowserWindowFeatureIntent(input.features);
  const hasNamedWindowTarget = input.frameName.length > 0 && input.frameName !== "_blank";
  const isScriptPopup =
    input.disposition === "new-window" &&
    (featureIntent.requestsPopup || (hasNamedWindowTarget && !featureIntent.disownsOpener));

  // A real popup preserves window.opener, postMessage, named-window reuse, and
  // window.close(). OAuth and payment flows depend on those browser contracts.
  // POST-backed opens must also remain real windows because a workspace tab can
  // only carry the URL and would silently turn the request into a GET.
  if (isScriptPopup || input.hasPostBody) {
    return { kind: "popup" };
  }

  return {
    kind: "workspace-tab",
    url: input.url,
    isActive: input.disposition !== "background-tab",
  };
}

function getBrowserWindowFeatureIntent(features: string): {
  requestsPopup: boolean;
  disownsOpener: boolean;
} {
  let requestsPopup = false;
  let disownsOpener = false;
  let hasPopupRelevantFeature = false;
  const enabledUiFeatures = new Map<string, boolean>();

  for (const rawFeature of features.split(",")) {
    const separatorIndex = rawFeature.indexOf("=");
    const name = rawFeature
      .slice(0, separatorIndex === -1 ? undefined : separatorIndex)
      .trim()
      .toLowerCase();
    const value =
      separatorIndex === -1
        ? ""
        : rawFeature
            .slice(separatorIndex + 1)
            .trim()
            .toLowerCase();

    if (POPUP_WINDOW_GEOMETRY_FEATURE_NAMES.has(name)) {
      requestsPopup = true;
    }
    if (POPUP_WINDOW_UI_FEATURE_NAMES.has(name)) {
      hasPopupRelevantFeature = true;
      enabledUiFeatures.set(name, isEnabledWindowFeature(value));
    } else if (name.length > 0 && !NON_POPUP_WINDOW_FEATURE_NAMES.has(name)) {
      hasPopupRelevantFeature = true;
    }
    if (name === "popup" && isEnabledWindowFeature(value)) {
      requestsPopup = true;
    }
    if ((name === "noopener" || name === "noreferrer") && isEnabledWindowFeature(value)) {
      disownsOpener = true;
    }
  }

  if (!requestsPopup && hasPopupRelevantFeature) {
    const isUiFeatureEnabled = (name: string): boolean => enabledUiFeatures.get(name) ?? false;
    requestsPopup =
      (!isUiFeatureEnabled("location") && !isUiFeatureEnabled("toolbar")) ||
      !isUiFeatureEnabled("menubar") ||
      !isUiFeatureEnabled("resizable") ||
      !isUiFeatureEnabled("scrollbars") ||
      !isUiFeatureEnabled("status");
  }

  return { requestsPopup, disownsOpener };
}

function isEnabledWindowFeature(value: string): boolean {
  return value !== "0" && value !== "false" && value !== "no";
}
