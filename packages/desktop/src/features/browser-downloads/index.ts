import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  shell,
  type DownloadItem,
  type Session,
  type WebContents,
} from "electron";
import log from "electron-log/main";
import { canOpenTypeAutomatically, downloadExtension } from "./auto-open.js";
import { uniqueDownloadPath } from "./unique-path.js";

export const BROWSER_DOWNLOAD_CHANGED_EVENT = "paseo:event:browser-download-changed";
export const BROWSER_DOWNLOADS_REMOVED_EVENT = "paseo:event:browser-downloads-removed";
export const BROWSER_DOWNLOADS_SHOW_DETAILS_EVENT = "paseo:event:browser-downloads-show-details";

const DOWNLOADS_FILE_NAME = "Browser Downloads.json";
// Chrome's name for a response that names no file (IDS_DEFAULT_DOWNLOAD_FILENAME).
const DEFAULT_FILE_NAME = "download";
// A running download reports its progress to the windows at most this often.
const PROGRESS_REPORT_INTERVAL_MS = 200;
// The downloads page keeps this many entries; older ones drop off the end.
const MAX_REMEMBERED_DOWNLOADS = 1000;
const MILLISECONDS_PER_SECOND = 1000;
const WEB_PROTOCOLS = new Set(["http:", "https:"]);
// Chromium downloads into "<name>.crdownload" and renames the file when it is complete.
const PARTIAL_FILE_SUFFIX = ".crdownload";
// BrowserWindow.setProgressBar's value for an indeterminate bar.
const INDETERMINATE_PROGRESS = 2;

export type BrowserDownloadState = "in_progress" | "complete" | "cancelled" | "interrupted";

/**
 * Why a download failed, as far as Electron tells: a download cut off by quitting is Chrome's
 * USER_SHUTDOWN; Electron reports no reason for the others.
 */
export type BrowserDownloadInterruptReason = "shutdown" | "unknown";

/** One download as the browser remembers it across launches. */
interface StoredDownload {
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
  state: BrowserDownloadState;
  interruptReason: BrowserDownloadInterruptReason | null;
  isPaused: boolean;
  canResume: boolean;
  /** Chrome's 完成后打开: the file opens once it is in. */
  openWhenDone: boolean;
  startTime: number;
  endTime: number | null;
}

/** One download as the browser's downloads UI shows it. */
export interface BrowserDownloadSummary extends StoredDownload {
  /** A finished file that was moved or deleted since; Chrome labels it as removed. */
  isFileMissing: boolean;
  /** Chrome's 总是打开此类文件 is ticked for this file's type. */
  opensTypeAutomatically: boolean;
  /** The type may open by itself at all; dangerous types never do. */
  canOpenTypeAutomatically: boolean;
}

interface DownloadsFile {
  downloads: StoredDownload[];
  /** Extensions the user ticked 总是打开此类文件 for. */
  alwaysOpenExtensions: string[];
  /** Chrome's download.default_directory: where downloads go; null for the system folder. */
  defaultDirectory: string | null;
  /** Chrome's download.prompt_for_download: 下载前询问每个文件的保存位置. */
  promptForDownload: boolean;
  /** Chrome's download_bubble.partial_view_enabled: 下载完成后显示下载内容. */
  partialViewEnabled: boolean;
}

/** The download preferences settings' 下载内容 page shows. */
export interface BrowserDownloadSettings {
  directory: string;
  promptForDownload: boolean;
  partialViewEnabled: boolean;
}

interface BrowserLookup {
  browserIdForWebContents(contents: WebContents): string | null;
  /** The page `browserId` shows in the window whose renderer is `hostWebContentsId`. */
  webContentsForBrowser(browserId: string, hostWebContentsId: number): WebContents | null;
}

const ELECTRON_STATES: Record<ReturnType<DownloadItem["getState"]>, BrowserDownloadState> = {
  progressing: "in_progress",
  completed: "complete",
  cancelled: "cancelled",
  interrupted: "interrupted",
};
const STATES = new Set<string>(Object.values(ELECTRON_STATES));
const INTERRUPT_REASONS = new Set<string>(["shutdown", "unknown"]);

