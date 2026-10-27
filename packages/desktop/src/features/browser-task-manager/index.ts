import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  screen,
  webContents as allWebContents,
  type IpcMainInvokeEvent,
  type Rectangle,
  type Session,
  type WebContents,
} from "electron";
import log from "electron-log/main";
import { z } from "zod";
import { getPaseoBrowserWebviewRegistry } from "../browser-webviews/index.js";
import {
  TASK_MANAGER_CHANNELS,
  readTaskManagerView,
  taskManagerAppearanceSchema,
  type TaskManagerAppearance,
  type TaskManagerView,
  type TaskManagerWindowState,
} from "./channels.js";
import {
  buildTaskRows,
  subframeSite,
  taskProcessIdsToEnd,
  type TaskManagerPage,
  type TaskManagerSample,
  type TaskManagerServiceWorker,
} from "./model.js";
import { TASK_COLUMN_IDS, type TaskColumnId, type TaskManagerColorScheme } from "./table.js";

export const TASK_MANAGER_ACTIVATE_EVENT = "paseo:event:browser-task-manager-activate";

interface TaskManagerFile {
  bounds?: Rectangle;
  view?: TaskManagerView;
}

// TaskManagerView's preferred size: 640 × 270 of table area plus the 56 dip button row.
const DEFAULT_CONTENT_WIDTH = 640;
const DEFAULT_CONTENT_HEIGHT = 326;
// TaskManagerTableModel's kRefreshTime, "matches MacOS's Activity Monitor".
const REFRESH_INTERVAL_MS = 2000;
const WINDOW_BACKGROUND: Record<TaskManagerColorScheme, string> = {
  light: "#FFFFFF",
  dark: "#1F1F1F",
};
const TASK_MANAGER_FILE_NAME = "browser-task-manager.json";
// A blank document: the window's preload draws the whole page into it.
const WINDOW_DOCUMENT = `data:text/html;charset=utf-8,${encodeURIComponent(
  '<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src https: http: data:; style-src \'unsafe-inline\'"></head><body></body></html>',
)}`;

