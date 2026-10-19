import type { DesktopBrowserDownload } from "@/desktop/host";

/** The icon buttons at a card's top right, left to right (item.html.ts). */
export type DownloadCardButton = "copyLink" | "moreActions" | "showInFolder" | "remove";

/** The items of a card's ⋮ menu, in Chrome's order. */
export type DownloadMenuAction = "pause" | "resume" | "cancel" | "remove" | "retry";

function isRunning(download: DesktopBrowserDownload): boolean {
  return download.state === "in_progress" && !download.isPaused;
}

function isFileOnDisk(download: DesktopBrowserDownload): boolean {
  return download.state === "complete" && !download.isFileMissing;
}

/**
 * Whether the card looks active: white with a shadow. Paused, cancelled, failed and removed
 * downloads get the gray card with their name struck through (item.css).
 */
export function isActiveCard(download: DesktopBrowserDownload): boolean {
  return isRunning(download) || isFileOnDisk(download);
}

/** downloads-spec §3.4: what each state offers in its ⋮ menu. */
export function cardMenuActions(download: DesktopBrowserDownload): DownloadMenuAction[] {
  if (download.state === "in_progress") {
    return download.isPaused ? ["resume", "cancel"] : ["pause", "cancel"];
  }
  if (download.state === "cancelled") {
    return ["remove", "retry"];
  }
  if (download.state === "interrupted") {
    return download.canResume ? ["resume", "remove"] : ["remove", "retry"];
  }
  return [];
}

/**
 * The card's buttons: the link always; ⋮ when the menu has something, which takes the folder's
 * place; the folder for a file on disk; ✕ for anything no longer downloading.
 */
export function cardButtons(download: DesktopBrowserDownload): DownloadCardButton[] {
  const buttons: DownloadCardButton[] = ["copyLink"];
  if (cardMenuActions(download).length > 0) {
    buttons.push("moreActions");
  } else if (isFileOnDisk(download)) {
    buttons.push("showInFolder");
  }
  if (download.state !== "in_progress") {
    buttons.push("remove");
  }
  return buttons;
}

/** The page's live search: the file name and the address, ignoring case. */
export function matchesSearch(download: DesktopBrowserDownload, query: string): boolean {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) {
    return true;
  }
  return (
    download.fileName.toLocaleLowerCase().includes(needle) ||
    download.url.toLocaleLowerCase().includes(needle)
  );
}

function dayOf(time: number): string {
  return new Date(time).toDateString();
}

/** Chrome heads only the first card of each day with its date. */
export function startsNewDay(downloads: readonly DesktopBrowserDownload[], index: number): boolean {
  const download = downloads[index];
  const previous = downloads[index - 1];
  if (!download) {
    return false;
  }
  return !previous || dayOf(previous.startTime) !== dayOf(download.startTime);
}

/** 全部清除 shows while something can be cleared: everything not still downloading. */
export function hasClearableDownloads(downloads: readonly DesktopBrowserDownload[]): boolean {
  return downloads.some((download) => download.state !== "in_progress");
}

/** What the 来自 line names: the site's host, as Chrome omits http and https. */
export function initiatorHost(download: DesktopBrowserDownload): string | null {
  if (!download.initiatorOrigin) {
    return null;
  }
  try {
    return new URL(download.initiatorOrigin).host;
  } catch {
    // An origin that doesn't parse names no site.
    return null;
  }
}
