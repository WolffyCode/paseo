import { contextBridge, ipcRenderer, webUtils } from "electron";
import type { BrowserKeyboardPolicy } from "./features/browser-keyboard/index.js";
import type { DesktopWindowChromeMode } from "./window/chrome.js";

// This preload runs in Electron's sandbox and is tsc-compiled (not bundled), so it MUST
// NOT emit any runtime module load other than "electron" — a require() of a local or
// third-party module throws and aborts the preload before exposeInMainWorld runs, leaving
// window.paseoDesktop undefined (the 0.1.108 regression, #2103). Keep this literal in sync
// with PASEO_BROWSER_PROFILE_PARTITION in features/browser-profile.ts; preload-sandbox.test.ts
// guards both the no-local-import rule and this drift. Type-only imports are fine (erased at emit).
const PASEO_BROWSER_PROFILE_PARTITION = "persist:paseo-browser";

type EventHandler = (payload: unknown) => void;

function readWindowChromeMode(): DesktopWindowChromeMode {
  const prefix = "--paseo-window-chrome-mode=";
  const value = process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length);
  if (value === "native-mac" || value === "custom-windows" || value === "custom-linux") {
    return value;
  }
  // COMPAT(windowChromeMode): added in v0.5.3; remove after 2026-11-25.
  if (process.platform === "darwin") return "native-mac";
  return process.platform === "linux" ? "custom-linux" : "custom-windows";
}

interface AttachedBrowserRegistration {
  browserId: string;
  workspaceId: string;
  webContentsId: number;
}