function readDownloadId(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readNullableString(value: unknown): string | null | undefined {
  if (value === null || typeof value === "string") {
    return value;
  }
  return undefined;
}

function readNullableNumber(value: unknown): number | null | undefined {
  if (value === null || typeof value === "number") {
    return value;
  }
  return undefined;
}

/** A remembered download from the downloads file, or null for an entry that doesn't fit. */
function readStoredDownload(value: unknown): StoredDownload | null {
  if (!isRecord(value)) {
    return null;
  }
  const browserId = readNullableString(value.browserId);
  const initiatorOrigin = readNullableString(value.initiatorOrigin);
  const endTime = readNullableNumber(value.endTime);
  const interruptReason = readNullableString(value.interruptReason);
  const hasStrings =
    typeof value.id === "string" &&
    typeof value.url === "string" &&
    typeof value.fileName === "string" &&
    typeof value.filePath === "string" &&
    typeof value.state === "string" &&
    STATES.has(value.state);
  const hasNumbers =
    typeof value.totalBytes === "number" &&
    typeof value.receivedBytes === "number" &&
    typeof value.startTime === "number";
  const hasNullables =
    browserId !== undefined &&
    initiatorOrigin !== undefined &&
    endTime !== undefined &&
    interruptReason !== undefined &&
    (interruptReason === null || INTERRUPT_REASONS.has(interruptReason));
  if (!hasStrings || !hasNumbers || !hasNullables || typeof value.openWhenDone !== "boolean") {
    return null;
  }
  return {
    id: value.id as string,
    url: value.url as string,
    browserId,
    initiatorOrigin,
    fileName: value.fileName as string,
    filePath: value.filePath as string,
    totalBytes: value.totalBytes as number,
    receivedBytes: value.receivedBytes as number,
    bytesPerSecond: 0,
    state: value.state as BrowserDownloadState,
    interruptReason: interruptReason as BrowserDownloadInterruptReason | null,
    isPaused: false,
    canResume: false,
    openWhenDone: value.openWhenDone,
    startTime: value.startTime as number,
    endTime,
  };
}

/** The site of the page that started a download; Chrome names only web origins. */
function initiatorOriginOf(contents: WebContents | undefined): string | null {
  const pageUrl = contents?.getURL();
  if (!pageUrl) {
    return null;
  }
  try {
    const parsed = new URL(pageUrl);
    return WEB_PROTOCOLS.has(parsed.protocol) ? parsed.origin : null;
  } catch {
    // A page address that doesn't parse names no site.
    return null;
  }
}

/**
 * Downloads from the browser session, kept the way Chrome keeps them: saved to the Downloads
 * folder without asking, listed newest first, and remembered across launches.
 */
export class BrowserDownloads {
  // Oldest first; the list IPC reverses it.
  private records = new Map<string, StoredDownload>();
  private readonly liveItems = new Map<string, DownloadItem>();
  // Paths given to downloads still running, which are not complete files on disk yet.
  private readonly reservedPaths = new Set<string>();
  // Names Helm gives downloads it starts itself, by address, as Chrome's
  // DownloadUrlParameters::set_suggested_name does for a QR code's image.
  private readonly suggestedNames = new Map<string, string>();
  private readonly lastReportTimes = new Map<string, number>();
  private alwaysOpenExtensions = new Set<string>();
  private defaultDirectory: string | null = null;
  private promptForDownload = false;
  private partialViewEnabled = true;
  // Entries taken off the list, newest batch last, for the downloads page's 撤销 and ⌘Z.
  private readonly removedBatches: StoredDownload[][] = [];
  // Saves run one after another so two writes never share the temporary file.
  private pendingSave: Promise<void> = Promise.resolve();
  // Chrome shows a finished download only in the profile's last-active browser window.
  private lastActiveWindow: BrowserWindow | null = null;

  constructor(
    private readonly session: Session,
    private readonly lookup: BrowserLookup,
  ) {}

  private get filePath(): string {
    return path.join(app.getPath("userData"), DOWNLOADS_FILE_NAME);
  }

  async start(): Promise<void> {
    await this.load();
    this.session.on("will-download", (_event, item, contents) => {
      this.track(item, contents);
    });
    app.on("browser-window-focus", (_event, window) => {
      this.lastActiveWindow = window;
    });
    this.registerIpc();
  }

  private track(item: DownloadItem, contents: WebContents | undefined): void {
    const id = randomUUID();
    const startTime = new Date();
    const directory = this.downloadDirectory();
    const fileName =
      this.takeSuggestedName(item.getURL()) ?? (item.getFilename() || DEFAULT_FILE_NAME);
    const savePath = this.promptForDownload
      ? null
      : uniqueDownloadPath({
          directory,
          fileName,
          startTime,
          isInUse: (candidate) => this.reservedPaths.has(candidate) || existsSync(candidate),
        });
    // Asked to, or without a free name, Electron asks where to save, as Chrome does, starting in
    // the download folder.
    if (savePath) {
      item.setSavePath(savePath);
      this.reservedPaths.add(savePath);
    } else {
      item.setSaveDialogOptions({ defaultPath: path.join(directory, fileName) });
    }
    this.liveItems.set(id, item);
    this.records.set(id, {
      ...this.progressOf(item),
      id,
      url: item.getURL(),
      browserId: contents ? this.lookup.browserIdForWebContents(contents) : null,
      initiatorOrigin: initiatorOriginOf(contents),
      interruptReason: null,
      openWhenDone: false,
      startTime: startTime.getTime(),
    });
    this.forgetOldest();
    this.report(id);
    // Saved now, so a download cut off by quitting still shows as failed after a restart.
    void this.save();

    item.on("updated", () => {
      this.updateRecord(id, item);
      this.reportThrottled(id);
    });
    item.once("done", () => {
      if (savePath) {
        this.reservedPaths.delete(savePath);
      }
      this.liveItems.delete(id);
      this.lastReportTimes.delete(id);
      this.updateRecord(id, item);
      this.report(id);
      void this.save();
      this.openIfWanted(id);
      this.showDetailsIfAllDone(id);
    });
  }

  /**
   * download_display_controller.cc: when a download finishes and nothing else is still
   * transferring, the last-active window opens its partial bubble.
   */
  private showDetailsIfAllDone(id: string): void {
    const record = this.records.get(id);
    // An interrupted download that can resume is not done yet.
    const isDone = record !== undefined && !(record.state === "interrupted" && record.canResume);
    const isAllDone = [...this.liveItems.values()].every((item) => item.isPaused());
    if (!this.partialViewEnabled || !isDone || !isAllDone) {
      return;
    }
    const window =
      this.lastActiveWindow && !this.lastActiveWindow.isDestroyed()
        ? this.lastActiveWindow
        : (BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? null);
    window?.webContents.send(BROWSER_DOWNLOADS_SHOW_DETAILS_EVENT);
  }

  private progressOf(
    item: DownloadItem,
  ): Pick<
    StoredDownload,
    | "fileName"
    | "filePath"
    | "totalBytes"
    | "receivedBytes"
    | "bytesPerSecond"
    | "state"
    | "isPaused"
    | "canResume"
    | "endTime"
  > {
    const state = ELECTRON_STATES[item.getState()];
    const filePath = item.getSavePath();
    const endTimeSeconds = item.getEndTime();
    const isFinished = state !== "in_progress";
    let endTime: number | null = null;
    if (isFinished) {
      endTime = endTimeSeconds > 0 ? endTimeSeconds * MILLISECONDS_PER_SECOND : Date.now();
    }
    return {
      fileName: filePath ? path.basename(filePath) : item.getFilename(),
      filePath,
      totalBytes: item.getTotalBytes(),
      receivedBytes: item.getReceivedBytes(),
      bytesPerSecond: isFinished ? 0 : item.getCurrentBytesPerSecond(),
      state,
      isPaused: item.isPaused(),
      canResume: item.canResume(),
      endTime,
    };
  }

  private updateRecord(id: string, item: DownloadItem): void {
    const record = this.records.get(id);
    if (!record) {
      return;
    }
    const progress = this.progressOf(item);
    const interruptReason = progress.state === "interrupted" ? "unknown" : null;
    this.records.set(id, { ...record, ...progress, interruptReason });
  }

  /** Opens a finished file when the user asked for it, or for every file of its type. */
  private openIfWanted(id: string): void {
    const record = this.records.get(id);
    if (record?.state !== "complete") {
      return;
    }
    const opensType = this.alwaysOpenExtensions.has(downloadExtension(record.fileName));
    if (record.openWhenDone || opensType) {
      void this.openFile(record);
    }
  }

  private async openFile(record: StoredDownload): Promise<void> {
    const failure = await shell.openPath(record.filePath);
    if (failure) {
      log.warn("[browser-downloads] open failed", { id: record.id, failure });
    }
  }

  private summaryOf(record: StoredDownload): BrowserDownloadSummary {
    return {
      ...record,
      isFileMissing: record.state === "complete" && !existsSync(record.filePath),
      opensTypeAutomatically: this.alwaysOpenExtensions.has(downloadExtension(record.fileName)),
      canOpenTypeAutomatically: canOpenTypeAutomatically(record.fileName),
    };
  }

  private reportThrottled(id: string): void {
    const now = Date.now();
    const lastReportTime = this.lastReportTimes.get(id) ?? 0;
    if (now - lastReportTime < PROGRESS_REPORT_INTERVAL_MS) {
      return;
    }
    this.lastReportTimes.set(id, now);
    this.report(id);
  }

  /**
   * Chrome's Dock tile shows the progress of running downloads (dock_icon.mm). The Dock badge
   * already carries Helm's own count, so only the progress bar shows here.
   */
  private reportDockProgress(): void {
    let receivedBytes = 0;
    let totalBytes = 0;
    for (const item of this.liveItems.values()) {
      receivedBytes += item.getReceivedBytes();
      totalBytes += item.getTotalBytes();
    }
    const hasRunning = this.liveItems.size > 0;
    // -1 removes the bar; 2 shows Electron's indeterminate bar while a size is unknown.
    let progress = -1;
    if (hasRunning) {
      progress = totalBytes > 0 ? receivedBytes / totalBytes : INDETERMINATE_PROGRESS;
    }
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) {
        window.setProgressBar(progress);
      }
    }
  }

  private report(id: string): void {
    const record = this.records.get(id);
    if (!record) {
      return;
    }
    this.reportDockProgress();
    const summary = this.summaryOf(record);
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) {
        window.webContents.send(BROWSER_DOWNLOAD_CHANGED_EVENT, summary);
      }
    }
  }

  private reportRemoved(ids: string[]): void {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) {
        window.webContents.send(BROWSER_DOWNLOADS_REMOVED_EVENT, ids);
      }
    }
  }

  /** Newest first, with finished files checked against the disk as Chrome's page does. */
  list(): BrowserDownloadSummary[] {
    const oldestFirst = [...this.records.values()];
    const newestFirst: BrowserDownloadSummary[] = [];
    for (let index = oldestFirst.length - 1; index >= 0; index -= 1) {
      const record = oldestFirst[index];
      if (record) {
        newestFirst.push(this.summaryOf(record));
      }
    }
    return newestFirst;
  }

  /** Takes entries off the list; the files stay, and running downloads aren't taken. */
  private takeOff(ids: string[]): StoredDownload[] {
    const removed: StoredDownload[] = [];
    for (const id of ids) {
      const record = this.records.get(id);
      if (this.liveItems.has(id) || !record) {
        continue;
      }
      this.records.delete(id);
      removed.push(record);
    }
    if (removed.length > 0) {
      this.reportRemoved(removed.map((record) => record.id));
      void this.save();
    }
    return removed;
  }

  /** Chrome's "remove from list", which the downloads page can undo. */
  private remove(ids: string[]): void {
    const removed = this.takeOff(ids);
    if (removed.length > 0) {
      this.removedBatches.push(removed);
    }
  }

  /** The downloads page's 撤销: the last removed entries come back in their places. */
  private undoRemove(): void {
    const batch = this.removedBatches.pop();
    if (!batch) {
      return;
    }
    const restored = [...this.records.values(), ...batch].sort(
      (first, second) => first.startTime - second.startTime,
    );
    this.records = new Map(restored.map((record) => [record.id, record]));
    for (const record of batch) {
      this.report(record.id);
    }
    void this.save();
  }

  private forgetOldest(): void {
    for (const id of this.records.keys()) {
      if (this.records.size <= MAX_REMEMBERED_DOWNLOADS) {
        return;
      }
      if (!this.liveItems.has(id)) {
        this.records.delete(id);
      }
    }
  }

  private takeSuggestedName(url: string): string | null {
    const name = this.suggestedNames.get(url) ?? null;
    this.suggestedNames.delete(url);
    return name;
  }

  private retry(id: string): void {
    const liveItem = this.liveItems.get(id);
    if (liveItem?.canResume()) {
      liveItem.resume();
      return;
    }
    const record = this.records.get(id);
    if (!record || liveItem) {
      return;
    }
    // A download that can't resume starts over; the new one takes the old one's place.
    this.takeOff([id]);
    this.session.downloadURL(record.url);
  }

  private setOpenWhenDone(id: string, openWhenDone: boolean): void {
    const record = this.records.get(id);
    if (!record || record.state !== "in_progress") {
      return;
    }
    this.records.set(id, { ...record, openWhenDone });
    this.report(id);
    void this.save();
  }

  private downloadDirectory(): string {
    return this.defaultDirectory ?? app.getPath("downloads");
  }

  private settings(): BrowserDownloadSettings {
    return {
      directory: this.downloadDirectory(),
      promptForDownload: this.promptForDownload,
      partialViewEnabled: this.partialViewEnabled,
    };
  }

  /** Settings' 位置 › 更改: a folder panel opening on the current folder. */
  private async chooseDirectory(owner: BrowserWindow | null): Promise<BrowserDownloadSettings> {
    const options: Electron.OpenDialogOptions = {
      defaultPath: this.downloadDirectory(),
      properties: ["openDirectory", "createDirectory"],
    };
    const result = owner
      ? await dialog.showOpenDialog(owner, options)
      : await dialog.showOpenDialog(options);
    const [chosen] = result.filePaths;
    if (!result.canceled && chosen) {
      this.defaultDirectory = chosen;
      void this.save();
    }
    return this.settings();
  }

  /** Chrome's 总是打开此类文件 for the download's type, shown on every download of that type. */
  private setOpensTypeAutomatically(id: string, opensType: boolean): void {
    const record = this.records.get(id);
    if (!record || !canOpenTypeAutomatically(record.fileName)) {
      return;
    }
    const extension = downloadExtension(record.fileName);
    if (opensType) {
      this.alwaysOpenExtensions.add(extension);
    } else {
      this.alwaysOpenExtensions.delete(extension);
    }
    for (const candidate of this.records.values()) {
      if (downloadExtension(candidate.fileName) === extension) {
        this.report(candidate.id);
      }
    }
    void this.save();
  }

  /** The Finder icon of a finished file, as Chrome's rows show it; null until the file is in. */
  private async fileIcon(id: string): Promise<string | null> {
    const record = this.records.get(id);
    if (record?.state !== "complete" || !existsSync(record.filePath)) {
      return null;
    }
    try {
      const icon = await app.getFileIcon(record.filePath, { size: "normal" });
      return icon.toDataURL();
    } catch (error) {
      // The row keeps Chrome's generic file icon.
      log.warn("[browser-downloads] file icon unavailable", { id, error });
      return null;
    }
  }

  private registerIpc(): void {
    ipcMain.handle("paseo:browser:downloads:list", () => this.list());
    ipcMain.handle("paseo:browser:downloads:pause", (_event, rawId: unknown) => {
      this.liveItem(rawId)?.pause();
    });
    ipcMain.handle("paseo:browser:downloads:resume", (_event, rawId: unknown) => {
      this.liveItem(rawId)?.resume();
    });
    ipcMain.handle("paseo:browser:downloads:cancel", (_event, rawId: unknown) => {
      this.liveItem(rawId)?.cancel();
    });
    ipcMain.handle("paseo:browser:downloads:retry", (_event, rawId: unknown) => {
      const id = readDownloadId(rawId);
      if (id) {
        this.retry(id);
      }
    });
    ipcMain.handle("paseo:browser:downloads:open", async (_event, rawId: unknown) => {
      const record = this.record(rawId);
      if (record?.state === "complete") {
        await this.openFile(record);
      }
    });
    ipcMain.handle("paseo:browser:downloads:show-in-folder", (_event, rawId: unknown) => {
      const record = this.record(rawId);
      if (record?.filePath) {
        shell.showItemInFolder(this.pathOnDisk(record.filePath));
      }
    });
    ipcMain.handle("paseo:browser:downloads:remove", (_event, rawId: unknown) => {
      const id = readDownloadId(rawId);
      if (id) {
        this.remove([id]);
      }
    });
    // 删除浏览数据's 下载记录: entries started inside the range, for good, while downloads
    // still running stay.
    ipcMain.handle("paseo:browser:downloads:delete-history", (_event, rawSince: unknown) => {
      if (typeof rawSince !== "number") {
        return;
      }
      const ids = [...this.records.values()]
        .filter((record) => record.startTime >= rawSince)
        .map((record) => record.id);
      this.takeOff(ids);
    });
    ipcMain.handle("paseo:browser:downloads:clear-all", () => {
      this.remove([...this.records.keys()]);
    });
    ipcMain.handle("paseo:browser:downloads:undo-remove", () => {
      this.undoRemove();
    });
    ipcMain.handle(
      "paseo:browser:downloads:set-open-when-done",
      (_event, rawId: unknown, openWhenDone: unknown) => {
        const id = readDownloadId(rawId);
        if (id && typeof openWhenDone === "boolean") {
          this.setOpenWhenDone(id, openWhenDone);
        }
      },
    );
    ipcMain.handle(
      "paseo:browser:downloads:set-opens-type-automatically",
      (_event, rawId: unknown, opensType: unknown) => {
        const id = readDownloadId(rawId);
        if (id && typeof opensType === "boolean") {
          this.setOpensTypeAutomatically(id, opensType);
        }
      },
    );
    ipcMain.handle(
      "paseo:browser:downloads:download-named",
      (event, rawBrowserId: unknown, rawUrl: unknown, rawFileName: unknown) => {
        const isValid =
          typeof rawBrowserId === "string" &&
          typeof rawUrl === "string" &&
          typeof rawFileName === "string";
        if (!isValid) {
          return;
        }
        const contents = this.lookup.webContentsForBrowser(rawBrowserId, event.sender.id);
        if (!contents) {
          return;
        }
        this.suggestedNames.set(rawUrl, path.basename(rawFileName));
        contents.downloadURL(rawUrl);
      },
    );
    ipcMain.handle("paseo:browser:downloads:file-icon", (_event, rawId: unknown) => {
      const id = readDownloadId(rawId);
      return id ? this.fileIcon(id) : null;
    });
    ipcMain.handle("paseo:browser:downloads:settings", () => this.settings());
    ipcMain.handle("paseo:browser:downloads:choose-directory", (event) =>
      this.chooseDirectory(BrowserWindow.fromWebContents(event.sender)),
    );
    ipcMain.handle(
      "paseo:browser:downloads:set-prompt-for-download",
      (_event, rawPrompt: unknown) => {
        if (typeof rawPrompt !== "boolean") {
          return this.settings();
        }
        this.promptForDownload = rawPrompt;
        void this.save();
        return this.settings();
      },
    );
    ipcMain.handle(
      "paseo:browser:downloads:set-partial-view-enabled",
      (_event, rawEnabled: unknown) => {
        if (typeof rawEnabled !== "boolean") {
          return this.settings();
        }
        this.partialViewEnabled = rawEnabled;
        void this.save();
        return this.settings();
      },
    );
  }

  /**
   * The file to reveal: the finished file, or while it downloads the partial file Chromium writes
   * next to it, or else its folder.
   */
  private pathOnDisk(filePath: string): string {
    const partialPath = `${filePath}${PARTIAL_FILE_SUFFIX}`;
    if (existsSync(filePath)) {
      return filePath;
    }
    return existsSync(partialPath) ? partialPath : path.dirname(filePath);
  }

  private liveItem(rawId: unknown): DownloadItem | undefined {
    const id = readDownloadId(rawId);
    return id ? this.liveItems.get(id) : undefined;
  }

  private record(rawId: unknown): StoredDownload | undefined {
    const id = readDownloadId(rawId);
    return id ? this.records.get(id) : undefined;
  }

  private async load(): Promise<void> {
    let raw: string;
    try {
      raw = await readFile(this.filePath, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return;
      }
      throw error;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      // A damaged file only loses the download history; downloads themselves are files on disk.
      log.warn("[browser-downloads] unreadable downloads file; starting empty", error);
      return;
    }
    const file = isRecord(parsed) ? parsed : {};
    const storedDownloads = Array.isArray(file.downloads) ? file.downloads : [];
    for (const value of storedDownloads) {
      const record = readStoredDownload(value);
      if (!record) {
        log.warn("[browser-downloads] skipping an unreadable download entry");
        continue;
      }
      // The app quit while it ran: Chrome lists such a download as failed.
      const isCutOff = record.state === "in_progress";
      this.records.set(record.id, {
        ...record,
        state: isCutOff ? "interrupted" : record.state,
        interruptReason: isCutOff ? "shutdown" : record.interruptReason,
        endTime: isCutOff ? record.startTime : record.endTime,
      });
    }
    const extensions = Array.isArray(file.alwaysOpenExtensions) ? file.alwaysOpenExtensions : [];
    this.alwaysOpenExtensions = new Set(
      extensions.filter((extension): extension is string => typeof extension === "string"),
    );
    this.defaultDirectory =
      typeof file.defaultDirectory === "string" ? file.defaultDirectory : null;
    this.promptForDownload = file.promptForDownload === true;
    this.partialViewEnabled = file.partialViewEnabled !== false;
  }

  private save(): Promise<void> {
    this.pendingSave = this.pendingSave.then(() => this.write());
    return this.pendingSave;
  }

  private async write(): Promise<void> {
    const file: DownloadsFile = {
      downloads: [...this.records.values()],
      alwaysOpenExtensions: [...this.alwaysOpenExtensions],
      defaultDirectory: this.defaultDirectory,
      promptForDownload: this.promptForDownload,
      partialViewEnabled: this.partialViewEnabled,
    };
    // Write then rename, so a crash mid-write leaves the previous file intact.
    const temporaryPath = `${this.filePath}.tmp`;
    try {
      await mkdir(path.dirname(this.filePath), { recursive: true });
      await writeFile(temporaryPath, JSON.stringify(file));
      await rename(temporaryPath, this.filePath);
    } catch (error) {
      // The downloads themselves are files on disk; only the list on the downloads page is lost.
      log.warn("[browser-downloads] could not save the download history", error);
    }
  }
}
