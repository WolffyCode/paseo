import { Platform } from "react-native";
import { getElectronHost } from "@/desktop/electron/host";
import type { BrowserKeyboardPolicy } from "@/desktop/browser/shortcuts";
import type { SessionInboundMessage, SessionOutboundMessage } from "@getpaseo/protocol/messages";

type BrowserAutomationExecuteRequest = Extract<
  SessionOutboundMessage,
  { type: "browser.automation.execute.request" }
>;
type BrowserAutomationExecuteResponse = Extract<
  SessionInboundMessage,
  { type: "browser.automation.execute.response" }
>;

export type DesktopNotificationPermission = "granted" | "denied" | "default";
export type DesktopWindowChromeMode = "native-mac" | "custom-windows" | "custom-linux";

export interface DesktopDialogAskOptions {
  title?: string;
  okLabel?: string;
  cancelLabel?: string;
  kind?: "info" | "warning" | "error";
}

export interface DesktopDialogOpenOptions {
  title?: string;
  defaultPath?: string;
  directory?: boolean;
  createDirectory?: boolean;
  multiple?: boolean;
  filters?: Array<{
    name: string;
    extensions: string[];
  }>;
}

export interface DesktopDialogAskWithCheckboxOptions extends DesktopDialogAskOptions {
  checkboxLabel: string;
  checkboxChecked?: boolean;
}

export interface DesktopDialogAskWithCheckboxResult {
  confirmed: boolean;
  dontAskAgain: boolean;
}

export interface DesktopDialogBridge {
  ask?: (message: string, options?: DesktopDialogAskOptions) => Promise<boolean>;
  askWithCheckbox?: (
    message: string,
    options: DesktopDialogAskWithCheckboxOptions,
  ) => Promise<DesktopDialogAskWithCheckboxResult>;
  open?: (options?: DesktopDialogOpenOptions) => Promise<string | string[] | null>;
}

export interface DesktopNotificationBridge {
  isSupported?: () => Promise<boolean>;
  sendNotification?: (
    payload: string | { title: string; body?: string; data?: Record<string, unknown> },
  ) => Promise<boolean>;
}

export interface DesktopOpenerBridge {
  openUrl?: (url: string) => Promise<void>;
}

export interface DesktopEditorTargetDescriptor {
  id: string;
  label: string;
  kind: "editor" | "file-manager";
  icon: { kind: "image"; dataUrl: string } | { kind: "symbol"; name: "folder" | "terminal" };
}

export interface DesktopEditorOpenTargetInput {
  editorId: string;
  workspacePath: string;
  filePath?: string;
  line?: number;
  column?: number;
}

export interface DesktopEditorBridge {
  listTargets?: () => Promise<DesktopEditorTargetDescriptor[]>;
  openTarget?: (input: DesktopEditorOpenTargetInput) => Promise<void>;
}

export interface DesktopWebUtilsBridge {
  getPathForFile?: (file: File) => string;
}

/** One row of a native menu; `id` comes back from `popup` when the row is chosen. */
export interface DesktopNativeMenuItem {
  id?: string;
  label?: string;
  kind?: "item" | "separator" | "checkbox";
  isEnabled?: boolean;
  isChecked?: boolean;
  /** A shortcut shown beside the label (Electron accelerator syntax); the menu doesn't bind it. */
  accelerator?: string;
  submenu?: DesktopNativeMenuItem[];
}

export interface DesktopMenuBridge {
  showContextMenu?: (input?: { kind?: "terminal"; hasSelection?: boolean }) => Promise<void>;
  setCapturingShortcut?: (capturing: boolean) => Promise<void>;
  /** Shows a native menu at a window point (default: the pointer); resolves with the chosen id. */
  popup?: (input: {
    items: DesktopNativeMenuItem[];
    x?: number;
    y?: number;
  }) => Promise<string | null>;
}

export interface DesktopWindowChromeUpdate {
  backgroundColor?: string;
  trafficLightOffsetY?: number;
}

export interface DesktopWindowBridge {
  label?: string;
  minimize?: () => Promise<void>;
  close?: () => Promise<void>;
  toggleMaximize?: () => Promise<void>;
  isMaximized?: () => Promise<boolean>;
  setFullscreen?: (fullscreen: boolean) => Promise<void>;
  isFullscreen?: () => Promise<boolean>;
  updateChrome?: (update: DesktopWindowChromeUpdate) => Promise<void>;
  onResized?: <TEvent = unknown>(
    handler: (event: TEvent) => void,
  ) => Promise<() => void> | (() => void);
  setBadgeCount?: (count?: number) => Promise<void>;
  onDragDropEvent?: <TEvent = unknown>(
    handler: (event: TEvent) => void,
  ) => Promise<() => void> | (() => void);
}

