import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
  createElement,
} from "react";
import { createPortal } from "react-dom";
import { BrowserAddressBar } from "./address-bar.electron";
import { Image, Pressable, Text, View, type GestureResponderEvent } from "react-native";
import {
  EditingTextInput as TextInput,
  type EditingTextInputHandle,
} from "@/components/ui/text-input";
import { Globe, MousePointerClick, X } from "lucide-react-native";
import { StyleSheet, useUnistyles, withUnistyles } from "react-native-unistyles";
import { useTranslation } from "react-i18next";
import * as Clipboard from "expo-clipboard";
import { Button } from "@/components/ui/button";
import { useRetainedPanelActive, useRetainedPanelPaint } from "@/components/retained-panel";
import { useToast } from "@/contexts/toast-context";
import {
  buildWorkspaceAttachmentScopeKey,
  useWorkspaceAttachments,
  useWorkspaceAttachmentsStore,
} from "@/attachments/workspace-attachments-store";
import type { AttachmentMetadata, BrowserElementAttachment } from "@/attachments/types";
import { persistAttachmentFromDataUrl } from "@/attachments/service";
import { getOverlayRoot } from "@/lib/overlay-root";
import {
  getDesktopHost,
  isElectronRuntime,
  type DesktopBrowserShortcutEvent,
} from "@/desktop/host";
import {
  normalizeWorkspaceBrowserUrl,
  RESPONSIVE_BROWSER_VIEWPORT,
  useBrowserStore,
} from "@/desktop/browser/store";
import {
  BROWSER_START_URL,
  isBrowserStartUrl,
  openBrowserStartPage,
  type BrowserNavigationIntent,
  type BrowserRecentSite,
} from "@/desktop/browser/start-page";
import { useBrowserExtensionsStore } from "@/desktop/browser/extensions/store";
import {
  BROWSER_DOWNLOADS_URL,
  BROWSER_EXTENSIONS_URL,
  BROWSER_SETTINGS_URL,
  browserInternalPage,
  internalPageRecord,
  settingsUrl,
} from "@/desktop/browser/internal-pages";
import {
  CLEAR_BROWSER_DATA_ROUTE,
  IMPORT_DATA_ROUTE,
  settingsSubpageRoute,
} from "@/desktop/browser/chrome-settings/routes";
import { resolveAddressInput } from "@/desktop/browser/address-input";
import { defaultSearchEngine } from "@/desktop/browser/search-engines";
import { ChromeToolbarButton } from "@/desktop/browser/chrome-controls";
import { ChromeIcon } from "@/desktop/browser/chrome-icons";
import { CHROME_LAYOUT, chromeColorProps } from "@/desktop/browser/chrome-theme";
import { CHROME_WEB_STORE_HOME_URL } from "@/desktop/browser/extensions/web-store";
import {
  findBrowserOnInternalPage,
  openBrowserFromPage,
  reopenClosedBrowser,
  requestBrowserNavigation,
  revealBrowserPage,
  subscribeBrowserNavigation,
  takeAddressFocusRequest,
} from "@/desktop/browser/workspace-browsers";
import { DEFAULT_ZOOM_FACTOR, nextZoomFactor } from "@/desktop/browser/zoom";
import { useKeyboardActionHandler } from "@/hooks/use-keyboard-action-handler";
import { BROWSER_PAGE_DATA_SET } from "@/keyboard/focus-scope";
import { buildWorkspaceKeyboardHandlerId } from "@/keyboard/handler-id";
import type { KeyboardActionDefinition } from "@/keyboard/keyboard-action-dispatcher";
import {
  applyInactiveBrowserWebviewViewport,
  prepareBrowserWebview,
  presentBrowserWebview,
  rememberBrowserWebviewSize,
  releaseResidentBrowserWebview,
  removeResidentBrowserWebview,
  takeResidentBrowserWebview,
} from "../resident-webviews";
import { useElementBounds } from "../use-element-bounds";
import { ExtensionInstallPromptDialog } from "../extensions/install-prompt";
import { BrowserExtensionsToolbar } from "../extensions/toolbar";
import {
  homePageAddress,
  useBrowserToolbarSettingsStore,
  type BrowserPinnableAction,
} from "../toolbar/settings";
import { chooseFromPinMenu } from "../toolbar/actions";
import { BrowserDownloadsPage } from "../downloads/downloads-page.electron";
import { BrowserPinnedActionsToolbar } from "../toolbar/pinned-actions-toolbar.electron";
import { BrowserSidePanelLayout } from "../side-panel/layout.electron";
import { useBrowserSidePanelStore, type CustomizeChromePage } from "../side-panel/store";
import { CustomizeChromeContent } from "../customize/customize-chrome.electron";
import { menuAnchorBelow } from "../menu-anchor.electron";
import { ChromeToast, useChromeToasts } from "../chrome-toast.electron";
import {
  middleClickDisposition,
  pressDisposition,
  type BrowserClickDisposition,
} from "../click-disposition";
import { BrowserExtensionsPage } from "../extensions/extensions-page";
import { BrowserSettingsPage } from "../chrome-settings/settings-page.electron";
import type { BrowserAppMenuChoice, BrowserCommand } from "./app-menu";
import { BrowserAppMenu } from "./browser-app-menu.electron";
import { AvatarToolbarButton } from "../profile/avatar-toolbar-button.electron";
import { ProfileMenu } from "../profile/profile-menu.electron";
import { BrowserSadTab } from "./sad-tab";
import { openTaskManager } from "../task-manager";
import { QrCodeBubble } from "../qr-code/qr-code-bubble.electron";
import { deviceSizeIdForViewport, viewportForDeviceSize, type DeviceSizeId } from "./device-sizes";
import { BrowserFindBar } from "./find-bar.electron";
import { historyMenuItems, type HistoryMenuDirection } from "./history-menu";
import { chooseFromPageTools } from "./page-tools";
import { BrowserDialogHostProvider } from "./dialog-host";
import {
  createElementSelectorController,
  type BrowserElementSelection,
  type ElementSelectorOutcome,
} from "./element-selector.electron";
import { PRODUCT_NAME } from "@/constants/product";

type ElectronWebview = HTMLElement & {
  canGoBack?: () => boolean;
  canGoForward?: () => boolean;
  goBack?: () => void;
  goForward?: () => void;
  goToIndex?: (index: number) => void;
  reload?: () => void;
  stop?: () => void;
  loadURL?: (url: string) => Promise<void>;
  getURL?: () => string;
  getTitle?: () => string;
  isLoading?: () => boolean;
  executeJavaScript?: (code: string) => Promise<unknown>;
  focus?: () => void;
  print?: () => void;
  findInPage?: (text: string, options?: { forward?: boolean; findNext?: boolean }) => number;
  stopFindInPage?: (action: "clearSelection" | "keepSelection" | "activateSelection") => void;
  getZoomFactor?: () => number;
  setZoomFactor?: (factor: number) => void;
  cut?: () => void;
  copy?: () => void;
  paste?: () => void;
  addEventListener: (type: string, listener: EventListenerOrEventListenerObject) => void;
  removeEventListener: (type: string, listener: EventListenerOrEventListenerObject) => void;
};

interface BrowserElementAnnotation {
  comment: string;
}

const ERR_ABORTED = -3;
// chrome-extension: pages are extension pages a tab can show (options, the new tab page), and
// view-source: shows a page's source.
const ALLOWED_BROWSER_PROTOCOLS = new Set(["http:", "https:", "chrome-extension:", "view-source:"]);

function isSameDocument(left: string, right: string): boolean {
  try {
    const leftUrl = new URL(left);
    const rightUrl = new URL(right);
    return leftUrl.origin === rightUrl.origin && leftUrl.pathname === rightUrl.pathname;
  } catch {
    return false;
  }
}

/**
 * The tab's own address for what its guest shows. An extension's new tab page is the new tab
 * page, as in Chrome: the address bar stays empty and the visit stays out of history.
 */
function pageUrlForGuestUrl(guestUrl: string, newTabUrl: string | null): string {
  if (newTabUrl && isSameDocument(guestUrl, newTabUrl)) {
    return BROWSER_START_URL;
  }
  return normalizeWorkspaceBrowserUrl(guestUrl);
}

