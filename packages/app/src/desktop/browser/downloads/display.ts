import type { DesktopBrowserDownload } from "@/desktop/host";

const MINUTE_MS = 60_000;
// download_bubble_update_service.cc: the bubble lists downloads of the last day, 30 at most.
const BUBBLE_MAX_AGE_MS = 24 * 60 * MINUTE_MS;
const BUBBLE_MAX_ROWS = 30;
// download_display_controller.cc: the button stays for an hour after the last download ends
// and looks active for a minute after one finishes.
const BUTTON_VISIBLE_AFTER_DONE_MS = 60 * MINUTE_MS;
const BUTTON_ACTIVE_AFTER_DONE_MS = MINUTE_MS;
const PERCENT = 100;

function isRunning(download: DesktopBrowserDownload): boolean {
  return download.state === "in_progress" && !download.isPaused;
}

function rowGroup(download: DesktopBrowserDownload): number {
  if (isRunning(download)) {
    return 0;
  }
  return download.state === "in_progress" ? 1 : 2;
}

/**
 * The bubble's rows: downloads started in the last day, running ones first, then paused ones,
 * then the rest, newest first within each group.
 */
export function bubbleDownloads(
  downloads: readonly DesktopBrowserDownload[],
  now: number,
): DesktopBrowserDownload[] {
  return downloads
    .filter((download) => now - download.startTime < BUBBLE_MAX_AGE_MS)
    .sort(
      (first, second) => rowGroup(first) - rowGroup(second) || second.startTime - first.startTime,
    )
    .slice(0, BUBBLE_MAX_ROWS);
}

/** What the toolbar button draws around its arrow while downloads run. */
export type DownloadButtonRing =
  | { kind: "progress"; percent: number }
  /** Some download has no known size: Chrome spins three arcs. */
  | { kind: "spinner" };

export type DownloadButtonTooltip =
  | { kind: "inProgress"; count: number }
  | { kind: "newDownload" }
  | { kind: "idle" };

export interface DownloadButtonState {
  isShown: boolean;
  /** The arrow alone while something downloads; the tray and arrow otherwise. */
  icon: "inProgress" | "idle";
  /** Blue icon and the underline (IconActive::kActive). */
  isActive: boolean;
  ring: DownloadButtonRing | null;
  /** The count Chrome badges when two or more downloads run; null for no badge. */
  badgeCount: number | null;
  tooltip: DownloadButtonTooltip;
}

/** The latest end of a finished download, or null when none finished. */
function latestEndTime(downloads: readonly DesktopBrowserDownload[]): number | null {
  let latest: number | null = null;
  for (const download of downloads) {
    if (download.state !== "in_progress" && download.endTime !== null) {
      latest = latest === null ? download.endTime : Math.max(latest, download.endTime);
    }
  }
  return latest;
}

function progressRing(inProgress: readonly DesktopBrowserDownload[]): DownloadButtonRing {
  if (inProgress.some((download) => download.totalBytes <= 0)) {
    return { kind: "spinner" };
  }
  let receivedBytes = 0;
  let totalBytes = 0;
  for (const download of inProgress) {
    receivedBytes += download.receivedBytes;
    totalBytes += download.totalBytes;
  }
  return { kind: "progress", percent: Math.floor((receivedBytes * PERCENT) / totalBytes) };
}

/**
 * The toolbar button's look (download_display_controller.cc, download_toolbar_ui_controller.cc)
 * for the bubble's rows. `actionedIds` are the downloads the user has seen finished in the full
 * bubble; a finished download nobody has seen there keeps the "new download" look for a minute.
 */
export function downloadButtonState(input: {
  rows: readonly DesktopBrowserDownload[];
  now: number;
  actionedIds: ReadonlySet<string>;
}): DownloadButtonState {
  const inProgress = input.rows.filter((download) => download.state === "in_progress");
  const isRunningAny = inProgress.some(isRunning);
  const lastEnd = latestEndTime(input.rows);
  const isRecentlyDone = lastEnd !== null && input.now - lastEnd < BUTTON_VISIBLE_AFTER_DONE_MS;
  const isNewDownload =
    inProgress.length === 0 &&
    lastEnd !== null &&
    input.now - lastEnd < BUTTON_ACTIVE_AFTER_DONE_MS &&
    input.rows.some((download) => !input.actionedIds.has(download.id));
  const isActive = isRunningAny || isNewDownload;

  let tooltip: DownloadButtonTooltip = { kind: "idle" };
  if (inProgress.length > 0) {
    tooltip = { kind: "inProgress", count: inProgress.length };
  } else if (isNewDownload) {
    tooltip = { kind: "newDownload" };
  }
  return {
    isShown: input.rows.length > 0 && (inProgress.length > 0 || isRecentlyDone),
    icon: inProgress.length > 0 ? "inProgress" : "idle",
    isActive,
    ring: inProgress.length > 0 ? progressRing(inProgress) : null,
    badgeCount: isActive && inProgress.length >= 2 ? inProgress.length : null,
    tooltip,
  };
}

/**
 * When the button's look next changes with no download changing: Chrome's one-minute "new
 * download" timer and its one-hour stay in the toolbar, both counted from the last finish.
 */
export function nextButtonChangeAt(
  rows: readonly DesktopBrowserDownload[],
  now: number,
): number | null {
  const lastEnd = latestEndTime(rows);
  if (lastEnd === null) {
    return null;
  }
  for (const deadline of [
    lastEnd + BUTTON_ACTIVE_AFTER_DONE_MS,
    lastEnd + BUTTON_VISIBLE_AFTER_DONE_MS,
  ]) {
    if (deadline > now) {
      return deadline;
    }
  }
  return null;
}

/** Whether any download is transferring; when the last one stops Chrome opens its partial bubble. */
export function hasRunningDownloads(rows: readonly DesktopBrowserDownload[]): boolean {
  return rows.some(isRunning);
}