contextBridge.exposeInMainWorld("paseoDesktop", {
  platform: process.platform,
  windowChromeMode: readWindowChromeMode(),
  invoke: (command: string, args?: Record<string, unknown>) =>
    ipcRenderer.invoke("paseo:invoke", command, args),
  getPendingOpenProject: () =>
    ipcRenderer.invoke("paseo:get-pending-open-project") as Promise<string | null>,
  agentNavigation: {
    ready: () =>
      ipcRenderer.invoke("paseo:agent-navigation:ready") as Promise<{
        serverId: string;
        agentId: string;
      } | null>,
  },
  events: {
    on: (event: string, handler: EventHandler): Promise<() => void> => {
      const listener = (_ipcEvent: Electron.IpcRendererEvent, payload: unknown) => {
        handler(payload);
      };
      ipcRenderer.on(`paseo:event:${event}`, listener);
      return Promise.resolve(() => {
        ipcRenderer.removeListener(`paseo:event:${event}`, listener);
      });
    },
  },
  window: {
    openNew: (options?: { pendingOpenProjectPath?: string | null }) =>
      ipcRenderer.invoke("paseo:window:openNew", options),
    getCurrentWindow: () => ({
      minimize: () => ipcRenderer.invoke("paseo:window:minimize"),
      close: () => ipcRenderer.invoke("paseo:window:close"),
      toggleMaximize: () => ipcRenderer.invoke("paseo:window:toggleMaximize"),
      isMaximized: () => ipcRenderer.invoke("paseo:window:isMaximized"),
      setFullscreen: (fullscreen: boolean) =>
        ipcRenderer.invoke("paseo:window:setFullscreen", fullscreen),
      isFullscreen: () => ipcRenderer.invoke("paseo:window:isFullscreen"),
      updateChrome: (update: { backgroundColor?: string; trafficLightOffsetY?: number }) =>
        ipcRenderer.invoke("paseo:window:updateChrome", update),
      onResized: (handler: EventHandler): (() => void) => {
        const listener = (_ipcEvent: Electron.IpcRendererEvent, payload: unknown) => {
          handler(payload);
        };
        ipcRenderer.on("paseo:window:resized", listener);
        return () => {
          ipcRenderer.removeListener("paseo:window:resized", listener);
        };
      },
      setBadgeCount: (count?: number) => ipcRenderer.invoke("paseo:window:setBadgeCount", count),
    }),
  },
  dialog: {
    ask: (message: string, options?: Record<string, unknown>) =>
      ipcRenderer.invoke("paseo:dialog:ask", message, options),
    askWithCheckbox: (message: string, options: Record<string, unknown>) =>
      ipcRenderer.invoke("paseo:dialog:askWithCheckbox", message, options),
    open: (options?: Record<string, unknown>) => ipcRenderer.invoke("paseo:dialog:open", options),
  },
  notification: {
    isSupported: () => ipcRenderer.invoke("paseo:notification:isSupported"),
    sendNotification: (payload: { title: string; body?: string; data?: Record<string, unknown> }) =>
      ipcRenderer.invoke("paseo:notification:send", payload),
  },
  opener: {
    openUrl: (url: string) => ipcRenderer.invoke("paseo:opener:openUrl", url),
  },
  editor: {
    listTargets: () => ipcRenderer.invoke("paseo:editor:listTargets"),
    openTarget: (input: {
      editorId: string;
      workspacePath: string;
      filePath?: string;
      line?: number;
      column?: number;
    }) => ipcRenderer.invoke("paseo:editor:openTarget", input),
  },
  webUtils: {
    getPathForFile: (file: File) => webUtils.getPathForFile(file),
  },
  menu: {
    showContextMenu: (input?: Record<string, unknown>) =>
      ipcRenderer.invoke("paseo:menu:showContextMenu", input),
    popup: (input: Record<string, unknown>) =>
      ipcRenderer.invoke("paseo:menu:popup", input) as Promise<string | null>,
    setCapturingShortcut: (capturing: boolean) =>
      ipcRenderer.invoke("paseo:menu:set-capturing-shortcut", capturing),
  },
  browser: {
    setShortcutPolicy: (input: BrowserKeyboardPolicy) =>
      ipcRenderer.invoke("paseo:browser:set-shortcut-policy", input),
    setPageMenuLabels: (labels: Record<string, string>) =>
      ipcRenderer.invoke("paseo:browser:set-page-menu-labels", labels),
    profilePartition: PASEO_BROWSER_PROFILE_PARTITION,
    registerAttachedBrowser: (input: AttachedBrowserRegistration) =>
      ipcRenderer.invoke("paseo:browser:register-attached", input),
    unregisterWorkspaceBrowser: (browserId: string) =>
      ipcRenderer.invoke("paseo:browser:unregister-workspace-browser", browserId),
    setWorkspaceActiveBrowser: (input: { workspaceId: string; browserId: string | null }) =>
      ipcRenderer.invoke("paseo:browser:set-workspace-active-browser", input),
    focus: (browserId: string) => ipcRenderer.invoke("paseo:browser:focus", browserId),
    openDevTools: (browserId: string) =>
      ipcRenderer.invoke("paseo:browser:open-devtools", browserId),
    savePage: (browserId: string) => ipcRenderer.invoke("paseo:browser:save-page", browserId),
    taskManager: {
      open: (request: unknown) => ipcRenderer.invoke("paseo:browser:task-manager:open", request),
      setAppearance: (appearance: unknown) =>
        ipcRenderer.invoke("paseo:browser:task-manager:set-appearance", appearance),
    },
    browsingData: {
      counts: () => ipcRenderer.invoke("paseo:browser:browsing-data:counts"),
      clear: (request: { siteData: boolean; cache: boolean; origins: string[] | null }) =>
        ipcRenderer.invoke("paseo:browser:browsing-data:clear", request),
    },
    getNavigationHistory: (browserId: string) =>
      ipcRenderer.invoke("paseo:browser:navigation-history", browserId),
    clearProfile: (legacyBrowserIds: string[]) =>
      ipcRenderer.invoke("paseo:browser:clear-profile", legacyBrowserIds),
    executeAutomationCommand: (request: Record<string, unknown>) =>
      ipcRenderer.invoke("paseo:browser:execute-automation-command", request),
    captureElement: (
      browserId: string,
      rect: { x: number; y: number; width: number; height: number },
    ) => ipcRenderer.invoke("paseo:browser:capture-element", browserId, rect),
    copyElement: (payload: { text?: string; imageDataUrl?: string }) =>
      ipcRenderer.invoke("paseo:browser:copy-element", payload),
    chromeImport: {
      listProfiles: () => ipcRenderer.invoke("paseo:browser:chrome-import:profiles"),
      read: (directory: string, uiLocale: string) =>
        ipcRenderer.invoke("paseo:browser:chrome-import:read", directory, uiLocale),
    },
    downloads: {
      list: () => ipcRenderer.invoke("paseo:browser:downloads:list"),
      pause: (downloadId: string) =>
        ipcRenderer.invoke("paseo:browser:downloads:pause", downloadId),
      resume: (downloadId: string) =>
        ipcRenderer.invoke("paseo:browser:downloads:resume", downloadId),
      cancel: (downloadId: string) =>
        ipcRenderer.invoke("paseo:browser:downloads:cancel", downloadId),
      retry: (downloadId: string) =>
        ipcRenderer.invoke("paseo:browser:downloads:retry", downloadId),
      open: (downloadId: string) => ipcRenderer.invoke("paseo:browser:downloads:open", downloadId),
      showInFolder: (downloadId: string) =>
        ipcRenderer.invoke("paseo:browser:downloads:show-in-folder", downloadId),
      remove: (downloadId: string) =>
        ipcRenderer.invoke("paseo:browser:downloads:remove", downloadId),
      clearAll: () => ipcRenderer.invoke("paseo:browser:downloads:clear-all"),
      undoRemove: () => ipcRenderer.invoke("paseo:browser:downloads:undo-remove"),
      setOpenWhenDone: (downloadId: string, openWhenDone: boolean) =>
        ipcRenderer.invoke("paseo:browser:downloads:set-open-when-done", downloadId, openWhenDone),
      setOpensTypeAutomatically: (downloadId: string, opensType: boolean) =>
        ipcRenderer.invoke(
          "paseo:browser:downloads:set-opens-type-automatically",
          downloadId,
          opensType,
        ),
      fileIcon: (downloadId: string) =>
        ipcRenderer.invoke("paseo:browser:downloads:file-icon", downloadId),
      downloadNamed: (browserId: string, url: string, fileName: string) =>
        ipcRenderer.invoke("paseo:browser:downloads:download-named", browserId, url, fileName),
      deleteHistory: (since: number) =>
        ipcRenderer.invoke("paseo:browser:downloads:delete-history", since),
      settings: () => ipcRenderer.invoke("paseo:browser:downloads:settings"),
      chooseDirectory: () => ipcRenderer.invoke("paseo:browser:downloads:choose-directory"),
      setPromptForDownload: (promptForDownload: boolean) =>
        ipcRenderer.invoke("paseo:browser:downloads:set-prompt-for-download", promptForDownload),
      setPartialViewEnabled: (isEnabled: boolean) =>
        ipcRenderer.invoke("paseo:browser:downloads:set-partial-view-enabled", isEnabled),
    },
    extensions: {
      list: () => ipcRenderer.invoke("paseo:browser:extensions:list"),
      getNewTabUrl: () =>
        ipcRenderer.invoke("paseo:browser:extensions:new-tab-url") as Promise<string | null>,
      install: (extensionId: string) =>
        ipcRenderer.invoke("paseo:browser:extensions:install", extensionId),
      remove: (extensionId: string) =>
        ipcRenderer.invoke("paseo:browser:extensions:remove", extensionId) as Promise<boolean>,
      setEnabled: (extensionId: string, isEnabled: boolean) =>
        ipcRenderer.invoke("paseo:browser:extensions:set-enabled", extensionId, isEnabled),
      reportCreatedTab: (input: { requestId: number; browserId: string | null }) =>
        ipcRenderer.invoke("paseo:browser:extensions:tab-created", input),
      decideInstall: (input: { requestId: number; isAllowed: boolean }) =>
        ipcRenderer.invoke("paseo:browser:extensions:install-decision", input),
      // electron-chrome-extensions serves extension toolbar buttons to a host UI over these
      // "remote" channels; its own <browser-action-list> element uses the same ones.
      getActionState: () =>
        ipcRenderer.invoke(
          "crx-msg-remote",
          PASEO_BROWSER_PROFILE_PARTITION,
          "browserAction.getState",
        ),
      activateAction: (details: Record<string, unknown>) =>
        ipcRenderer.invoke(
          "crx-msg-remote",
          PASEO_BROWSER_PROFILE_PARTITION,
          "browserAction.activate",
          details,
        ),
      observeActions: (listener: () => void): (() => void) => {
        const handler = () => listener();
        ipcRenderer.on("browserAction.update", handler);
        void ipcRenderer.invoke(
          "crx-msg-remote",
          PASEO_BROWSER_PROFILE_PARTITION,
          "browserAction.addObserver",
        );
        return () => {
          ipcRenderer.removeListener("browserAction.update", handler);
          void ipcRenderer.invoke(
            "crx-msg-remote",
            PASEO_BROWSER_PROFILE_PARTITION,
            "browserAction.removeObserver",
          );
        };
      },
    },
  },
});
