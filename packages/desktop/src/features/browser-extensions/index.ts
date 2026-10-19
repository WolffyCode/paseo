import path from "node:path";
import {
  app,
  BrowserWindow,
  ipcMain,
  nativeImage,
  session as electronSession,
  webContents as electronWebContents,
  type MenuItem,
  type Session,
  type WebContents,
} from "electron";
import log from "electron-log/main";
import { ElectronChromeExtensions } from "electron-chrome-extensions";
import {
  installChromeWebStore,
  installExtension,
  uninstallExtension,
} from "electron-chrome-web-store";
import { DisabledExtensions } from "./disabled-extensions.js";
import {
  manifestIconPath,
  readPermissionRequest,
  type ExtensionManifest,
  type ExtensionPermissionRequest,
} from "./manifest.js";

export const BROWSER_EXTENSION_TAB_REQUEST_EVENT = "paseo:event:browser-extension-tab-request";
export const BROWSER_EXTENSIONS_CHANGED_EVENT = "paseo:event:browser-extensions-changed";
export const BROWSER_EXTENSION_INSTALL_PROMPT_EVENT =
  "paseo:event:browser-extension-install-prompt";

// Not "Extensions", the library's default: on macOS's case-insensitive disk that is the same folder
// as "extensions", where the dev build keeps React DevTools for the app window.
const EXTENSIONS_DIRECTORY_NAME = "Browser Extensions";
// Outside the extensions folder, which the Chrome Web Store loader reads as extensions.
const DISABLED_EXTENSIONS_FILE_NAME = "Browser Extension States.json";
// How long an extension's chrome.tabs.create waits for the window to attach the new page.
const CREATED_TAB_TIMEOUT_MS = 10_000;
// Chrome draws extension icons at 16 dip; 32 px stays sharp on Retina screens.
const EXTENSION_ICON_PIXELS = 32;
// A Chrome extension id: 32 letters a–p (crx_file::id_util).
const EXTENSION_ID_PATTERN = /^[a-p]{32}$/;

/** How installing one extension from the Chrome Web Store by its id went. */
export type BrowserExtensionInstallOutcome = "installed" | "already-installed" | "failed";

/** What the browser window shows about an installed extension. */
export interface BrowserExtensionSummary {
  id: string;
  name: string;
  version: string;
  description: string;
  iconDataUrl: string | null;
  optionsUrl: string | null;
  /** The extension's own website (manifest homepage_url), if it names one. */
  websiteUrl: string | null;
  isEnabled: boolean;
  permissions: ExtensionPermissionRequest;
}

/** A tab change an extension asks for; the renderer owns the windows, so it carries them out. */
export type BrowserExtensionTabRequest =
  | {
      kind: "create";
      requestId: number;
      url: string | null;
      isActive: boolean;
      nearBrowserId: string | null;
    }
  | { kind: "select"; browserId: string }
  | { kind: "close"; browserId: string };

/** Chrome's "Add extension?" question for one Chrome Web Store install, asked over its page. */
export interface BrowserExtensionInstallPrompt {
  requestId: number;
  browserId: string;
  extensionId: string;
  name: string;
  iconDataUrl: string;
  permissions: ExtensionPermissionRequest;
}

// The fields of electron-chrome-web-store's install details that the prompt needs.
interface WebStoreInstallDetails {
  id: string;
  localizedName: string;
  manifest: unknown;
  icon: Electron.NativeImage;
  frame: Electron.WebFrameMain;
}

interface PendingCreatedTab {
  browserId: string | null;
  resolve(guest: WebContents): void;
  reject(error: Error): void;
  timer: NodeJS.Timeout;
}

interface BrowserLookup {
  browserIdForWebContents(contents: WebContents): string | null;
  activeBrowserIdForHostWindow(hostWebContentsId: number): string | null;
}

/** Runs Chrome extensions and the Chrome Web Store in the browser session. */
export class BrowserExtensions {
  private readonly runtime: ElectronChromeExtensions;
  private readonly pendingCreatedTabs = new Map<number, PendingCreatedTab>();
  private readonly pendingInstallPrompts = new Map<number, (isAllowed: boolean) => void>();
  private readonly disabled = new DisabledExtensions<BrowserExtensionSummary>(
    path.join(app.getPath("userData"), DISABLED_EXTENSIONS_FILE_NAME),
  );
  private nextRequestId = 1;
  // The runtime reports every active-tab change through selectTab, including the ones Helm made:
  // selecting a page, and activating every page it is given (its tabs API activates each added
  // tab). Echoing those back would override the window's choice, as when a reload re-attaches
  // every page and the last one to attach took the window over.
  private isHostChangingTabs = false;