export interface DesktopWindowModuleBridge {
  openNew?: (options?: { pendingOpenProjectPath?: string | null }) => Promise<void>;
  getCurrentWindow?: () => DesktopWindowBridge;
}

export interface DesktopEventsBridge {
  on?: (event: string, handler: (payload: unknown) => void) => Promise<() => void> | (() => void);
}

export interface DesktopAgentNavigationBridge {
  ready?: () => Promise<{ serverId: string; agentId: string } | null>;
}

export type DesktopBrowserShortcutEvent =
  | { browserId?: string; action: "focus-url" }
  | { browserId: string; action: "new-tab" };

export interface DesktopBrowserNewTabRequestEvent {
  sourceBrowserId: string;
  url: string;
  /** False for a tab Chrome opens behind the page: a ⌘-click, a middle click, 在新标签页中打开链接. */
  isActive: boolean;
}

export interface DesktopAttachedBrowserRegistration {
  browserId: string;
  workspaceId: string;
  webContentsId: number;
}

/** An extension installed in the browser profile. */
export interface DesktopBrowserExtension {
  id: string;
  name: string;
  version: string;
  description: string;
  iconDataUrl: string | null;
  optionsUrl: string | null;
  /** The extension's own website (manifest homepage_url), if it names one. */
  websiteUrl: string | null;
  isEnabled: boolean;
  permissions: DesktopBrowserExtensionPermissionRequest;
}

/** What an extension asks for at install; Chrome's install prompt turns it into warnings. */
export interface DesktopBrowserExtensionPermissionRequest {
  apiPermissions: string[];
  hostPatterns: string[];
  overridesNewTabPage: boolean;
  homepageUrl: string | null;
  searchUrl: string | null;
  startupPageUrl: string | null;
}

/** The Chrome Web Store asked to install an extension from the page `browserId`. */
export interface DesktopBrowserExtensionInstallPrompt {
  requestId: number;
  browserId: string;
  extensionId: string;
  name: string;
  iconDataUrl: string;
  permissions: DesktopBrowserExtensionPermissionRequest;
}

/** A tab change an extension asked for (chrome.tabs / chrome.windows). */
export type DesktopBrowserExtensionTabRequest =
  | {
      kind: "create";
      requestId: number;
      url: string | null;
      isActive: boolean;
      nearBrowserId: string | null;
    }
  | { kind: "select"; browserId: string }
  | { kind: "close"; browserId: string };

/** One extension's toolbar action, as electron-chrome-extensions reports it. */
export interface DesktopBrowserExtensionActionDetails {
  title?: string;
  text?: string;
  color?: string | number[];
  popup?: string;
  iconModified?: number;
}

export interface DesktopBrowserExtensionAction extends DesktopBrowserExtensionActionDetails {
  id: string;
  /** Per-tab overrides, keyed by the tab's guest WebContents id. */
  tabs: Record<string, DesktopBrowserExtensionActionDetails>;
}

export interface DesktopBrowserExtensionActionState {
  activeTabId?: number;
  actions: DesktopBrowserExtensionAction[];
}

export interface DesktopBrowserExtensionsBridge {
  list: () => Promise<DesktopBrowserExtension[]>;
  getNewTabUrl: () => Promise<string | null>;
  /** Installs from the Chrome Web Store by id, without the store page's prompt. */
  install: (extensionId: string) => Promise<"installed" | "already-installed" | "failed">;
  remove: (extensionId: string) => Promise<boolean>;
  setEnabled: (extensionId: string, isEnabled: boolean) => Promise<void>;
  reportCreatedTab: (input: { requestId: number; browserId: string | null }) => Promise<void>;
  decideInstall: (input: { requestId: number; isAllowed: boolean }) => Promise<void>;
  getActionState: () => Promise<DesktopBrowserExtensionActionState>;
  /** Clicks an extension's toolbar button; a popup opens under `anchorRect` (window points). */
  activateAction: (details: {
    eventType: "click";
    extensionId: string;
    tabId: number;
    anchorRect: { x: number; y: number; width: number; height: number };
  }) => Promise<void>;
  observeActions: (listener: () => void) => () => void;
}

/** A page's session history: its entries, oldest first, and the one shown. */
export interface DesktopBrowserNavigationHistory {
  activeIndex: number;
  entries: Array<{ url: string; title: string }>;
}

/** A Chrome profile the import dialog offers, by its folder in Chrome's user data. */
export interface DesktopChromeProfile {
  directory: string;
  name: string;
}

