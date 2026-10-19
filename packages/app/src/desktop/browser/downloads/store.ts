import { useEffect } from "react";
import { z } from "zod";
import { create } from "zustand";
import { getIsElectron } from "@/constants/platform";
import { getDesktopHost, type DesktopBrowserDownload } from "@/desktop/host";
import { useDesktopEvent } from "@/desktop/electron/use-desktop-event";
import { useDownloadsUiStore } from "./ui-state";

const DownloadSchema = z.object({
  id: z.string(),
  url: z.string(),
  browserId: z.string().nullable(),
  initiatorOrigin: z.string().nullable(),
  fileName: z.string(),
  filePath: z.string(),
  totalBytes: z.number(),
  receivedBytes: z.number(),
  bytesPerSecond: z.number(),
  state: z.enum(["in_progress", "complete", "cancelled", "interrupted"]),
  interruptReason: z.enum(["shutdown", "unknown"]).nullable(),
  isPaused: z.boolean(),
  canResume: z.boolean(),
  openWhenDone: z.boolean(),
  startTime: z.number(),
  endTime: z.number().nullable(),
  isFileMissing: z.boolean(),
  opensTypeAutomatically: z.boolean(),
  canOpenTypeAutomatically: z.boolean(),
});

const RemovedIdsSchema = z.array(z.string());

interface BrowserDownloadsState {
  /** Newest first, as Chrome's downloads page and bubble list them. */
  downloads: DesktopBrowserDownload[];
}

/** The browser profile's downloads; the main process owns them and reports every change. */
export const useBrowserDownloadsStore = create<BrowserDownloadsState>()(() => ({
  downloads: [],
}));

/** Adds or updates a download; returns whether it is one this window hadn't seen. */
function upsertDownload(download: DesktopBrowserDownload): boolean {
  const isNew = !useBrowserDownloadsStore
    .getState()
    .downloads.some((existing) => existing.id === download.id);
  useBrowserDownloadsStore.setState((state) => {
    const index = state.downloads.findIndex((existing) => existing.id === download.id);
    if (index < 0) {
      return { downloads: [download, ...state.downloads] };
    }
    const downloads = [...state.downloads];
    downloads[index] = download;
    return { downloads };
  });
  return isNew;
}

function removeDownloads(removedIds: readonly string[]): void {
  const removed = new Set(removedIds);
  useBrowserDownloadsStore.setState((state) => ({
    downloads: state.downloads.filter((download) => !removed.has(download.id)),
  }));
}

/** Loads the download list once and applies the changes the main process reports after that. */
export function useBrowserDownloadsSync(): void {
  useDesktopEvent<unknown>("browser-download-changed", (payload) => {
    const parsed = DownloadSchema.safeParse(payload);
    if (!parsed.success) {
      console.error("[browser-downloads] malformed download", parsed.error);
      return;
    }
    const isNew = upsertDownload(parsed.data);
    // An entry restored by 撤销 is new to this list too, but only a running one just started.
    if (isNew && parsed.data.state === "in_progress") {
      useDownloadsUiStore.getState().noteStarted(parsed.data);
    }
  });
  // The main process asks the last-active window to show what finished (DownloadDisplayController).
  useDesktopEvent<unknown>("browser-downloads-show-details", () => {
    useDownloadsUiStore.getState().requestDetails();
  });
  useDesktopEvent<unknown>("browser-downloads-removed", (payload) => {
    const parsed = RemovedIdsSchema.safeParse(payload);
    if (!parsed.success) {
      console.error("[browser-downloads] malformed removal", parsed.error);
      return;
    }
    removeDownloads(parsed.data);
  });
  useEffect(() => {
    const downloadsBridge = getDesktopHost()?.browser?.downloads;
    if (!getIsElectron() || !downloadsBridge) {
      return;
    }
    void downloadsBridge
      .list()
      .then((downloads) => {
        useBrowserDownloadsStore.setState({ downloads });
        return undefined;
      })
      .catch((error: unknown) => {
        console.error("[browser-downloads] list failed", error);
      });
  }, []);
}