  constructor(
    private readonly session: Session,
    private readonly lookup: BrowserLookup,
  ) {
    this.runtime = new ElectronChromeExtensions({
      license: "GPL-3.0",
      session,
      createTab: (details) => this.createTab(details),
      selectTab: (tab) => this.forwardSelection(tab),
      removeTab: (tab) => this.forwardRemoval(tab),
      createWindow: (details) => this.createWindow(details),
      // Chrome asks the user for optional permissions; installed extensions here get them.
      requestPermissions: () => Promise.resolve(true),
    });
  }

  private get extensionsPath(): string {
    return path.join(app.getPath("userData"), EXTENSIONS_DIRECTORY_NAME);
  }

  async start(): Promise<void> {
    // The window's own toolbar loads extension icons from crx:// URLs.
    ElectronChromeExtensions.handleCRXProtocol(electronSession.defaultSession);
    await this.disabled.load();
    this.session.extensions.on("extension-loaded", (_event, extension) => {
      // The Web Store loader loads every installed extension, at start and after updates.
      if (this.disabled.has(extension.id)) {
        setImmediate(() => this.session.extensions.removeExtension(extension.id));
        return;
      }
      this.broadcastChange();
    });
    this.session.extensions.on("extension-unloaded", () => this.broadcastChange());
    this.registerIpc();
    await installChromeWebStore({
      session: this.session,
      extensionsPath: this.extensionsPath,
      loadExtensions: true,
      autoUpdate: true,
      beforeInstall: (details) => this.confirmInstall(details),
    });
  }

  /**
   * A page of a browser window attached; extensions see it as a tab of its app window. The runtime
   * makes it the active tab, so the window's own choice has to be selected again afterwards.
   */
  attachBrowser(input: { browserId: string; guest: WebContents; hostWindow: BrowserWindow }): void {
    this.changeTabsAsHost(() => this.runtime.addTab(input.guest, input.hostWindow));
    for (const [requestId, pending] of this.pendingCreatedTabs) {
      if (pending.browserId !== input.browserId) continue;
      clearTimeout(pending.timer);
      this.pendingCreatedTabs.delete(requestId);
      pending.resolve(input.guest);
    }
  }

  /** The window selected this page. */
  selectBrowser(guest: WebContents): void {
    this.changeTabsAsHost(() => this.runtime.selectTab(guest));
  }

  private changeTabsAsHost(change: () => void): void {
    this.isHostChangingTabs = true;
    try {
      change();
    } finally {
      this.isHostChangingTabs = false;
    }
  }

  contextMenuItems(guest: WebContents, params: Electron.ContextMenuParams): MenuItem[] {
    return this.runtime.getContextMenuItems(guest, params);
  }

  /** The page an extension shows for new tabs, as Chrome's chrome_url_overrides.newtab does. */
  newTabUrl(): string | null {
    return this.runtime.getURLOverrides().newtab ?? null;
  }

  /** Every installed extension: the loaded ones, then the ones the user turned off. */
  listExtensions(): BrowserExtensionSummary[] {
    const loaded = this.session.extensions
      .getAllExtensions()
      .filter((extension) => !this.disabled.has(extension.id))
      .map((extension) => summarizeExtension(extension));
    const turnedOff = this.disabled.list().map((record) => record.summary);
    return [...loaded, ...turnedOff];
  }

  /** Chrome's on/off switch. Off unloads the extension; on loads it from where it is installed. */
  async setEnabled(extensionId: string, isEnabled: boolean): Promise<void> {
    if (!isEnabled) {
      const extension = this.session.extensions.getExtension(extensionId);
      if (!extension) {
        return;
      }
      await this.disabled.add(extensionId, {
        summary: { ...summarizeExtension(extension), isEnabled: false },
        extensionPath: extension.path,
      });
      this.session.extensions.removeExtension(extensionId);
      return;
    }
    const record = this.disabled.get(extensionId);
    if (!record) {
      return;
    }
    await this.disabled.delete(extensionId);
    const extension = await this.session.extensions.loadExtension(record.extensionPath);
    // As the Web Store loader does: an MV3 extension's background service worker starts on load.
    if (extension.manifest.manifest_version === 3 && extension.manifest.background) {
      await this.session.serviceWorkers
        .startWorkerForScope(`chrome-extension://${extension.id}`)
        .catch((error: unknown) => {
          log.warn("[browser-extensions] background worker did not start", {
            extensionId,
            error,
          });
        });
    }
  }