/** What importing copies from one Chrome profile. */
export interface DesktopChromeImportData {
  /** Null where the profile kept Chrome's default. */
  showHomeButton: boolean | null;
  homePageIsNewTabPage: boolean | null;
  homePage: string | null;
  showForwardButton: boolean | null;
  /** Chrome's action ids ("kActionDevTools"), in toolbar order. */
  pinnedActions: string[];
  pinnedExtensionIds: string[];
  /** Turned-on Chrome Web Store extensions, named as Chrome shows them. */
  extensions: Array<{ id: string; name: string | null }>;
}

/** Reads the user's Chrome profiles; only the import dialog calls it. */
export interface DesktopChromeImportBridge {
  listProfiles: () => Promise<DesktopChromeProfile[]>;
  read: (directory: string, uiLocale: string) => Promise<DesktopChromeImportData | null>;
}

/** One download from the browser session, as the main process reports it. */
export interface DesktopBrowserDownload {
  id: string;
  url: string;
  /** The page that started it; its window shows the download bubble. */
  browserId: string | null;
  /** The site of that page, for the downloads page's 来自 line. */
  initiatorOrigin: string | null;
  fileName: string;
  filePath: string;
  /** 0 when the server sent no length. */
  totalBytes: number;
  receivedBytes: number;
  bytesPerSecond: number;
  state: "in_progress" | "complete" | "cancelled" | "interrupted";
  /** "shutdown" for a download cut off by quitting; Electron names no other reason. */
  interruptReason: "shutdown" | "unknown" | null;
  isPaused: boolean;
  canResume: boolean;
  /** Chrome's 完成后打开. */
  openWhenDone: boolean;
  startTime: number;
  endTime: number | null;
  /** A finished file that was moved or deleted since. */
  isFileMissing: boolean;
  /** Chrome's 总是打开此类文件 is ticked for this file's type. */
  opensTypeAutomatically: boolean;
  /** The type may open by itself at all; dangerous types never do. */
  canOpenTypeAutomatically: boolean;
}

export interface DesktopBrowserDownloadsBridge {
  list: () => Promise<DesktopBrowserDownload[]>;
  pause: (downloadId: string) => Promise<void>;
  resume: (downloadId: string) => Promise<void>;
  cancel: (downloadId: string) => Promise<void>;
  retry: (downloadId: string) => Promise<void>;
  open: (downloadId: string) => Promise<void>;
  showInFolder: (downloadId: string) => Promise<void>;
  /** Takes the entry off the list; the file stays. */
  remove: (downloadId: string) => Promise<void>;
  clearAll: () => Promise<void>;
  /** Puts back the entries the last removal took off. */
  undoRemove: () => Promise<void>;
  setOpenWhenDone: (downloadId: string, openWhenDone: boolean) => Promise<void>;
  setOpensTypeAutomatically: (downloadId: string, opensType: boolean) => Promise<void>;
  /** The Finder icon of a finished file as a data URL, or null. */
  fileIcon: (downloadId: string) => Promise<string | null>;
  /** Downloads `url` from the page `browserId` shows, saving it under `fileName`. */
  downloadNamed: (browserId: string, url: string, fileName: string) => Promise<void>;
  /** 删除浏览数据: takes entries started at or after `since` off the list. */
  deleteHistory: (since: number) => Promise<void>;
  /** Settings' 下载内容: the download folder and whether each download asks where to save. */
  settings: () => Promise<DesktopBrowserDownloadSettings>;
  /** Lets the user pick the download folder; resolves to the settings afterwards. */
  chooseDirectory: () => Promise<DesktopBrowserDownloadSettings>;
  setPromptForDownload: (promptForDownload: boolean) => Promise<DesktopBrowserDownloadSettings>;
  /** 下载完成后显示下载内容: whether finished downloads open the partial view. */
  setPartialViewEnabled: (isEnabled: boolean) => Promise<DesktopBrowserDownloadSettings>;
}

export interface DesktopBrowserDownloadSettings {
  directory: string;
  promptForDownload: boolean;
  partialViewEnabled: boolean;
}

/** The profile's site data and cache, for Chrome's 删除浏览数据. */
export interface DesktopBrowsingDataBridge {
  counts: () => Promise<{ cacheBytes: number; cookieDomains: string[] }>;
  /** Deletes for `origins` only, or for every site when null. */
  clear: (request: {
    siteData: boolean;
    cache: boolean;
    origins: string[] | null;
  }) => Promise<void>;
}