const boundsSchema = z.object({
  x: z.number().int(),
  y: z.number().int(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});
const minimumSizeSchema = z.object({ width: z.number().positive(), height: z.number().positive() });

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Whether `bounds` still shows on some display; a window left on an unplugged screen doesn't. */
function isOnScreen(bounds: Rectangle): boolean {
  return screen.getAllDisplays().some(({ workArea }) => {
    const overlapWidth =
      Math.min(bounds.x + bounds.width, workArea.x + workArea.width) -
      Math.max(bounds.x, workArea.x);
    const overlapHeight =
      Math.min(bounds.y + bounds.height, workArea.y + workArea.height) -
      Math.max(bounds.y, workArea.y);
    return overlapWidth > 0 && overlapHeight > 0;
  });
}

/**
 * Chrome's task manager as a window of its own (TaskManagerView): one at a time, opened from a
 * page's ⋮ menu or its pinned button, listing every process Helm's browser runs and ending the
 * ones the user picks.
 */
export class BrowserTaskManager {
  private window: BrowserWindow | null = null;
  private appearance: TaskManagerAppearance | null = null;
  private view: TaskManagerView = readTaskManagerView(undefined);
  private bounds: Rectangle | undefined;
  private selectedBrowserId: string | null = null;
  private refreshTimer: NodeJS.Timeout | null = null;
  private isFirstSample = true;
  private readonly faviconByWebContentsId = new Map<number, string>();
  private pendingSave: Promise<void> = Promise.resolve();

  public constructor(private readonly browserSession: Session) {}

  private get filePath(): string {
    return path.join(app.getPath("userData"), TASK_MANAGER_FILE_NAME);
  }

  public async start(): Promise<void> {
    await this.load();
    // Electron has no getter for a page's favicon, so every page's is noted as it changes.
    app.on("web-contents-created", (_event, contents) => {
      contents.on("page-favicon-updated", (_faviconEvent, favicons) => {
        const [faviconUrl] = favicons;
        if (faviconUrl) this.faviconByWebContentsId.set(contents.id, faviconUrl);
      });
      contents.once("destroyed", () => this.faviconByWebContentsId.delete(contents.id));
    });
    this.registerIpc();
  }

  private registerIpc(): void {
    ipcMain.handle("paseo:browser:task-manager:open", (event, request: unknown) =>
      this.open(event, request),
    );
    ipcMain.handle("paseo:browser:task-manager:set-appearance", (_event, request: unknown) =>
      this.setAppearance(request),
    );
    ipcMain.handle(TASK_MANAGER_CHANNELS.ready, (event) => {
      if (!this.isFromWindow(event)) return null;
      // The first rows travel with the reply so they cannot arrive before the preload subscribes.
      const state = this.windowState();
      this.isFirstSample = false;
      this.startRefreshing();
      return state;
    });
    ipcMain.handle(TASK_MANAGER_CHANNELS.endTasks, (event, pids: unknown) =>
      this.isFromWindow(event) ? this.endTasks(pids) : false,
    );
    ipcMain.handle(TASK_MANAGER_CHANNELS.activate, (event, browserId: unknown) => {
      if (this.isFromWindow(event) && typeof browserId === "string") this.activate(browserId);
    });
    ipcMain.handle(TASK_MANAGER_CHANNELS.saveView, (event, view: unknown) => {
      if (!this.isFromWindow(event)) return;
      this.view = readTaskManagerView(view);
      void this.save();
    });
    ipcMain.handle(TASK_MANAGER_CHANNELS.columnMenu, (event, visibleColumns: unknown) =>
      this.isFromWindow(event) ? this.showColumnMenu(visibleColumns) : null,
    );
    ipcMain.handle(TASK_MANAGER_CHANNELS.close, (event) => {
      if (this.isFromWindow(event)) this.window?.close();
    });
    ipcMain.handle(TASK_MANAGER_CHANNELS.setMinimumContentSize, (event, size: unknown) => {
      if (this.isFromWindow(event) && isRecord(size)) this.setMinimumContentSize(size);
    });
  }

  private isFromWindow(event: IpcMainInvokeEvent): boolean {
    return (
      this.window !== null && !this.window.isDestroyed() && event.sender === this.window.webContents
    );
  }

  private async open(event: IpcMainInvokeEvent, request: unknown): Promise<void> {
    if (!isRecord(request)) throw new TypeError("Invalid task manager request");
    const parsedAppearance = taskManagerAppearanceSchema.safeParse(request.appearance);
    if (!parsedAppearance.success) throw new TypeError("Invalid task manager appearance");
    const appearance = parsedAppearance.data;
    this.setAppearance(appearance);
    const registration = getPaseoBrowserWebviewRegistry();
    const browserId = typeof request.browserId === "string" ? request.browserId : null;
    // Only a page of the window that asked can be the one to select.
    this.selectedBrowserId =
      browserId !== null &&
      registration.getWebContentsIdForBrowserInHostWindow(event.sender.id, browserId) !== null
        ? browserId
        : null;
    if (this.window && !this.window.isDestroyed()) {
      // Chrome's singleton: the open window comes forward and selects the asking page's row.
      this.window.webContents.send(TASK_MANAGER_CHANNELS.select, this.selectedBrowserId);
      this.window.show();
      this.window.focus();
      return;
    }
    await this.createWindow(appearance);
  }

  private async createWindow(appearance: TaskManagerAppearance): Promise<void> {
    const bounds = this.bounds && isOnScreen(this.bounds) ? this.bounds : undefined;
    const window = new BrowserWindow({
      title: appearance.strings.title,
      ...(bounds ?? { width: DEFAULT_CONTENT_WIDTH, height: DEFAULT_CONTENT_HEIGHT }),
      // Saved bounds are the frame's; the first opening sizes the content, as Chrome does.
      useContentSize: bounds === undefined,
      show: false,
      backgroundColor: WINDOW_BACKGROUND[appearance.colorScheme],
      minimizable: true,
      maximizable: true,
      resizable: true,
      webPreferences: {
        preload: path.join(__dirname, "window-preload.js"),
        contextIsolation: true,
        nodeIntegration: false,
        // The preload draws the page from several modules, which a sandboxed preload can't load;
        // the window shows nothing but this local page.
        sandbox: false,
      },
    });
    this.window = window;
    this.isFirstSample = true;
    window.webContents.on("will-navigate", (navigationEvent) => navigationEvent.preventDefault());
    window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    window.once("ready-to-show", () => window.show());
    window.on("close", () => {
      this.bounds = window.getBounds();
      void this.save();
    });
    window.on("closed", () => {
      this.stopRefreshing();
      if (this.window === window) this.window = null;
    });
    try {
      await window.loadURL(WINDOW_DOCUMENT);
    } catch (error) {
      if (!window.isDestroyed()) window.destroy();
      throw error;
    }
  }

  private windowState(): TaskManagerWindowState | null {
    if (!this.appearance) return null;
    return {
      ...this.appearance,
      view: this.view,
      selectedBrowserId: this.selectedBrowserId,
      rows: buildTaskRows(this.sample()),
    };
  }

  /** Helm's language or color scheme changed: an open window follows. */
  private setAppearance(request: unknown): void {
    const parsedAppearance = taskManagerAppearanceSchema.safeParse(request);
    if (!parsedAppearance.success) throw new TypeError("Invalid task manager appearance");
    const appearance = parsedAppearance.data;
    this.appearance = appearance;
    const window = this.window;
    if (!window || window.isDestroyed()) return;
    window.setTitle(appearance.strings.title);
    window.setBackgroundColor(WINDOW_BACKGROUND[appearance.colorScheme]);
    window.webContents.send(TASK_MANAGER_CHANNELS.appearance, appearance);
  }

  private setMinimumContentSize(size: Record<string, unknown>): void {
    const window = this.window;
    if (!window || window.isDestroyed()) return;
    const parsedSize = minimumSizeSchema.safeParse(size);
    if (!parsedSize.success) return;
    const { width, height } = parsedSize.data;
    const [frameWidth, frameHeight] = window.getSize();
    const [contentWidth, contentHeight] = window.getContentSize();
    window.setMinimumSize(
      Math.ceil(width + frameWidth - contentWidth),
      Math.ceil(height + frameHeight - contentHeight),
    );
  }

  private startRefreshing(): void {
    this.stopRefreshing();
    this.refreshTimer = setInterval(() => this.refresh(), REFRESH_INTERVAL_MS);
  }

  private stopRefreshing(): void {
    if (this.refreshTimer) clearInterval(this.refreshTimer);
    this.refreshTimer = null;
  }

  private refresh(): void {
    const window = this.window;
    if (!window || window.isDestroyed()) return;
    try {
      const rows = buildTaskRows(this.sample());
      window.webContents.send(TASK_MANAGER_CHANNELS.rows, rows);
    } catch (error) {
      // A page torn down mid-sample: the next refresh, two seconds on, catches up.
      log.warn("[browser-task-manager] could not sample the processes", error);
    }
    this.isFirstSample = false;
  }

  private sample(): TaskManagerSample {
    const processes = app.getAppMetrics().map((metric) => ({
      pid: metric.pid,
      type: metric.type,
      name: metric.name ?? null,
      cpuPercent: metric.cpu.percentCPUUsage,
      idleWakeupsPerSecond: metric.cpu.idleWakeupsPerSecond,
      workingSetKb: metric.memory.workingSetSize,
    }));
    const pages = this.pages();
    return {
      browserPid: process.pid,
      processes,
      pages,
      extensionPages: this.extensionPages(),
      serviceWorkers: this.serviceWorkers(),
      appRendererPids: new Set(
        BrowserWindow.getAllWindows()
          .filter((window) => !window.isDestroyed())
          .map((window) => window.webContents.getOSProcessId()),
      ),
      isFirstSample: this.isFirstSample,
    };
  }

  private pages(): TaskManagerPage[] {
    const pages: TaskManagerPage[] = [];
    for (const registration of getPaseoBrowserWebviewRegistry().listRegistrations()) {
      const contents = allWebContents.fromId(registration.webContentsId);
      if (!contents || contents.isDestroyed()) continue;
      const pid = contents.getOSProcessId();
      const subframes = new Map<string, { pid: number; site: string }>();
      for (const frame of contents.mainFrame.framesInSubtree) {
        if (frame.osProcessId === pid) continue;
        const site = subframeSite(frame.origin);
        subframes.set(`${frame.osProcessId}:${site}`, { pid: frame.osProcessId, site });
      }
      const devTools = contents.devToolsWebContents;
      pages.push({
        browserId: registration.browserId,
        pid,
        title: contents.getTitle(),
        url: contents.getURL(),
        faviconUrl: this.faviconByWebContentsId.get(contents.id) ?? null,
        subframes: [...subframes.values()],
        devTools:
          devTools && !devTools.isDestroyed()
            ? { pid: devTools.getOSProcessId(), title: devTools.getTitle() }
            : null,
      });
    }
    return pages;
  }

  private extensionPages(): { pid: number; name: string; iconUrl: string | null }[] {
    return allWebContents
      .getAllWebContents()
      .filter((contents) => !contents.isDestroyed() && contents.getType() === "backgroundPage")
      .map((contents) => {
        const extensionId = new URL(contents.getURL()).host;
        const extension = contents.session.extensions.getExtension(extensionId);
        return {
          pid: contents.getOSProcessId(),
          name: extension?.name ?? extensionId,
          iconUrl: null,
        };
      });
  }

  private serviceWorkers(): TaskManagerServiceWorker[] {
    // A worker names Chromium's process id; a frame in that process gives the OS pid.
    const osPidByProcessId = new Map<number, number>();
    for (const contents of allWebContents.getAllWebContents()) {
      if (contents.isDestroyed() || contents.session !== this.browserSession) continue;
      for (const frame of contents.mainFrame.framesInSubtree) {
        osPidByProcessId.set(frame.processId, frame.osProcessId);
      }
    }
    return Object.values(this.browserSession.serviceWorkers.getAllRunning()).flatMap(
      (worker): TaskManagerServiceWorker[] => {
        const pid = osPidByProcessId.get(worker.renderProcessId);
        return pid === undefined ? [] : [{ pid, scriptUrl: worker.scriptUrl }];
      },
    );
  }

  /**
   * Task::Kill: SIGTERM to each picked process, never the browser's own or a Helm window's. True
   * when every signal went out.
   */
  private endTasks(pids: unknown): boolean {
    const selectedPids = taskProcessIdsToEnd(pids, this.sample());
    if (!selectedPids) return false;
    let isEveryTaskEnded = true;
    for (const pid of selectedPids) {
      try {
        process.kill(pid, "SIGTERM");
      } catch (error) {
        log.warn(`[browser-task-manager] could not end process ${pid}`, error);
        isEveryTaskEnded = false;
      }
    }
    return isEveryTaskEnded;
  }

  /** Double-click or Return on a page's row: its window comes forward and shows that tab. */
  private activate(browserId: string): void {
    const registration = getPaseoBrowserWebviewRegistry()
      .listRegistrations()
      .find((candidate) => candidate.browserId === browserId);
    if (!registration) return;
    const host: WebContents | undefined = allWebContents.fromId(registration.hostWebContentsId);
    if (!host || host.isDestroyed()) return;
    const hostWindow = BrowserWindow.fromWebContents(host);
    hostWindow?.show();
    hostWindow?.focus();
    host.send(TASK_MANAGER_ACTIVATE_EVENT, { browserId });
  }

  /** The header's right-click menu: every column as a check item, as TaskManagerView's. */
  private showColumnMenu(visibleColumns: unknown): Promise<TaskColumnId | null> {
    const window = this.window;
    const strings = this.appearance?.strings;
    if (!window || !strings || !Array.isArray(visibleColumns)) return Promise.resolve(null);
    return new Promise((resolve) => {
      let chosen: TaskColumnId | null = null;
      const menu = Menu.buildFromTemplate(
        TASK_COLUMN_IDS.map((columnId) => {
          const isVisible = visibleColumns.includes(columnId);
          return {
            type: "checkbox" as const,
            label: strings.columns[columnId],
            checked: isVisible,
            // The last visible column stays: a table with no columns shows nothing.
            enabled: !(isVisible && visibleColumns.length === 1),
            click: () => {
              chosen = columnId;
            },
          };
        }),
      );
      menu.popup({ window, callback: () => resolve(chosen) });
    });
  }

  private async load(): Promise<void> {
    let raw: string;
    try {
      raw = await readFile(this.filePath, "utf8");
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") return;
      throw error;
    }
    try {
      const file: unknown = JSON.parse(raw);
      if (!isRecord(file)) return;
      this.view = readTaskManagerView(file.view);
      this.bounds = boundsSchema.safeParse(file.bounds).data;
    } catch (error) {
      // Only the window's place and the table's columns and sort are lost; Chrome's defaults return.
      log.warn("[browser-task-manager] unreadable task manager file; using defaults", error);
    }
  }

  private save(): Promise<void> {
    this.pendingSave = this.pendingSave.then(() => this.write());
    return this.pendingSave;
  }

  private async write(): Promise<void> {
    const file: TaskManagerFile = { bounds: this.bounds, view: this.view };
    // Write then rename, so a crash mid-write leaves the previous file intact.
    const temporaryPath = `${this.filePath}.tmp`;
    try {
      await mkdir(path.dirname(this.filePath), { recursive: true });
      await writeFile(temporaryPath, JSON.stringify(file));
      await rename(temporaryPath, this.filePath);
    } catch (error) {
      log.warn("[browser-task-manager] could not save the task manager's place and columns", error);
    }
  }
}