  private registerIpc(): void {
    ipcMain.handle("paseo:browser:extensions:list", () => this.listExtensions());
    ipcMain.handle("paseo:browser:extensions:new-tab-url", () => this.newTabUrl());
    ipcMain.handle("paseo:browser:extensions:install", (_event, extensionId: unknown) =>
      this.installFromWebStore(extensionId),
    );
    ipcMain.handle("paseo:browser:extensions:remove", async (_event, extensionId: unknown) => {
      if (typeof extensionId !== "string" || !this.isInstalled(extensionId)) {
        return false;
      }
      await this.disabled.delete(extensionId);
      await uninstallExtension(extensionId, {
        session: this.session,
        extensionsPath: this.extensionsPath,
      });
      // A turned-off extension was not loaded, so no unload event announces its removal.
      this.broadcastChange();
      return true;
    });
    ipcMain.handle(
      "paseo:browser:extensions:set-enabled",
      async (_event, extensionId: unknown, isEnabled: unknown) => {
        if (typeof extensionId !== "string" || typeof isEnabled !== "boolean") {
          return;
        }
        await this.setEnabled(extensionId, isEnabled);
        this.broadcastChange();
      },
    );
    ipcMain.handle("paseo:browser:extensions:tab-created", (_event, rawInput: unknown) => {
      const input = readCreatedTab(rawInput);
      const pending = input ? this.pendingCreatedTabs.get(input.requestId) : undefined;
      if (!input || !pending) {
        return;
      }
      if (!input.browserId) {
        clearTimeout(pending.timer);
        this.pendingCreatedTabs.delete(input.requestId);
        pending.reject(new Error("The browser window could not open the tab"));
        return;
      }
      pending.browserId = input.browserId;
    });
    ipcMain.handle("paseo:browser:extensions:install-decision", (_event, rawInput: unknown) => {
      const input = readInstallDecision(rawInput);
      if (input) {
        this.pendingInstallPrompts.get(input.requestId)?.(input.isAllowed);
      }
    });
  }

  /** Loaded, or installed and turned off. */
  private isInstalled(extensionId: string): boolean {
    return (
      this.session.extensions.getExtension(extensionId) !== null || this.disabled.has(extensionId)
    );
  }

  /**
   * Installs an extension the user picked outside the store page, such as one imported from their
   * Chrome; picking it is the consent the store's "Add extension?" prompt would ask for.
   */
  private async installFromWebStore(extensionId: unknown): Promise<BrowserExtensionInstallOutcome> {
    if (typeof extensionId !== "string" || !EXTENSION_ID_PATTERN.test(extensionId)) {
      return "failed";
    }
    if (this.isInstalled(extensionId)) {
      return "already-installed";
    }
    try {
      await installExtension(extensionId, {
        session: this.session,
        extensionsPath: this.extensionsPath,
      });
      return "installed";
    } catch (error) {
      log.warn("[browser-extensions] install from the Chrome Web Store failed", {
        extensionId,
        error,
      });
      return "failed";
    }
  }

