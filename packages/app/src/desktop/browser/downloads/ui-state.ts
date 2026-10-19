import { useEffect, useState } from "react";
import { create } from "zustand";

// download_bubble_ui_controller.cc: a partial bubble opens at most once every 15 s.
const PARTIAL_VIEW_MIN_INTERVAL_MS = 15_000;

/**
 * What the user has seen of their downloads, and requests for the toolbar button. Chrome keeps
 * this in memory for the session, so a restart starts over.
 */
interface DownloadsUiState {
  /**
   * Finished downloads the user has seen in the full bubble (DownloadUIModel::WasActionedOn):
   * they no longer make the button look new and no longer go in a partial bubble.
   */
  actionedIds: ReadonlySet<string>;
  /** When a partial bubble last opened; opening the full bubble lifts the limit. */
  lastPartialViewAt: number;
  /** Counts the main process's "show the details" signals; the presented button reacts to each. */
  detailsRequestCount: number;
  /** The newest download that started, for the started animation in the page it came from. */
  lastStarted: { downloadId: string; browserId: string | null; sequence: number } | null;
  /** The user opened the full bubble with `ids` in it. */
  markViewed: (ids: readonly string[]) => void;
  /** A partial bubble opened at `now`. */
  notePartialView: (now: number) => void;
  requestDetails: () => void;
  noteStarted: (download: { id: string; browserId: string | null }) => void;
}

export const useDownloadsUiStore = create<DownloadsUiState>()((set) => ({
  actionedIds: new Set(),
  lastPartialViewAt: 0,
  detailsRequestCount: 0,
  lastStarted: null,
  markViewed: (ids) => {
    set((state) => ({
      actionedIds: new Set([...state.actionedIds, ...ids]),
      lastPartialViewAt: 0,
    }));
  },
  notePartialView: (now) => set({ lastPartialViewAt: now }),
  requestDetails: () => set((state) => ({ detailsRequestCount: state.detailsRequestCount + 1 })),
  noteStarted: (download) => {
    set((state) => ({
      lastStarted: {
        downloadId: download.id,
        browserId: download.browserId,
        sequence: (state.lastStarted?.sequence ?? 0) + 1,
      },
    }));
  },
}));

export function canShowPartialView(lastPartialViewAt: number, now: number): boolean {
  return now - lastPartialViewAt >= PARTIAL_VIEW_MIN_INTERVAL_MS;
}

/** The current time, refreshed every `intervalMs` while the caller is mounted. */
export function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}