/** Chrome's page context menu labels in the app's language, for the main process to show. */
export interface DesktopBrowserPageMenuLabels {
  back: string;
  forward: string;
  reload: string;
  savePageAs: string;
  print: string;
  viewPageSource: string;
  inspect: string;
  openLinkInNewTab: string;
  saveLinkAs: string;
  copyLinkAddress: string;
  copyEmailAddress: string;
  openImageInNewTab: string;
  saveImageAs: string;
  copyImage: string;
  copyImageAddress: string;
  copy: string;
  /** Keeps a `{{terms}}` slot for the selected text. */
  searchWebFor: string;
  undo: string;
  redo: string;
  cut: string;
  paste: string;
  pasteAndMatchStyle: string;
  selectAll: string;
  addToDictionary: string;
}

export interface DesktopBrowserBridge {
  setShortcutPolicy?: (input: BrowserKeyboardPolicy) => Promise<void>;
  setPageMenuLabels?: (labels: DesktopBrowserPageMenuLabels) => Promise<void>;
  readonly profilePartition?: string;
  registerAttachedBrowser?: (input: DesktopAttachedBrowserRegistration) => Promise<void>;
  unregisterWorkspaceBrowser?: (browserId: string) => Promise<void>;
  setWorkspaceActiveBrowser?: (input: {
    workspaceId: string;
    browserId: string | null;
  }) => Promise<void>;
  focus?: (browserId: string) => Promise<boolean>;
  openDevTools?: (browserId: string) => Promise<unknown>;
  /** Chrome's 网页另存为…: asks where, then saves the page with its resources. */
  savePage?: (browserId: string) => Promise<void>;
  browsingData?: DesktopBrowsingDataBridge;
  /** The page's session history, for Chrome's back and forward menus. */
  getNavigationHistory?: (browserId: string) => Promise<DesktopBrowserNavigationHistory | null>;
  clearProfile?: (legacyBrowserIds: string[]) => Promise<void>;
  executeAutomationCommand?: (
    request: BrowserAutomationExecuteRequest,
  ) => Promise<BrowserAutomationExecuteResponse["payload"]>;
  /** Capture a PNG screenshot of the guest viewport cropped to `rect`. */
  captureElement?: (
    browserId: string,
    rect: { x: number; y: number; width: number; height: number },
  ) => Promise<string | null>;
  /** Copy element text and/or an image to the system clipboard from main. */
  copyElement?: (payload: { text?: string; imageDataUrl?: string }) => Promise<boolean>;
  chromeImport?: DesktopChromeImportBridge;
  downloads?: DesktopBrowserDownloadsBridge;
  extensions?: DesktopBrowserExtensionsBridge;
}

export interface DesktopInvokeBridge {
  invoke?: (command: string, args?: Record<string, unknown>) => Promise<unknown>;
}

export interface DesktopHostBridge {
  platform?: string;
  windowChromeMode?: string;
  invoke?: DesktopInvokeBridge["invoke"];
  getPendingOpenProject?: () => Promise<string | null>;
  agentNavigation?: DesktopAgentNavigationBridge;
  events?: DesktopEventsBridge;
  window?: DesktopWindowModuleBridge;
  dialog?: DesktopDialogBridge;
  notification?: DesktopNotificationBridge;
  opener?: DesktopOpenerBridge;
  editor?: DesktopEditorBridge;
  webUtils?: DesktopWebUtilsBridge;
  menu?: DesktopMenuBridge;
  browser?: DesktopBrowserBridge;
}

declare global {
  interface Window {
    paseoDesktop?: DesktopHostBridge;
  }
}

export function getDesktopHost(): DesktopHostBridge | null {
  if (Platform.OS !== "web") {
    return null;
  }
  return getElectronHost();
}

export function isElectronRuntime(): boolean {
  return getDesktopHost() !== null;
}

export function isElectronRuntimeMac(): boolean {
  if (!isElectronRuntime()) {
    return false;
  }
  if (typeof navigator === "undefined") {
    return false;
  }
  const hostPlatform = getDesktopHost()?.platform?.toLowerCase();
  if (hostPlatform === "darwin" || hostPlatform === "mac" || hostPlatform === "macos") {
    return true;
  }
  const ua = navigator.userAgent;
  return ua.includes("Mac OS") || ua.includes("Macintosh");
}

export function getDesktopWindowChromeMode(): DesktopWindowChromeMode | null {
  const host = getDesktopHost();
  if (!host) return null;
  const mode = host.windowChromeMode;
  if (mode === "native-mac" || mode === "custom-windows" || mode === "custom-linux") {
    return mode;
  }
  // COMPAT(windowChromeMode): added in v0.5.3; remove after 2026-11-25.
  if (isElectronRuntimeMac()) return "native-mac";
  if (host.platform?.toLowerCase() === "linux") return "custom-linux";
  return "custom-windows";
}