  private broadcastChange(): void {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) {
        window.webContents.send(BROWSER_EXTENSIONS_CHANGED_EVENT);
      }
    }
  }

  /**
   * Asks the window that shows the Web Store page, as Chrome asks over the tab. The answer stays
   * "no" when nobody can see the question: the page or its window went away first.
   */
  private confirmInstall(details: WebStoreInstallDetails): Promise<{ action: "allow" | "deny" }> {
    const guest = electronWebContents.fromFrame(details.frame);
    const browserId = guest ? this.lookup.browserIdForWebContents(guest) : null;
    const hostContents = guest?.hostWebContents;
    if (!guest || !browserId || !hostContents || hostContents.isDestroyed()) {
      log.warn("[browser-extensions] install asked from a page outside a browser window", {
        extensionId: details.id,
      });
      return Promise.resolve({ action: "deny" });
    }
    const requestId = this.nextRequestId;
    this.nextRequestId += 1;
    const prompt: BrowserExtensionInstallPrompt = {
      requestId,
      browserId,
      extensionId: details.id,
      name: details.localizedName,
      iconDataUrl: details.icon.toDataURL(),
      permissions: readPermissionRequest(details.manifest as ExtensionManifest),
    };
    return new Promise((resolve) => {
      const decline = () => finish(false);
      const finish = (isAllowed: boolean) => {
        this.pendingInstallPrompts.delete(requestId);
        guest.off("destroyed", decline);
        hostContents.off("did-navigate", decline);
        hostContents.off("destroyed", decline);
        resolve({ action: isAllowed ? "allow" : "deny" });
      };
      this.pendingInstallPrompts.set(requestId, finish);
      guest.once("destroyed", decline);
      // A reloaded window forgets the question it was showing.
      hostContents.once("did-navigate", decline);
      hostContents.once("destroyed", decline);
      hostContents.send(BROWSER_EXTENSION_INSTALL_PROMPT_EVENT, prompt);
    });
  }

  private hostWindowFor(windowId: number | undefined): BrowserWindow | null {
    const window = windowId === undefined ? null : BrowserWindow.fromId(windowId);
    return window ?? BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? null;
  }

  private createTab(details: chrome.tabs.CreateProperties): Promise<[WebContents, BrowserWindow]> {
    const hostWindow = this.hostWindowFor(details.windowId);
    if (!hostWindow || hostWindow.isDestroyed()) {
      return Promise.reject(new Error("No window can open the tab"));
    }
    const requestId = this.nextRequestId;
    this.nextRequestId += 1;
    const request: BrowserExtensionTabRequest = {
      kind: "create",
      requestId,
      url: details.url ?? null,
      isActive: details.active !== false,
      nearBrowserId: this.lookup.activeBrowserIdForHostWindow(hostWindow.webContents.id),
    };
    const created = new Promise<WebContents>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingCreatedTabs.delete(requestId);
        reject(new Error("The new tab did not attach in time"));
      }, CREATED_TAB_TIMEOUT_MS);
      this.pendingCreatedTabs.set(requestId, { browserId: null, resolve, reject, timer });
    });
    hostWindow.webContents.send(BROWSER_EXTENSION_TAB_REQUEST_EVENT, request);
    return created.then((guest) => [guest, hostWindow]);
  }

  private async createWindow(details: chrome.windows.CreateData): Promise<BrowserWindow> {
    // There are no separate browser windows to open; the URLs become tabs of the current one.
    const urls = typeof details.url === "string" ? [details.url] : (details.url ?? []);
    const hostWindow = this.hostWindowFor(undefined);
    if (!hostWindow) {
      throw new Error("No window can open the tabs");
    }
    for (const url of urls) {
      await this.createTab({ url, windowId: hostWindow.id, active: true });
    }
    return hostWindow;
  }

  private forwardSelection(tab: WebContents): void {
    if (this.isHostChangingTabs) return;
    this.sendTabRequest(tab, "select");
  }

  private forwardRemoval(tab: WebContents): void {
    // The runtime also reports pages that are being destroyed: those already left their window.
    if (tab.isDestroyed()) return;
    this.sendTabRequest(tab, "close");
  }

  private sendTabRequest(tab: WebContents, kind: "select" | "close"): void {
    const browserId = this.lookup.browserIdForWebContents(tab);
    const hostContents = tab.hostWebContents;
    if (!browserId || !hostContents || hostContents.isDestroyed()) {
      log.warn("[browser-extensions] tab request for an unknown page", { kind, tabId: tab.id });
      return;
    }
    const request: BrowserExtensionTabRequest = { kind, browserId };
    hostContents.send(BROWSER_EXTENSION_TAB_REQUEST_EVENT, request);
  }
}

function summarizeExtension(extension: Electron.Extension): BrowserExtensionSummary {
  const manifest = extension.manifest as ExtensionManifest;
  const optionsPage = manifest.options_page ?? manifest.options_ui?.page;
  return {
    id: extension.id,
    name: extension.name,
    version: extension.version,
    description: manifest.description ?? "",
    iconDataUrl: readExtensionIcon(extension.path, manifest),
    optionsUrl: optionsPage ? `${extension.url}${optionsPage}` : null,
    websiteUrl: manifest.homepage_url ?? null,
    isEnabled: true,
    permissions: readPermissionRequest(manifest),
  };
}

function readExtensionIcon(extensionPath: string, manifest: ExtensionManifest): string | null {
  const iconPath = manifestIconPath(manifest, EXTENSION_ICON_PIXELS);
  if (!iconPath) {
    return null;
  }
  const icon = nativeImage.createFromPath(path.join(extensionPath, iconPath));
  if (icon.isEmpty()) {
    return null;
  }
  return icon.resize({ width: EXTENSION_ICON_PIXELS, height: EXTENSION_ICON_PIXELS }).toDataURL();
}

function readCreatedTab(input: unknown): { requestId: number; browserId: string | null } | null {
  if (typeof input !== "object" || input === null) {
    return null;
  }
  const record = input as Record<string, unknown>;
  if (typeof record.requestId !== "number") {
    return null;
  }
  const browserId = typeof record.browserId === "string" ? record.browserId : null;
  return { requestId: record.requestId, browserId };
}

function readInstallDecision(input: unknown): { requestId: number; isAllowed: boolean } | null {
  if (typeof input !== "object" || input === null) {
    return null;
  }
  const record = input as Record<string, unknown>;
  if (typeof record.requestId !== "number" || typeof record.isAllowed !== "boolean") {
    return null;
  }
  return { requestId: record.requestId, isAllowed: record.isAllowed };
}