function truncateText(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength).trim()}...` : value;
}

function getWebviewLoadErrorMessage(event: Event, failedToLoadLabel: string): string | null {
  const details = event as Event & {
    errorCode?: unknown;
    errorDescription?: unknown;
    isMainFrame?: unknown;
    validatedURL?: unknown;
  };
  if (details.isMainFrame === false || details.errorCode === ERR_ABORTED) {
    return null;
  }

  const description =
    typeof details.errorDescription === "string" && details.errorDescription.trim()
      ? details.errorDescription.trim()
      : failedToLoadLabel;
  const url =
    typeof details.validatedURL === "string" && details.validatedURL.trim()
      ? details.validatedURL.trim()
      : null;

  return url ? `${description}: ${url}` : description;
}

function getUnsafeNavigationMessage(
  url: string,
  labels: { invalidUrl: string; unsupportedProtocol: (protocol: string) => string },
): string | null {
  try {
    const parsed = new URL(url);
    if (ALLOWED_BROWSER_PROTOCOLS.has(parsed.protocol) || parsed.href === "about:blank") {
      return null;
    }
    return labels.unsupportedProtocol(parsed.protocol);
  } catch {
    return labels.invalidUrl;
  }
}

function formatElementAttachment(
  selection: BrowserElementSelection,
  annotation?: BrowserElementAnnotation,
): string {
  const textPreview = truncateText(selection.text.trim(), 200);
  const html = truncateText(selection.outerHTML.trim(), 800);
  const parts: string[] = [];

  if (selection.reactSource?.fileName) {
    const loc = [
      selection.reactSource.fileName,
      selection.reactSource.lineNumber != null ? `:${selection.reactSource.lineNumber}` : "",
      selection.reactSource.columnNumber != null ? `:${selection.reactSource.columnNumber}` : "",
    ].join("");
    parts.push(`source: ${selection.reactSource.componentName ?? selection.tag} @ ${loc}`);
  }

  parts.push(`selector: ${selection.selector}`);

  if (textPreview) {
    parts.push(`text: ${JSON.stringify(textPreview)}`);
  }

  parts.push(`size: ${selection.boundingRect.width}x${selection.boundingRect.height}`);

  const keyStyles = Object.entries(selection.computedStyles)
    .filter(([key]) =>
      ["display", "position", "font-size", "color", "background-color"].includes(key),
    )
    .map(([key, value]) => `${key}: ${value}`)
    .join("; ");
  if (keyStyles) {
    parts.push(`styles: ${keyStyles}`);
  }

  if (selection.parentChain.length > 0) {
    parts.push(`parents: ${selection.parentChain.slice(0, 3).join(" > ")}`);
  }

  const comment = annotation?.comment.trim();
  if (comment) {
    parts.push(`feedback: ${comment}`);
  }

  return [
    `<browser-element url="${selection.url}">`,
    parts.map((part) => `  ${part}`).join("\n"),
    `  html: ${html}`,
    `</browser-element>`,
  ].join("\n");
}

function buildBrowserElementAttachment(
  selection: BrowserElementSelection,
  annotation?: BrowserElementAnnotation,
  screenshot?: AttachmentMetadata,
): BrowserElementAttachment {
  const comment = annotation?.comment.trim();
  return {
    url: selection.url,
    selector: selection.selector,
    tag: selection.tag,
    text: selection.text,
    outerHTML: truncateText(selection.outerHTML, 2000),
    computedStyles: selection.computedStyles,
    boundingRect: selection.boundingRect,
    reactSource: selection.reactSource,
    parentChain: selection.parentChain,
    children: selection.children,
    ...(comment ? { comment } : {}),
    ...(screenshot ? { screenshot } : {}),
    formatted: formatElementAttachment(selection, annotation),
  };
}

function buildBrowserAttachmentScopeKey(input: {
  cwd: string | null;
  serverId: string;
  workspaceId: string;
}): string | null {
  if (!input.cwd) {
    return null;
  }
  return buildWorkspaceAttachmentScopeKey({
    serverId: input.serverId,
    workspaceId: input.workspaceId,
    cwd: input.cwd,
  });
}

function executeWebviewJavaScript(webview: ElectronWebview, code: string): Promise<unknown> {
  if (!webview.isConnected) {
    return Promise.resolve(null);
  }
  try {
    return webview.executeJavaScript?.(code) ?? Promise.resolve(null);
  } catch (error) {
    return Promise.reject(error);
  }
}

function ignoreWebviewJavaScriptError() {}

interface BrowserAnnotationMarker {
  index: number;
  selector: string;
}

// Draws numbered badges over annotated elements inside the guest page. The
// overlay is a fixed, pointer-events:none layer that re-measures element rects
// on scroll/resize via rAF. Markers are matched by the CSS selector captured at
// annotation time; unmatched selectors are simply skipped.
function buildAnnotationMarkerScript(markers: readonly BrowserAnnotationMarker[]): string {
  const payload = JSON.stringify(
    markers.map((marker) => ({ index: marker.index, selector: marker.selector })),
  );
  return `
    (function() {
      var markers = ${payload};
      if (window.__paseoAnnotationMarkers) { window.__paseoAnnotationMarkers.update(markers); return true; }
      var host = document.createElement('div');
      host.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;z-index:2147483646;pointer-events:none;';
      (document.body || document.documentElement).appendChild(host);
      var badges = [];
      var current = markers;
      function clearBadges() {
        for (var i = 0; i < badges.length; i++) { if (badges[i].parentNode) badges[i].parentNode.removeChild(badges[i]); }
        badges = [];
      }
      function reposition() {
        clearBadges();
        for (var i = 0; i < current.length; i++) {
          var m = current[i];
          var el = null;
          try { el = document.querySelector(m.selector); } catch (e) { el = null; }
          if (!el) continue;
          var rect = el.getBoundingClientRect();
          if (rect.width === 0 && rect.height === 0) continue;
          var badge = document.createElement('div');
          badge.textContent = String(m.index);
          badge.style.cssText = 'position:fixed;min-width:18px;height:18px;padding:0 4px;border-radius:9px;background:#2563eb;color:#fff;font:600 11px/18px -apple-system,system-ui,sans-serif;text-align:center;box-shadow:0 1px 3px rgba(0,0,0,0.4);pointer-events:none;box-sizing:border-box;';
          badge.style.left = Math.max(0, rect.left) + 'px';
          badge.style.top = Math.max(0, rect.top) + 'px';
          host.appendChild(badge);
          badges.push(badge);
        }
      }
      var scheduled = false;
      function schedule() {
        if (scheduled) return;
        scheduled = true;
        requestAnimationFrame(function() { scheduled = false; reposition(); });
      }
      window.addEventListener('scroll', schedule, true);
      window.addEventListener('resize', schedule, true);
      window.__paseoAnnotationMarkers = {
        update: function(next) { current = next; schedule(); },
        destroy: function() {
          window.removeEventListener('scroll', schedule, true);
          window.removeEventListener('resize', schedule, true);
          clearBadges();
          if (host.parentNode) host.parentNode.removeChild(host);
          window.__paseoAnnotationMarkers = null;
        }
      };
      reposition();
      return true;
    })()
  `;
}

function applyAnnotationMarkers(
  webview: ElectronWebview,
  markers: readonly BrowserAnnotationMarker[],
): void {
  void executeWebviewJavaScript(webview, buildAnnotationMarkerScript(markers)).catch(
    ignoreWebviewJavaScriptError,
  );
}

function clearAnnotationMarkers(webview: ElectronWebview): void {
  void executeWebviewJavaScript(
    webview,
    "if(window.__paseoAnnotationMarkers) window.__paseoAnnotationMarkers.destroy();",
  ).catch(ignoreWebviewJavaScriptError);
}

const START_PAGE_CONTENT_WIDTH = 560;

function siteLabel(url: string): string {
  try {
    return new URL(url).host || url;
  } catch {
    return url;
  }
}

function isReloadShortcutKey(event: KeyboardEvent): boolean {
  if (event.altKey || event.shiftKey) {
    return false;
  }
  if (!event.metaKey && !event.ctrlKey) {
    return false;
  }
  return event.key.toLowerCase() === "r" || event.code === "KeyR";
}

function isDesktopBrowserShortcutEvent(payload: unknown): payload is DesktopBrowserShortcutEvent {
  if (!payload || typeof payload !== "object") {
    return false;
  }
  const event = payload as Partial<DesktopBrowserShortcutEvent>;
  return event.action === "focus-url";
}

function BrowserStartPage({
  browserId,
  recentSites,
  onOpenSite,
}: {
  browserId: string;
  recentSites: readonly BrowserRecentSite[];
  onOpenSite: (url: string) => void;
}) {
  const { t } = useTranslation();
  const { theme } = useUnistyles();
  const sectionStyle = useMemo(
    () => [styles.startSectionLabel, { color: theme.colors.foregroundMuted }],
    [theme.colors.foregroundMuted],
  );

  return (
    <View style={styles.startPage} testID={`browser-start-${browserId}`}>
      {recentSites.length > 0 ? (
        <View style={styles.startContent}>
          <Text style={sectionStyle}>{t("workspace.browser.start.recommendations")}</Text>
          <View style={styles.startSites}>
            {recentSites.map((site) => (
              <RecentSiteButton key={site.url} site={site} onPress={onOpenSite} />
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}

function RecentSiteButton({
  site,
  onPress,
}: {
  site: BrowserRecentSite;
  onPress: (url: string) => void;
}) {
  const { theme } = useUnistyles();
  const label = site.title.trim() || siteLabel(site.url);
  const handlePress = useCallback(() => onPress(site.url), [onPress, site.url]);
  const iconSource = useMemo(
    () => (site.faviconUrl ? { uri: site.faviconUrl } : undefined),
    [site.faviconUrl],
  );
  const buttonStyle = useCallback(
    ({ hovered, pressed }: { hovered?: boolean; pressed?: boolean }) => [
      styles.startSite,
      (hovered || pressed) && styles.startSiteHovered,
    ],
    [],
  );
  const labelStyle = useMemo(
    () => [styles.startSiteLabel, { color: theme.colors.foregroundMuted }],
    [theme.colors.foregroundMuted],
  );
  const icon = iconSource ? (
    <Image accessibilityIgnoresInvertColors source={iconSource} style={styles.startSiteIcon} />
  ) : (
    <Globe size={28} color={theme.colors.foregroundMuted} />
  );
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={handlePress}
      style={buttonStyle}
    >
      {icon}
      <Text numberOfLines={1} style={labelStyle}>
        {label}
      </Text>
    </Pressable>
  );
}

// Chrome's page shortcuts, and the command each one runs.
const PAGE_SHORTCUT_COMMANDS = {
  "browser.tab.new": "newTab",
  "browser.tab.reopen": "reopenClosedTab",
  "browser.page.downloads": "showDownloads",
  "browser.page.focus-location": "focusLocation",
  "browser.page.back": "back",
  "browser.page.forward": "forward",
  "browser.page.home": "home",
  "browser.page.find": "find",
  "browser.page.print": "print",
  "browser.page.save": "savePage",
  "browser.page.clear-data": "clearBrowsingData",
  "browser.page.settings": "showSettings",
  "browser.page.avatar-menu": "showAvatarMenu",
  "browser.page.zoom-in": "zoomIn",
  "browser.page.zoom-out": "zoomOut",
  "browser.page.zoom-reset": "zoomReset",
  "browser.page.devtools": "devTools",
} as const satisfies Record<string, BrowserCommand>;
type PageShortcutAction = keyof typeof PAGE_SHORTCUT_COMMANDS;
const BROWSER_PAGE_ACTIONS = Object.keys(PAGE_SHORTCUT_COMMANDS) as PageShortcutAction[];

// The ⋮ menu's zoom row buttons and the step each takes.
const MENU_ZOOM_DIRECTIONS: Partial<Record<BrowserCommand, 1 | -1>> = {
  zoomIn: 1,
  zoomOut: -1,
};

function elementOf(view: View | null): HTMLElement | null {
  const node: unknown = view;
  return node instanceof HTMLElement ? node : null;
}

// The command each pinned toolbar button runs (browser_actions.cc).
const PINNED_ACTION_COMMANDS = {
  kActionShowDownloads: "showDownloads",
  kActionPrint: "print",
  kActionCopyUrl: "copyLink",
  kActionTaskManager: "taskManager",
  kActionDevTools: "devTools",
} as const satisfies Record<BrowserPinnableAction, BrowserCommand>;

function rememberResolvedBrowserWebviewSize(browserId: string, webview: HTMLElement): void {
  const bounds = webview.getBoundingClientRect();
  rememberBrowserWebviewSize({ browserId, width: bounds.width, height: bounds.height });
}

// eslint-disable-next-line complexity
export function BrowserPane({
  browserId,
  serverId,
  workspaceId,
  cwd,
  isInteractive,
  onFocusPane,
}: {
  browserId: string;
  serverId: string;
  workspaceId: string;
  cwd: string | null;
  isInteractive?: boolean;
  onFocusPane?: () => void;
}) {
  const { theme } = useUnistyles();
  const { t } = useTranslation();
  const browser = useBrowserStore((state) => state.browsersById[browserId] ?? null);
  const browserHistory = useBrowserStore((state) => state.history);
  const [startPage] = useState(() =>
    openBrowserStartPage({ browserId, url: browser?.url ?? BROWSER_START_URL }),
  );
  const startSnapshot = useSyncExternalStore(
    startPage.subscribe,
    startPage.getSnapshot,
    startPage.getSnapshot,
  );
  const newTabUrl = useBrowserExtensionsStore((state) => state.newTabUrl);
  const showHomeButton = useBrowserToolbarSettingsStore((state) => state.showHomeButton);
  const showForwardButton = useBrowserToolbarSettingsStore((state) => state.showForwardButton);
  const customizeChromePanel = useBrowserSidePanelStore(
    (state) => state.customizeChromeByBrowserId[browserId] ?? null,
  );
  const newTabUrlRef = useRef(newTabUrl);
  newTabUrlRef.current = newTabUrl;
  // An extension's new tab page is a guest page; Helm's own start page is not.
  const showStartPage = startSnapshot.phase === "start" && newTabUrl === null;
  const internalPage = browserInternalPage(browser?.url ?? "");
  // Helm draws its start page and its own pages itself; only web pages have a guest.
  const drawsOwnPage = showStartPage || internalPage !== null;
  useRetainedPanelPaint(!drawsOwnPage);
  const pendingRequestIdRef = useRef<number | null>(null);
  const updateBrowser = useBrowserStore((state) => state.updateBrowser);
  const setBrowserViewport = useBrowserStore((state) => state.setBrowserViewport);
  const browserViewport = browser?.viewport ?? RESPONSIVE_BROWSER_VIEWPORT;
  const browserViewportRef = useRef(browserViewport);
  browserViewportRef.current = browserViewport;
  const isPresented = useRetainedPanelActive();
  const isPresentedRef = useRef(isPresented);
  isPresentedRef.current = isPresented;
  const webviewRef = useRef<ElectronWebview | null>(null);
  const webviewHostRef = useRef<HTMLDivElement | null>(null);
  const webviewClipRef = useRef<HTMLElement | null>(null);
  // The exit code of the page's renderer once it ended other than cleanly: Chrome's sad tab shows
  // until the page loads again.
  const [crashedExitCode, setCrashedExitCode] = useState<number | null>(null);
  const urlInputRef = useRef<EditingTextInputHandle | null>(null);
  const browserIdRef = useRef(browserId);
  browserIdRef.current = browserId;
  const browserRef = useRef(browser);
  browserRef.current = browser;
  const pendingNavigationUrlRef = useRef<string | null>(null);
  const annotationMarkersRef = useRef<BrowserAnnotationMarker[]>([]);
  const [selectorMode, setSelectorMode] = useState<"annotate" | "screenshot" | null>(null);
  const selectorControllerRef = useRef<ReturnType<typeof createElementSelectorController> | null>(
    null,
  );
  if (!selectorControllerRef.current) {
    selectorControllerRef.current = createElementSelectorController();
  }
  const selectorActive = selectorMode !== null;
  const toast = useToast();
  const toastRef = useRef(toast);
  toastRef.current = toast;
  // Chrome's toasts belong to the tab: a switch away or a new document closes them.
  const {
    shown: shownChromeToast,
    showToast: showChromeToast,
    closeToast: closeChromeToast,
    handleExited: handleChromeToastExited,
  } = useChromeToasts();
  useEffect(() => {
    if (!isPresented) {
      closeChromeToast();
    }
  }, [closeChromeToast, isPresented]);
  const [pendingSelection, setPendingSelection] = useState<BrowserElementSelection | null>(null);
  // Screenshot is captured at selection time (overlay already torn down, no
  // scroll drift) and reused when the annotation card is submitted.
  const pendingScreenshotRef = useRef<AttachmentMetadata | undefined>(undefined);
  const workspaceAttachmentScopeKey = useMemo(
    () => buildBrowserAttachmentScopeKey({ cwd, serverId, workspaceId }),
    [cwd, serverId, workspaceId],
  );
  const workspaceAttachments = useWorkspaceAttachments(workspaceAttachmentScopeKey ?? "");
  const setWorkspaceAttachments = useWorkspaceAttachmentsStore(
    (state) => state.setWorkspaceAttachments,
  );
  const titleStyle = useMemo(
    () => [styles.unavailableTitle, { color: theme.colors.foreground }],
    [theme.colors.foreground],
  );
  const subtitleStyle = useMemo(
    () => [styles.unavailableSubtitle, { color: theme.colors.foregroundMuted }],
    [theme.colors.foregroundMuted],
  );
  const errorTextStyle = useMemo(
    () => [styles.metaError, { color: theme.colors.palette.red[500] }],
    [theme.colors.palette.red],
  );
  const browserErrorLabels = useMemo(
    () => ({
      failedToLoad: t("workspace.browser.errors.failedToLoad"),
      invalidUrl: t("workspace.browser.errors.invalidUrl"),
      unsupportedProtocol: (protocol: string) =>
        t("workspace.browser.errors.unsupportedProtocol", { protocol }),
    }),
    [t],
  );
  const browserErrorLabelsRef = useRef(browserErrorLabels);
  browserErrorLabelsRef.current = browserErrorLabels;

  useEffect(() => {
    startPage.setHistory(browserHistory);
  }, [browserHistory, startPage]);

  const updateBrowserRef = useRef(updateBrowser);
  updateBrowserRef.current = updateBrowser;

  const focusUrlBar = useCallback(() => {
    const input = urlInputRef.current;
    if (!input) return;
    input.focus();
    const text = input.getText();
    input.replaceText(text, { start: 0, end: text.length });
  }, []);

  // A new tab starts with the cursor in its address bar, as in Chrome.
  useEffect(() => {
    if (takeAddressFocusRequest(browserId)) focusUrlBar();
  }, [browserId, focusUrlBar]);

  const syncNavigationState = useCallback(
    (input?: { syncUrl?: boolean }) => {
      const webview = webviewRef.current;
      if (!webview) {
        return;
      }

      try {
        const currentUrl = webview.getURL?.() ?? webview.getAttribute("src") ?? "";
        const observedUrl = pendingNavigationUrlRef.current ?? currentUrl;
        // A guest between documents reports an empty URL. That says nothing about the page,
        // and normalizing it would turn a loaded page back into the new tab page.
        const isUrlObserved = input?.syncUrl !== false && observedUrl.length > 0;
        const patch = {
          canGoBack: webview.canGoBack?.() ?? false,
          canGoForward: webview.canGoForward?.() ?? false,
          isLoading: webview.isLoading?.() ?? false,
          ...(isUrlObserved ? { url: pageUrlForGuestUrl(observedUrl, newTabUrlRef.current) } : {}),
        };
        updateBrowserRef.current(browserIdRef.current, patch);
        startPage.observeNavigation({
          ...patch,
          requestId: pendingRequestIdRef.current ?? undefined,
        });
      } catch {
        // webview not yet attached
      }
    },
    [startPage],
  );

  // A page Helm draws has no guest. One left from before (an extension's new tab page that went
  // away, the web page a tab left for an internal page) would otherwise return stale on the next
  // load.
  useEffect(() => {
    if (drawsOwnPage) {
      removeResidentBrowserWebview(browserId);
    }
  }, [browserId, drawsOwnPage]);

  useEffect(() => {
    if (!isElectronRuntime() || drawsOwnPage) {
      return;
    }

    const host = webviewHostRef.current;
    const clip = webviewClipRef.current;
    if (!host || !clip) {
      return;
    }

    // The start page has no guest. Read the submitted address when its host mounts.
    const pageUrl = browserRef.current?.url ?? BROWSER_START_URL;
    const initialUrl =
      isBrowserStartUrl(pageUrl) && newTabUrlRef.current ? newTabUrlRef.current : pageUrl;
    const initialUnsafeNavigationMessage = getUnsafeNavigationMessage(
      initialUrl,
      browserErrorLabelsRef.current,
    );
    const residentWebview = takeResidentBrowserWebview(browserId) as ElectronWebview | null;
    const webview = residentWebview ?? (document.createElement("webview") as ElectronWebview);
    webviewRef.current = webview;
    if (!residentWebview) {
      prepareBrowserWebview(webview, {
        browserId,
        workspaceId,
        initialUrl: initialUnsafeNavigationMessage ? "about:blank" : initialUrl,
      });
    }
    presentBrowserWebview(
      browserId,
      webview,
      host,
      clip,
      browserViewportRef.current,
      isPresentedRef.current,
    );

    const handleStartLoading = () => {
      setCrashedExitCode(null);
      selectorControllerRef.current?.stopForWebview(webview);
      updateBrowser(browserId, { isLoading: true, lastError: null });
      syncNavigationState({ syncUrl: false });
    };
    const handleStopLoading = () => {
      // A navigation that stopped without committing, such as a download, left the page where
      // it was; the address shows that page again, as Chrome's omnibox reverts.
      pendingNavigationUrlRef.current = null;
      updateBrowser(browserId, { isLoading: false });
      syncNavigationState();
    };
    const commitNavigation = (event: Event, isNewDocument: boolean) => {
      const nextUrl =
        typeof (event as Event & { url?: unknown }).url === "string"
          ? ((event as Event & { url?: string }).url ?? "")
          : (webview.getURL?.() ?? webview.getAttribute("src") ?? "");
      pendingNavigationUrlRef.current = null;
      if (!nextUrl) {
        syncNavigationState({ syncUrl: false });
        return;
      }
      const normalized = pageUrlForGuestUrl(nextUrl, newTabUrlRef.current);
      // A new document brings its own favicon and, until it names itself, the title the guest
      // reports; Chrome's tab keeps the old ones until then. The same document keeps both.
      updateBrowser(browserIdRef.current, {
        url: normalized,
        ...(isNewDocument ? { title: webview.getTitle?.() ?? "", faviconUrl: null } : {}),
        lastError: null,
      });
      useBrowserStore.getState().recordVisit(browserIdRef.current);
      syncNavigationState();
    };
    const handleNavigate = (event: Event) => {
      closeChromeToast();
      commitNavigation(event, true);
    };
    const handleNavigateInPage = (event: Event) => {
      commitNavigation(event, false);
    };
    const handleWillNavigate = (event: Event) => {
      const nextUrl =
        typeof (event as Event & { url?: unknown }).url === "string"
          ? ((event as Event & { url?: string }).url ?? "")
          : "";
      if (!nextUrl) {
        return;
      }
      const normalized = pageUrlForGuestUrl(nextUrl, newTabUrlRef.current);
      pendingNavigationUrlRef.current = normalized;
      updateBrowserRef.current(browserIdRef.current, { url: normalized, lastError: null });
    };
    const handleTitleUpdated = (event: Event) => {
      const title =
        typeof (event as Event & { title?: unknown }).title === "string"
          ? ((event as Event & { title?: string }).title ?? "")
          : "";
      updateBrowserRef.current(browserIdRef.current, { title });
    };
    const handleFaviconUpdated = (event: Event) => {
      const favicons = Array.isArray((event as Event & { favicons?: unknown[] }).favicons)
        ? ((event as Event & { favicons?: string[] }).favicons ?? [])
        : [];
      updateBrowserRef.current(browserIdRef.current, { faviconUrl: favicons[0] ?? null });
    };
    const handleLoadFailed = (event: Event) => {
      const message = getWebviewLoadErrorMessage(event, browserErrorLabelsRef.current.failedToLoad);
      if (!message) {
        return;
      }
      updateBrowserRef.current(browserIdRef.current, {
        isLoading: false,
        lastError: message,
      });
      startPage.observeNavigation({ isLoading: false });
    };
    // SadTab::ShouldShow: every end but a clean exit, such as the task manager's SIGTERM.
    const handleRenderProcessGone = (event: Event) => {
      const details = (event as Event & { details?: { reason?: string; exitCode?: number } })
        .details;
      if (details?.reason === "clean-exit") return;
      setCrashedExitCode(details?.exitCode ?? 0);
      updateBrowserRef.current(browserIdRef.current, { isLoading: false });
    };
    const handleDomReady = () => {
      syncNavigationState();
      // The previous page's overlay is gone after a load; re-apply markers for
      // the freshly loaded document.
      const markers = annotationMarkersRef.current;
      if (markers.length > 0) {
        applyAnnotationMarkers(webview, markers);
      }
    };
    const handleWebviewFocus = () => {
      onFocusPane?.();
      webview.focus?.();
      const focusBrowser = getDesktopHost()?.browser?.focus;
      if (typeof focusBrowser === "function") {
        void focusBrowser(browserIdRef.current).catch((error) => {
          console.error("[browser-webview] focus failed", error);
        });
      }
    };

    webview.addEventListener("did-start-loading", handleStartLoading);
    webview.addEventListener("did-stop-loading", handleStopLoading);
    webview.addEventListener("will-navigate", handleWillNavigate);
    webview.addEventListener("did-navigate", handleNavigate);
    webview.addEventListener("did-navigate-in-page", handleNavigateInPage);
    webview.addEventListener("page-title-updated", handleTitleUpdated);
    webview.addEventListener("page-favicon-updated", handleFaviconUpdated);
    webview.addEventListener("did-fail-load", handleLoadFailed);
    webview.addEventListener("dom-ready", handleDomReady);
    webview.addEventListener("render-process-gone", handleRenderProcessGone);
    webview.addEventListener("focus", handleWebviewFocus);
    webview.addEventListener("mousedown", handleWebviewFocus);

    if (isPresentedRef.current) {
      rememberResolvedBrowserWebviewSize(browserId, webview);
    }
    if (initialUnsafeNavigationMessage) {
      updateBrowserRef.current(browserIdRef.current, {
        isLoading: false,
        lastError: initialUnsafeNavigationMessage,
      });
    }

    return () => {
      webview.removeEventListener("did-start-loading", handleStartLoading);
      webview.removeEventListener("did-stop-loading", handleStopLoading);
      webview.removeEventListener("will-navigate", handleWillNavigate);
      webview.removeEventListener("did-navigate", handleNavigate);
      webview.removeEventListener("did-navigate-in-page", handleNavigateInPage);
      webview.removeEventListener("page-title-updated", handleTitleUpdated);
      webview.removeEventListener("page-favicon-updated", handleFaviconUpdated);
      webview.removeEventListener("did-fail-load", handleLoadFailed);
      webview.removeEventListener("dom-ready", handleDomReady);
      webview.removeEventListener("render-process-gone", handleRenderProcessGone);
      webview.removeEventListener("focus", handleWebviewFocus);
      webview.removeEventListener("mousedown", handleWebviewFocus);
      const browserStillExists = Boolean(
        useBrowserStore.getState().browsersById[browserIdRef.current],
      );
      if (browserStillExists) {
        releaseResidentBrowserWebview(browserIdRef.current, webview);
      } else {
        removeResidentBrowserWebview(browserIdRef.current);
      }
      selectorControllerRef.current?.stopForWebview(webview);
      if (webviewRef.current === webview) {
        webviewRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [browserId, closeChromeToast, onFocusPane, drawsOwnPage]);

  useLayoutEffect(() => {
    const webview = webviewRef.current;
    if (!webview) {
      return;
    }
    if (!isPresented) {
      applyInactiveBrowserWebviewViewport(browserId, webview, browserViewport);
      return;
    }
    const host = webviewHostRef.current;
    const clip = webviewClipRef.current;
    if (host && clip) {
      presentBrowserWebview(browserId, webview, host, clip, browserViewport);
    }
    if (browserViewport.mode === "fixed") {
      rememberBrowserWebviewSize({
        browserId,
        width: browserViewport.width,
        height: browserViewport.height,
      });
    } else {
      rememberResolvedBrowserWebviewSize(browserId, webview);
    }
  }, [browserId, browserViewport, isPresented]);

  const navigate = useCallback(
    (nextUrl: string) => {
      const normalizedUrl = resolveAddressInput(nextUrl, defaultSearchEngine());
      // The new tab page has no address of its own. An extension's new tab page loads in the
      // guest under the start address; without one Helm draws its start page, like its own pages.
      const extensionNewTabUrl = newTabUrlRef.current;
      const isNewTabPage = isBrowserStartUrl(normalizedUrl);
      if (browserInternalPage(normalizedUrl) || (isNewTabPage && !extensionNewTabUrl)) {
        pendingNavigationUrlRef.current = null;
        const pageRecord = internalPageRecord(normalizedUrl);
        updateBrowserRef.current(browserIdRef.current, pageRecord);
        startPage.observeNavigation({
          ...pageRecord,
          requestId: pendingRequestIdRef.current ?? undefined,
        });
        return;
      }
      const guestUrl = isNewTabPage && extensionNewTabUrl ? extensionNewTabUrl : normalizedUrl;
      const webview = webviewRef.current;
      const unsafeNavigationMessage = getUnsafeNavigationMessage(guestUrl, browserErrorLabels);
      pendingNavigationUrlRef.current = unsafeNavigationMessage ? null : normalizedUrl;
      updateBrowserRef.current(browserIdRef.current, {
        url: normalizedUrl,
        isLoading: unsafeNavigationMessage === null,
        lastError: null,
      });
      if (unsafeNavigationMessage) {
        updateBrowserRef.current(browserIdRef.current, {
          isLoading: false,
          lastError: unsafeNavigationMessage,
        });
        startPage.observeNavigation({ isLoading: false });
        return;
      }
      if (webview?.loadURL) {
        void webview.loadURL(guestUrl).catch(() => {
          // A load that really failed reported itself through did-fail-load first. One that
          // didn't was given up: it turned into a download, or another navigation replaced it.
          // Chrome then keeps the page and its address as they were.
          const failedLoad =
            useBrowserStore.getState().browsersById[browserIdRef.current]?.lastError;
          if (failedLoad) {
            return;
          }
          pendingNavigationUrlRef.current = null;
          syncNavigationState();
          startPage.observeNavigation({ isLoading: false });
          startPage.cancelAddressEditing();
        });
        return;
      }
      if (webview) {
        webview.setAttribute("src", guestUrl);
      }
    },
    [browserErrorLabels, startPage, syncNavigationState],
  );

  useEffect(() => subscribeBrowserNavigation(browserId, navigate), [browserId, navigate]);

  const applyNavigationIntent = useCallback(
    (intent: BrowserNavigationIntent | null) => {
      if (!intent) return;
      pendingRequestIdRef.current = intent.requestId;
      if (intent.kind === "load") {
        navigate(intent.url);
        return;
      }
      if (intent.kind === "back") webviewRef.current?.goBack?.();
      if (intent.kind === "forward") webviewRef.current?.goForward?.();
      if (intent.kind === "reload") webviewRef.current?.reload?.();
      syncNavigationState();
    },
    [navigate, syncNavigationState],
  );

  const handleBack = useCallback(() => {
    applyNavigationIntent(startPage.goBack());
  }, [applyNavigationIntent, startPage]);

  const handleForward = useCallback(() => {
    applyNavigationIntent(startPage.goForward());
  }, [applyNavigationIntent, startPage]);

  const backButtonRef = useRef<View | null>(null);
  const forwardButtonRef = useRef<View | null>(null);
  // Chrome's back and forward buttons list the tab's history on a long press or a right-click.
  const showHistoryMenu = useCallback(
    async (direction: HistoryMenuDirection, anchor: View | null) => {
      const desktopHost = getDesktopHost();
      const history = await desktopHost?.browser?.getNavigationHistory?.(browserIdRef.current);
      const popup = desktopHost?.menu?.popup;
      if (!history || !popup) {
        return;
      }
      const items = historyMenuItems(history, direction);
      if (items.length === 0) {
        return;
      }
      const chosen = await popup({ items, ...menuAnchorBelow(anchor) });
      if (chosen !== null) {
        webviewRef.current?.goToIndex?.(Number(chosen));
      }
    },
    [],
  );
  const showBackMenu = useCallback(() => {
    void showHistoryMenu("back", backButtonRef.current);
  }, [showHistoryMenu]);
  const showForwardMenu = useCallback(() => {
    void showHistoryMenu("forward", forwardButtonRef.current);
  }, [showHistoryMenu]);
  const handleBackContextMenu = useCallback(
    (event: MouseEvent) => {
      event.preventDefault();
      showBackMenu();
    },
    [showBackMenu],
  );
  const handleForwardContextMenu = useCallback(
    (event: MouseEvent) => {
      event.preventDefault();
      showForwardMenu();
    },
    [showForwardMenu],
  );

  const openHome = useCallback(
    (disposition: BrowserClickDisposition) => {
      // Chrome navigates nowhere for an Alt-click on 首页.
      if (disposition === "saveToDisk") {
        return;
      }
      const homeAddress = homePageAddress(useBrowserToolbarSettingsStore.getState().homePage);
      if (disposition === "currentTab") {
        navigate(homeAddress ?? BROWSER_START_URL);
        return;
      }
      openBrowserFromPage({
        sourceBrowserId: browserIdRef.current,
        url: homeAddress,
        isActive: disposition === "newForegroundTab",
      });
    },
    [navigate],
  );
  const handleHome = useCallback(() => {
    openHome("currentTab");
  }, [openHome]);
  const handleHomePress = useCallback(
    (event: GestureResponderEvent) => {
      openHome(pressDisposition(event));
    },
    [openHome],
  );
  const handleHomeMiddleClick = useCallback(
    (event: MouseEvent) => {
      openHome(middleClickDisposition(event));
    },
    [openHome],
  );

  // Customize Chrome lives in this tab's side panel; Chrome opens one per tab.
  const showCustomizeChrome = useCallback((page: CustomizeChromePage) => {
    useBrowserSidePanelStore.getState().showCustomizeChrome(browserIdRef.current, page);
  }, []);
  const closeSidePanel = useCallback(() => {
    useBrowserSidePanelStore.getState().closeSidePanel(browserIdRef.current);
  }, []);
  const customizeToolbar = useCallback(() => {
    showCustomizeChrome("toolbar");
  }, [showCustomizeChrome]);

  // 首页 is pinned by its pref, so its menu offers 取消固定; a press and hold opens it too.
  const homeButtonRef = useRef<View | null>(null);
  const [isHomeMenuOpen, setIsHomeMenuOpen] = useState(false);
  const showHomeMenu = useCallback(async () => {
    setIsHomeMenuOpen(true);
    const choice = await chooseFromPinMenu({
      t,
      isPinned: true,
      isPinnable: true,
      anchor: menuAnchorBelow(homeButtonRef.current),
    });
    setIsHomeMenuOpen(false);
    if (choice === "unpin") {
      useBrowserToolbarSettingsStore.getState().setShowHomeButton(false);
    }
    if (choice === "customizeToolbar") {
      customizeToolbar();
    }
  }, [customizeToolbar, t]);
  const handleHomeLongPress = useCallback(() => {
    void showHomeMenu();
  }, [showHomeMenu]);
  const handleHomeContextMenu = useCallback(
    (event: MouseEvent) => {
      event.preventDefault();
      void showHomeMenu();
    },
    [showHomeMenu],
  );

  const copyPageLink = useCallback(() => {
    const pageUrl = browserRef.current?.url;
    if (!pageUrl) {
      return;
    }
    void Clipboard.setStringAsync(pageUrl);
    showChromeToast();
  }, [showChromeToast]);

  const handleRefresh = useCallback(() => {
    if (browser?.isLoading) {
      webviewRef.current?.stop?.();
      updateBrowser(browserId, { isLoading: false });
      startPage.observeNavigation({ isLoading: false });
      return;
    }
    applyNavigationIntent(startPage.reload());
  }, [applyNavigationIntent, browser?.isLoading, browserId, startPage, updateBrowser]);

  useEffect(() => {
    if (!isElectronRuntime() || !isInteractive) {
      return;
    }

    // ⌘L is the browser.page.focus-location binding, which applies only while focus is in the browser.
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isReloadShortcutKey(event)) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      handleRefresh();
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [handleRefresh, isInteractive]);

  useEffect(() => {
    if (!isElectronRuntime()) {
      return;
    }
    const unsubscribe = getDesktopHost()?.events?.on?.("browser-shortcut", (payload) => {
      if (!isDesktopBrowserShortcutEvent(payload)) {
        return;
      }
      if (payload.browserId) {
        if (payload.browserId !== browserIdRef.current) {
          return;
        }
        focusUrlBar();
        return;
      }
      if (!isInteractive) {
        return;
      }
      focusUrlBar();
    });

    if (typeof unsubscribe === "function") {
      return unsubscribe;
    }
    return () => {
      void unsubscribe?.then((dispose) => dispose());
    };
  }, [focusUrlBar, isInteractive]);

  // Loads an address in this tab the way the address bar does, so the bar shows it.
  const openUrlInTab = useCallback(
    (url: string) => {
      startPage.editDraft(url);
      const intent = startPage.submitDraft();
      applyNavigationIntent(intent);
    },
    [applyNavigationIntent, startPage],
  );

  const addElementAttachment = useCallback(
    (
      selection: BrowserElementSelection,
      annotation: BrowserElementAnnotation,
      screenshot?: AttachmentMetadata,
    ) => {
      if (!workspaceAttachmentScopeKey) {
        return;
      }
      setWorkspaceAttachments({
        scopeKey: workspaceAttachmentScopeKey,
        attachments: [
          ...workspaceAttachments,
          {
            kind: "browser_element",
            attachment: buildBrowserElementAttachment(selection, annotation, screenshot),
          },
        ],
      });
    },
    [setWorkspaceAttachments, workspaceAttachmentScopeKey, workspaceAttachments],
  );

  const captureElementScreenshot = useCallback(
    async (selection: BrowserElementSelection): Promise<AttachmentMetadata | undefined> => {
      const captureElement = getDesktopHost()?.browser?.captureElement;
      if (typeof captureElement !== "function") {
        return undefined;
      }
      const { x, y, width, height } = selection.boundingRect;
      if (width <= 0 || height <= 0) {
        return undefined;
      }
      try {
        const dataUrl = await captureElement(browserIdRef.current, { x, y, width, height });
        if (!dataUrl) {
          return undefined;
        }
        return await persistAttachmentFromDataUrl({
          dataUrl,
          mimeType: "image/png",
          fileName: `element-${selection.tag}.png`,
        });
      } catch (error) {
        console.warn("[browser-pane] captureElement failed", error);
        return undefined;
      }
    },
    [],
  );

  const screenshotElementToClipboard = useCallback(
    async (selection: BrowserElementSelection) => {
      const text = formatElementAttachment(selection);
      const copyElement = getDesktopHost()?.browser?.copyElement;
      const captureElement = getDesktopHost()?.browser?.captureElement;
      const { x, y, width, height } = selection.boundingRect;

      let imageDataUrl: string | undefined;
      if (typeof captureElement === "function" && width > 0 && height > 0) {
        try {
          const dataUrl = await captureElement(browserIdRef.current, { x, y, width, height });
          imageDataUrl = dataUrl ?? undefined;
        } catch (error) {
          console.warn("[browser-pane] capture element for screenshot failed", error);
        }
      }

      const copiedMessage = imageDataUrl
        ? t("workspace.browser.controls.screenshotCopied")
        : t("workspace.browser.controls.elementCopied");

      // Copy via the main process; the renderer's navigator.clipboard rejects
      // with NotAllowedError because focus is inside the guest <webview>.
      if (typeof copyElement === "function") {
        try {
          const ok = await copyElement({ text, imageDataUrl });
          if (ok) {
            toastRef.current?.show(copiedMessage, { variant: "success" });
          } else {
            toastRef.current?.error(t("workspace.browser.controls.screenshotFailed"));
          }
          return;
        } catch (error) {
          console.warn("[browser-pane] copyElement bridge failed", error);
        }
      }

      // Fallback to expo-clipboard (text only) when the bridge is unavailable.
      try {
        await Clipboard.setStringAsync(text);
        toastRef.current?.show(t("workspace.browser.controls.elementCopied"), {
          variant: "success",
        });
      } catch (error) {
        console.warn("[browser-pane] clipboard fallback failed", error);
        toastRef.current?.error(t("workspace.browser.controls.screenshotFailed"));
      }
    },
    [t],
  );

  const handleSelectorResult = useCallback(
    (selection: BrowserElementSelection, mode: "annotate" | "screenshot") => {
      if (mode === "screenshot") {
        void screenshotElementToClipboard(selection);
        return;
      }
      pendingScreenshotRef.current = undefined;
      setPendingSelection(selection);
      void captureElementScreenshot(selection).then((screenshot) => {
        pendingScreenshotRef.current = screenshot;
        return undefined;
      });
    },
    [captureElementScreenshot, screenshotElementToClipboard],
  );

  const submitAnnotation = useCallback(
    (annotation: BrowserElementAnnotation) => {
      const selection = pendingSelection;
      const screenshot = pendingScreenshotRef.current;
      pendingScreenshotRef.current = undefined;
      setPendingSelection(null);
      if (!selection) {
        return;
      }
      addElementAttachment(selection, annotation, screenshot);
    },
    [addElementAttachment, pendingSelection],
  );

  const cancelAnnotation = useCallback(() => {
    pendingScreenshotRef.current = undefined;
    setPendingSelection(null);
  }, []);

  const showSelectorFailure = useCallback(
    (reason: "loading" | "timeout" | "unavailable") => {
      const message =
        reason === "loading"
          ? t("workspace.browser.controls.selectorLoading")
          : t("workspace.browser.controls.selectorFailed");
      toastRef.current?.error(message);
    },
    [t],
  );

  const handleElementSelectorOutcome = useCallback(
    (outcome: ElementSelectorOutcome) => {
      setSelectorMode(null);
      if (outcome.type === "selected") {
        handleSelectorResult(outcome.selection, outcome.mode);
      } else if (outcome.type === "failed") {
        showSelectorFailure(outcome.reason);
      }
    },
    [handleSelectorResult, showSelectorFailure],
  );

  const startElementSelector = useCallback(
    (mode: "annotate" | "screenshot") => {
      if (mode === "annotate" && !workspaceAttachmentScopeKey) {
        showSelectorFailure("unavailable");
        return;
      }
      const webview = webviewRef.current;
      const controller = selectorControllerRef.current;
      if (!webview || !controller) {
        showSelectorFailure("unavailable");
        return;
      }

      const startResult = controller.start({
        webview,
        mode,
        onFinish: handleElementSelectorOutcome,
      });
      if (startResult !== "started") {
        showSelectorFailure(startResult);
        return;
      }

      pendingScreenshotRef.current = undefined;
      setPendingSelection(null);
      setSelectorMode(mode);
    },
    [handleElementSelectorOutcome, showSelectorFailure, workspaceAttachmentScopeKey],
  );

  const cancelElementSelector = useCallback(() => {
    selectorControllerRef.current?.cancel();
    setSelectorMode(null);
  }, []);

  const currentPageUrl = browser?.url ?? null;
  const annotationMarkers = useMemo<BrowserAnnotationMarker[]>(() => {
    if (!currentPageUrl) {
      return [];
    }
    const normalizedCurrent = normalizeWorkspaceBrowserUrl(currentPageUrl);
    const markers: BrowserAnnotationMarker[] = [];
    let index = 0;
    for (const attachment of workspaceAttachments) {
      if (attachment.kind !== "browser_element") {
        continue;
      }
      index += 1;
      if (normalizeWorkspaceBrowserUrl(attachment.attachment.url) !== normalizedCurrent) {
        continue;
      }
      markers.push({ index, selector: attachment.attachment.selector });
    }
    return markers;
  }, [currentPageUrl, workspaceAttachments]);

  const markersKey = useMemo(() => JSON.stringify(annotationMarkers), [annotationMarkers]);
  annotationMarkersRef.current = annotationMarkers;

  useEffect(() => {
    if (!isElectronRuntime()) {
      return;
    }
    const webview = webviewRef.current;
    if (!webview) {
      return;
    }
    if (annotationMarkers.length === 0) {
      clearAnnotationMarkers(webview);
      return;
    }
    applyAnnotationMarkers(webview, annotationMarkers);
    // markersKey captures the marker contents; re-run when they change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markersKey, currentPageUrl]);

  const handleToggleElementSelector = useCallback(() => {
    if (selectorActive) {
      cancelElementSelector();
      return;
    }
    startElementSelector("annotate");
  }, [cancelElementSelector, selectorActive, startElementSelector]);

  const handleToggleScreenshot = useCallback(() => {
    if (selectorActive) {
      cancelElementSelector();
      return;
    }
    startElementSelector("screenshot");
  }, [cancelElementSelector, selectorActive, startElementSelector]);

  const handleOpenDevTools = useCallback(() => {
    const currentBrowserId = browserIdRef.current;
    const openDevTools = getDesktopHost()?.browser?.openDevTools;
    if (typeof openDevTools !== "function") {
      console.warn("[browser-pane] openDevTools bridge missing", { browserId: currentBrowserId });
      return;
    }
    void openDevTools(currentBrowserId)
      .then((result) => {
        console.info("[browser-pane] openDevTools result", {
          browserId: currentBrowserId,
          result,
        });
        return undefined;
      })
      .catch((error: unknown) => {
        console.warn("[browser-pane] openDevTools failed", { browserId: currentBrowserId, error });
      });
  }, []);

  const selectedDeviceSizeId = useMemo(
    () => deviceSizeIdForViewport(browserViewport),
    [browserViewport],
  );
  const isResponsiveDevice = browserViewport.mode === "responsive";

  const handleSelectDeviceSize = useCallback(
    (deviceSizeId: DeviceSizeId) => {
      setBrowserViewport(browserId, viewportForDeviceSize(deviceSizeId));
    },
    [browserId, setBrowserViewport],
  );

  // Chrome's find bar belongs to the tab and remembers the last search when it reopens.
  const [isFindBarOpen, setIsFindBarOpen] = useState(false);
  const lastFindQueryRef = useRef("");
  const rememberFindQuery = useCallback((query: string) => {
    lastFindQueryRef.current = query;
  }, []);
  const openFindBar = useCallback(() => {
    if (webviewRef.current) setIsFindBarOpen(true);
  }, []);
  const closeFindBar = useCallback(() => setIsFindBarOpen(false), []);
  // A page Helm draws has nothing to find in.
  useEffect(() => {
    if (drawsOwnPage) setIsFindBarOpen(false);
  }, [drawsOwnPage]);

  // Returns the factor it set, so the ⋮ menu's zoom row can show it without reading it back.
  const zoomPage = useCallback((direction: 1 | -1 | 0): number | null => {
    const webview = webviewRef.current;
    if (!webview?.getZoomFactor || !webview.setZoomFactor) {
      return null;
    }
    const nextFactor =
      direction === 0 ? DEFAULT_ZOOM_FACTOR : nextZoomFactor(webview.getZoomFactor(), direction);
    webview.setZoomFactor(nextFactor);
    return nextFactor;
  }, []);

  // Chrome's full-screen button fills the screen with the browser window; here that is Helm's.
  const toggleWindowFullscreen = useCallback(() => {
    const currentWindow = getDesktopHost()?.window?.getCurrentWindow?.();
    const setFullscreen = currentWindow?.setFullscreen;
    if (!currentWindow?.isFullscreen || !setFullscreen) {
      return;
    }
    void currentWindow.isFullscreen().then((isFullscreen) => setFullscreen(!isFullscreen));
  }, []);
  const [isQrCodeOpen, setIsQrCodeOpen] = useState(false);
  const closeQrCode = useCallback(() => setIsQrCodeOpen(false), []);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const closeProfileMenu = useCallback(() => setIsProfileMenuOpen(false), []);

  const openInNewTab = useCallback((url: string) => {
    openBrowserFromPage({ sourceBrowserId: browserIdRef.current, url, isActive: true });
  }, []);
  const isOnNewTabPage = startSnapshot.phase === "start";
  // Chrome's ShowSingletonTabOverwritingNTP: the window's tab already on that page is selected
  // and sent there, a new tab page is used in place, and only otherwise does a tab open.
  const showSingletonPage = useCallback(
    (url: string) => {
      const existingBrowserId = findBrowserOnInternalPage({
        sourceBrowserId: browserIdRef.current,
        url,
      });
      if (existingBrowserId) {
        requestBrowserNavigation(existingBrowserId, url);
        revealBrowserPage(existingBrowserId);
        return;
      }
      if (isOnNewTabPage) {
        navigate(url);
        return;
      }
      openInNewTab(url);
    },
    [isOnNewTabPage, navigate, openInNewTab],
  );
  // What each of Chrome's commands does on this page; the ⋮ menu and the shortcuts share it.
  const browserCommands = useMemo<Record<BrowserCommand, () => void>>(
    () => ({
      // Chrome's new tab opens right after the current one; here that is the next column-3 tab.
      newTab: () =>
        openBrowserFromPage({ sourceBrowserId: browserIdRef.current, url: null, isActive: true }),
      reopenClosedTab: () => reopenClosedBrowser({ sourceBrowserId: browserIdRef.current }),
      showDownloads: () => showSingletonPage(BROWSER_DOWNLOADS_URL),
      focusLocation: focusUrlBar,
      back: handleBack,
      forward: handleForward,
      home: handleHome,
      importSettings: () => showSingletonPage(settingsUrl(IMPORT_DATA_ROUTE)),
      manageExtensions: () => showSingletonPage(BROWSER_EXTENSIONS_URL),
      visitWebStore: () => openInNewTab(CHROME_WEB_STORE_HOME_URL),
      zoomIn: () => zoomPage(1),
      zoomOut: () => zoomPage(-1),
      zoomReset: () => zoomPage(0),
      fullscreen: toggleWindowFullscreen,
      print: () => webviewRef.current?.print?.(),
      savePage: () => void getDesktopHost()?.browser?.savePage?.(browserIdRef.current),
      copyLink: copyPageLink,
      createQrCode: () => setIsQrCodeOpen(true),
      // IDC_CUSTOMIZE_CHROME, the profile's 自定义您的 Chrome, opens settings' 自定义个人资料; the
      // side panel is 更多工具's 自定义 Chrome.
      customizeChrome: () => showSingletonPage(settingsUrl(settingsSubpageRoute("manageProfile"))),
      showCustomizeChromeSidePanel: () => showCustomizeChrome("overview"),
      showAvatarMenu: () => setIsProfileMenuOpen(true),
      taskManager: () => {
        void openTaskManager(browserIdRef.current).catch((error: unknown) => {
          console.error("[browser-task-manager] open failed", error);
          toastRef.current?.error(t("workspace.browser.taskManager.openFailed"));
        });
      },
      find: openFindBar,
      cut: () => webviewRef.current?.cut?.(),
      copy: () => webviewRef.current?.copy?.(),
      paste: () => webviewRef.current?.paste?.(),
      devTools: handleOpenDevTools,
      clearBrowsingData: () => showSingletonPage(settingsUrl(CLEAR_BROWSER_DATA_ROUTE)),
      showSettings: () => showSingletonPage(BROWSER_SETTINGS_URL),
    }),
    [
      copyPageLink,
      focusUrlBar,
      handleBack,
      handleForward,
      handleHome,
      handleOpenDevTools,
      openFindBar,
      openInNewTab,
      showCustomizeChrome,
      showSingletonPage,
      toggleWindowFullscreen,
      zoomPage,
      t,
    ],
  );
  const runPinnedAction = useCallback(
    (action: BrowserPinnableAction) => {
      browserCommands[PINNED_ACTION_COMMANDS[action]]();
    },
    [browserCommands],
  );
  const runAppMenuChoice = useCallback(
    (choice: BrowserAppMenuChoice) => {
      if (choice.kind === "command") {
        browserCommands[choice.command]();
        return;
      }
      reopenClosedBrowser({
        sourceBrowserId: browserIdRef.current,
        closedIndex: choice.closedIndex,
      });
    },
    [browserCommands],
  );

  const appMenuButtonRef = useRef<View | null>(null);
  const avatarButtonRef = useRef<View | null>(null);
  const pageToolsButtonRef = useRef<View | null>(null);
  // The page's zoom while the ⋮ menu is open, null while it is closed.
  const [appMenuZoomFactor, setAppMenuZoomFactor] = useState<number | null>(null);
  const closeAppMenu = useCallback(() => setAppMenuZoomFactor(null), []);
  const handleAppMenuChoice = useCallback(
    (choice: BrowserAppMenuChoice): boolean => {
      const zoomDirection =
        choice.kind === "command" ? MENU_ZOOM_DIRECTIONS[choice.command] : undefined;
      if (zoomDirection === undefined) {
        runAppMenuChoice(choice);
        return false;
      }
      // Chrome's − and + leave the menu open to show the new percentage.
      const factor = zoomPage(zoomDirection);
      if (factor !== null) setAppMenuZoomFactor(factor);
      return true;
    },
    [runAppMenuChoice, zoomPage],
  );
  const showPageTools = useCallback(async () => {
    const choice = await chooseFromPageTools({
      t,
      selectorMode,
      deviceSizeId: selectedDeviceSizeId,
      anchor: menuAnchorBelow(pageToolsButtonRef.current),
    });
    if (choice?.kind === "annotate") handleToggleElementSelector();
    if (choice?.kind === "screenshot") handleToggleScreenshot();
    if (choice?.kind === "device") handleSelectDeviceSize(choice.deviceSizeId);
  }, [
    handleSelectDeviceSize,
    handleToggleElementSelector,
    handleToggleScreenshot,
    selectedDeviceSizeId,
    selectorMode,
    t,
  ]);
  const handleAppMenuPress = useCallback(() => {
    setAppMenuZoomFactor(webviewRef.current?.getZoomFactor?.() ?? DEFAULT_ZOOM_FACTOR);
  }, []);
  const handlePageToolsPress = useCallback(() => {
    void showPageTools();
  }, [showPageTools]);

  const handlePageShortcut = useCallback(
    (action: KeyboardActionDefinition): boolean => {
      const command = PAGE_SHORTCUT_COMMANDS[action.id as PageShortcutAction];
      if (!command) {
        return false;
      }
      browserCommands[command]();
      return true;
    },
    [browserCommands],
  );
  useKeyboardActionHandler({
    handlerId: buildWorkspaceKeyboardHandlerId({
      name: "browser-page",
      serverId,
      workspaceId,
      paneId: browserId,
    }),
    actions: BROWSER_PAGE_ACTIONS,
    enabled: Boolean(isInteractive),
    priority: 100,
    handle: handlePageShortcut,
  });

  const webviewHostStyle = useMemo<CSSProperties>(
    () =>
      isResponsiveDevice
        ? {
            display: "flex",
            flex: 1,
            width: "100%",
            height: "100%",
            minHeight: 0,
            minWidth: 0,
            overflow: "hidden",
            background: theme.colors.surface0,
          }
        : {
            // Fixed-size device frame, centered within webviewWrap (see styles).
            display: "flex",
            width: browserViewport.width,
            height: browserViewport.height,
            flexShrink: 0,
            minHeight: 0,
            minWidth: 0,
            overflow: "hidden",
            background: theme.colors.surface0,
            boxShadow: "0 2px 16px rgba(0,0,0,0.25)",
          },
    [browserViewport, isResponsiveDevice, theme.colors.surface0],
  );

  const webviewWrapStyle = useMemo(
    () => [styles.webviewWrap, !isResponsiveDevice && styles.webviewWrapDeviceFrame],
    [isResponsiveDevice],
  );

  const reloadCrashedPage = useCallback(() => {
    webviewRef.current?.reload?.();
  }, []);
  const setWebviewHostNode = useCallback((node: HTMLDivElement | null) => {
    webviewHostRef.current = node;
  }, []);

  const setWebviewClipNode = useCallback((node: unknown) => {
    webviewClipRef.current = node instanceof HTMLElement ? node : null;
  }, []);
  // The page area below the toolbar; Chrome centers a page's dialogs over it.
  const [contentElement, setContentElement] = useState<HTMLElement | null>(null);
  const customizeChromeTitle = t("workspace.browser.customizeChrome.title", {
    product: PRODUCT_NAME,
  });
  const sidePanel = useMemo(() => {
    if (!customizeChromePanel) {
      return null;
    }
    return {
      title: customizeChromeTitle,
      isOpen: customizeChromePanel.isOpen,
      onClose: closeSidePanel,
      content: (
        <CustomizeChromeContent page={customizeChromePanel.page} onShowPage={showCustomizeChrome} />
      ),
    };
  }, [closeSidePanel, customizeChromePanel, customizeChromeTitle, showCustomizeChrome]);

  if (!isElectronRuntime()) {
    return (
      <View style={styles.unavailableState}>
        <Text style={titleStyle}>{t("workspace.browser.unavailable.title")}</Text>
        <Text style={subtitleStyle}>{t("workspace.browser.unavailable.subtitle")}</Text>
      </View>
    );
  }

  let pageContent: ReactNode;
  if (internalPage === "downloads") {
    pageContent = <BrowserDownloadsPage isPresented={isPresented} />;
  } else if (internalPage === "extensions") {
    pageContent = (
      <BrowserExtensionsPage
        browserId={browserId}
        url={browser?.url ?? ""}
        onNavigate={openUrlInTab}
      />
    );
  } else if (internalPage === "settings") {
    pageContent = (
      <BrowserSettingsPage
        browserId={browserId}
        url={browser?.url ?? ""}
        isPresented={isPresented}
        onNavigate={openUrlInTab}
        onCustomizeToolbar={customizeToolbar}
      />
    );
  } else if (showStartPage) {
    pageContent = (
      <BrowserStartPage
        browserId={browserId}
        recentSites={startSnapshot.recentSites}
        onOpenSite={openUrlInTab}
      />
    );
  } else {
    pageContent = (
      <View
        ref={setWebviewClipNode}
        style={webviewWrapStyle}
        testID={`browser-webview-clip-${browserId}`}
      >
        {createElement("div", {
          ref: setWebviewHostNode,
          style: webviewHostStyle,
        })}
        {crashedExitCode !== null ? (
          <BrowserSadTab exitCode={crashedExitCode} onReload={reloadCrashedPage} />
        ) : null}
        {pendingSelection ? (
          <BrowserElementAnnotationCard
            anchor={webviewClipRef.current}
            selection={pendingSelection}
            onSubmit={submitAnnotation}
            onCancel={cancelAnnotation}
          />
        ) : null}
      </View>
    );
  }

  return (
    <BrowserDialogHostProvider value={contentElement}>
      <View dataSet={BROWSER_PAGE_DATA_SET} style={styles.container}>
        <View style={styles.toolbar}>
          <ChromeToolbarButton
            ref={backButtonRef}
            label={t("workspace.browser.controls.back")}
            tooltip={t("workspace.browser.controls.backTooltip")}
            isDisabled={!startSnapshot.canGoBack}
            onPress={handleBack}
            onLongPress={showBackMenu}
            onContextMenu={handleBackContextMenu}
            testID="browser-back"
          >
            <ThemedChromeIcon
              name="back"
              size={CHROME_LAYOUT.toolbarIconSize}
              uniProps={startSnapshot.canGoBack ? toolbarIconMapping : toolbarDisabledIconMapping}
            />
          </ChromeToolbarButton>
          {showForwardButton ? (
            <ChromeToolbarButton
              ref={forwardButtonRef}
              label={t("workspace.browser.controls.forward")}
              tooltip={t("workspace.browser.controls.forwardTooltip")}
              isDisabled={!startSnapshot.canGoForward}
              onPress={handleForward}
              onLongPress={showForwardMenu}
              onContextMenu={handleForwardContextMenu}
              testID="browser-forward"
            >
              <ThemedChromeIcon
                name="forward"
                size={CHROME_LAYOUT.toolbarIconSize}
                uniProps={
                  startSnapshot.canGoForward ? toolbarIconMapping : toolbarDisabledIconMapping
                }
              />
            </ChromeToolbarButton>
          ) : null}
          <ChromeToolbarButton
            label={t("workspace.browser.controls.reload")}
            tooltip={
              browser?.isLoading
                ? t("workspace.browser.controls.stopTooltip")
                : t("workspace.browser.controls.reloadTooltip")
            }
            onPress={handleRefresh}
            testID="browser-reload"
          >
            <ThemedChromeIcon
              name={browser?.isLoading ? "stop" : "reload"}
              size={CHROME_LAYOUT.toolbarIconSize}
              uniProps={toolbarIconMapping}
            />
          </ChromeToolbarButton>
          {showHomeButton ? (
            <ChromeToolbarButton
              ref={homeButtonRef}
              label={t("workspace.browser.controls.home")}
              tooltip={t("workspace.browser.controls.homeTooltip")}
              isActive={isHomeMenuOpen}
              onPress={handleHomePress}
              onLongPress={handleHomeLongPress}
              onContextMenu={handleHomeContextMenu}
              onMiddleClick={handleHomeMiddleClick}
              testID="browser-home"
            >
              <ThemedChromeIcon
                name="home"
                size={CHROME_LAYOUT.toolbarIconSize}
                uniProps={toolbarIconMapping}
              />
            </ChromeToolbarButton>
          ) : null}
          <View style={styles.omnibox}>
            <BrowserAddressBar
              page={startPage}
              snapshot={startSnapshot}
              inputRef={urlInputRef}
              isPresented={isPresented}
              onNavigate={applyNavigationIntent}
            />
          </View>
          <BrowserExtensionsToolbar
            browserId={browserId}
            onShowExtensionsPage={showSingletonPage}
          />
          <BrowserPinnedActionsToolbar
            browserId={browserId}
            isPresented={isPresented}
            page={contentElement}
            onShowDownloadsPage={browserCommands.showDownloads}
            isCustomizeChromeOpen={customizeChromePanel?.isOpen ?? false}
            onRunAction={runPinnedAction}
            onToggleCustomizeChrome={closeSidePanel}
            onCustomizeToolbar={customizeToolbar}
          />
          <ChromeToolbarButton
            ref={pageToolsButtonRef}
            label={t("workspace.browser.controls.tools", { product: PRODUCT_NAME })}
            isActive={selectorMode !== null}
            onPress={handlePageToolsPress}
            testID="browser-page-tools"
          >
            <ThemedPageToolsIcon
              size={CHROME_LAYOUT.toolbarIconSize}
              uniProps={toolbarIconMapping}
            />
          </ChromeToolbarButton>
          <AvatarToolbarButton
            ref={avatarButtonRef}
            isMenuOpen={isProfileMenuOpen}
            onPress={browserCommands.showAvatarMenu}
          />
          <ChromeToolbarButton
            ref={appMenuButtonRef}
            label={t("workspace.browser.appMenu.button", { product: PRODUCT_NAME })}
            isActive={appMenuZoomFactor !== null}
            onPress={handleAppMenuPress}
            testID="browser-app-menu"
          >
            <ThemedChromeIcon
              name="appMenu"
              size={CHROME_LAYOUT.toolbarIconSize}
              uniProps={toolbarIconMapping}
            />
          </ChromeToolbarButton>
        </View>
        {browser?.lastError ? (
          <View style={styles.errorRow}>
            <Text numberOfLines={1} style={errorTextStyle}>
              {browser.lastError}
            </Text>
          </View>
        ) : null}
        <BrowserSidePanelLayout panel={sidePanel} onPageElement={setContentElement}>
          {pageContent}
        </BrowserSidePanelLayout>
        {isPresented ? <ExtensionInstallPromptDialog browserId={browserId} /> : null}
        {isPresented && appMenuZoomFactor !== null ? (
          <BrowserAppMenu
            anchor={elementOf(appMenuButtonRef.current)}
            zoomFactor={appMenuZoomFactor}
            onChoice={handleAppMenuChoice}
            onClose={closeAppMenu}
          />
        ) : null}
        {isPresented && isProfileMenuOpen ? (
          <ProfileMenu
            anchor={elementOf(avatarButtonRef.current)}
            onCustomizeProfile={browserCommands.customizeChrome}
            onClose={closeProfileMenu}
          />
        ) : null}
        {isPresented && isQrCodeOpen && browser?.url ? (
          <QrCodeBubble
            anchor={elementOf(appMenuButtonRef.current)}
            browserId={browserId}
            url={browser.url}
            onClose={closeQrCode}
          />
        ) : null}
        {shownChromeToast ? (
          <ChromeToast
            key={shownChromeToast.id}
            toast={shownChromeToast}
            icon="copyLink"
            text={t("workspace.browser.toolbarActions.linkCopied")}
            page={contentElement}
            isHidden={startSnapshot.addressFocused}
            onTimeout={closeChromeToast}
            onExited={handleChromeToastExited}
          />
        ) : null}
        {isPresented && isFindBarOpen ? (
          <BrowserFindBar
            webview={webviewRef.current}
            initialQuery={lastFindQueryRef.current}
            onQueryChange={rememberFindQuery}
            onClose={closeFindBar}
          />
        ) : null}
      </View>
    </BrowserDialogHostProvider>
  );
}

function BrowserElementAnnotationCard({
  anchor,
  selection,
  onSubmit,
  onCancel,
}: {
  anchor: HTMLElement | null;
  selection: BrowserElementSelection;
  onSubmit: (annotation: BrowserElementAnnotation) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const bounds = useElementBounds(anchor);
  const [comment, setComment] = useState("");
  const commentRef = useRef(comment);
  commentRef.current = comment;

  const handleSubmit = useCallback(() => {
    onSubmit({ comment: commentRef.current });
  }, [onSubmit]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onCancel();
        return;
      }
      if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        event.stopPropagation();
        handleSubmit();
      }
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [handleSubmit, onCancel]);

  const elementText = truncateText(selection.text.trim().replace(/\s+/g, " "), 60);
  const elementLabel = elementText ? `${selection.tag} · ${elementText}` : selection.tag;

  if (!bounds) {
    return null;
  }

  return createPortal(
    <View style={[styles.annotationOverlay, bounds]} pointerEvents="box-none">
      <View style={styles.annotationCard}>
        <View style={styles.annotationHeader}>
          <Text numberOfLines={1} style={styles.annotationTitle}>
            {t("workspace.browser.annotate.title")}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("workspace.browser.annotate.cancel")}
            onPress={onCancel}
            style={styles.annotationCloseButton}
          >
            <ThemedCloseIcon size={16} uniProps={iconForegroundMutedMapping} />
          </Pressable>
        </View>
        <Text numberOfLines={1} style={styles.annotationElement}>
          {elementLabel}
        </Text>
        <ThemedAnnotationInput
          accessibilityLabel={t("workspace.browser.annotate.placeholder")}
          autoFocus
          multiline
          onChangeText={setComment}
          placeholder={t("workspace.browser.annotate.placeholder")}
          style={styles.annotationInput}
          uniProps={annotationInputMapping}
          initialValue={comment}
        />
        <View style={styles.annotationActions}>
          <Button variant="ghost" size="sm" onPress={onCancel}>
            {t("workspace.browser.annotate.cancel")}
          </Button>
          <Button variant="default" size="sm" onPress={handleSubmit}>
            {t("workspace.browser.annotate.submit")}
          </Button>
        </View>
      </View>
    </View>,
    getOverlayRoot(),
  );
}

const ThemedChromeIcon = withUnistyles(ChromeIcon);
const ThemedPageToolsIcon = withUnistyles(MousePointerClick);
const toolbarIconMapping = chromeColorProps("toolbarIcon");
const toolbarDisabledIconMapping = chromeColorProps("toolbarIconDisabled");
const ThemedCloseIcon = withUnistyles(X);
const ThemedAnnotationInput = withUnistyles(TextInput);
const iconForegroundMutedMapping = (theme: { colors: { foregroundMuted: string } }) => ({
  color: theme.colors.foregroundMuted,
});
const annotationInputMapping = (theme: { colors: { foregroundMuted: string } }) => ({
  placeholderTextColor: theme.colors.foregroundMuted,
});

const styles = StyleSheet.create((theme) => ({
  container: {
    flex: 1,
    minHeight: 0,
    backgroundColor: theme.colors.surface0,
  },
  // Chrome's toolbar (layout_constants.cc): 46 tall, 34 dip buttons 2 apart, 6 at the edges,
  // 9 between a button and the omnibox. The page area below draws the separator line.
  toolbar: {
    height: CHROME_LAYOUT.toolbarHeight,
    flexDirection: "row",
    alignItems: "center",
    gap: CHROME_LAYOUT.toolbarButtonSpacing,
    paddingHorizontal: CHROME_LAYOUT.toolbarEdgePadding,
    backgroundColor: theme.chrome.toolbar,
  },
  omnibox: {
    flex: 1,
    minWidth: 0,
    marginHorizontal: CHROME_LAYOUT.locationBarMargin - CHROME_LAYOUT.toolbarButtonSpacing,
  },
  startPage: {
    flex: 1,
    minHeight: 0,
    alignItems: "center",
    paddingTop: theme.spacing[16],
    backgroundColor: theme.colors.surface1,
  },
  startContent: {
    width: START_PAGE_CONTENT_WIDTH,
    maxWidth: "100%",
    gap: theme.spacing[6],
  },
  startSectionLabel: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
  },
  startSiteHovered: {
    backgroundColor: theme.colors.surface2,
  },
  startSites: {
    flexDirection: "row",
    gap: theme.spacing[6],
  },
  startSite: {
    width: 96,
    alignItems: "center",
    gap: theme.spacing[2],
  },
  startSiteIcon: {
    width: 28,
    height: 28,
    borderRadius: theme.borderRadius.md,
  },
  startSiteLabel: {
    width: "100%",
    fontSize: theme.fontSize.sm,
    textAlign: "center",
  },
  errorRow: {
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[1],
    borderTopWidth: 1,
    borderTopColor: theme.chrome.contentSeparator,
    backgroundColor: theme.colors.surface0,
  },
  metaError: {
    fontSize: theme.fontSize.sm,
  },
  webviewWrap: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    overflow: "hidden",
  },
  // When a fixed device size is active, center the framed webview both axes over
  // a muted backdrop instead of left-aligning it.
  webviewWrapDeviceFrame: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.surface1,
    padding: theme.spacing[3],
  },
  annotationOverlay: {
    position: "absolute",
    zIndex: 1,
    padding: theme.spacing[3],
    alignItems: "center",
    justifyContent: "flex-end",
  },
  annotationCard: {
    width: "100%",
    maxWidth: 420,
    gap: theme.spacing[2],
    padding: theme.spacing[3],
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface0,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
  },
  annotationHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[2],
  },
  annotationTitle: {
    flex: 1,
    fontSize: theme.fontSize.base,
    fontWeight: "600",
    color: theme.colors.foreground,
  },
  annotationCloseButton: {
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.borderRadius.md,
  },
  annotationElement: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.foregroundMuted,
    marginBottom: theme.spacing[2],
  },
  annotationInput: {
    minHeight: 64,
    fontSize: theme.fontSize.base,
    color: theme.colors.foreground,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface1,
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[2],
    textAlignVertical: "top",
  },
  annotationActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: theme.spacing[2],
  },
  unavailableState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 8,
  },
  unavailableTitle: {
    fontSize: theme.fontSize.base,
    fontWeight: "600",
  },
  unavailableSubtitle: {
    fontSize: theme.fontSize.sm,
  },
}));
