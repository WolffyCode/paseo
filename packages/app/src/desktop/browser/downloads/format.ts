import type { TFunction } from "i18next";
import type { DesktopBrowserDownload } from "@/desktop/host";

// ui/base/text/bytes_formatting.cc: 1024-based units. A count is shown in a unit from these
// sizes up: bytes below 3 KiB, KB below 2 MiB, MB below 1 GiB.
const BYTES_PER_KIB = 1024;
const BYTE_UNITS = [
  { minimumBytes: 0, key: "bytes" },
  { minimumBytes: 3 * BYTES_PER_KIB, key: "kilobytes" },
  { minimumBytes: 2 * BYTES_PER_KIB ** 2, key: "megabytes" },
  { minimumBytes: BYTES_PER_KIB ** 3, key: "gigabytes" },
  { minimumBytes: BYTES_PER_KIB ** 4, key: "terabytes" },
] as const;
type ByteUnitIndex = 0 | 1 | 2 | 3 | 4;
// A quantity below this in its unit keeps one decimal (bytes never do).
const ONE_DECIMAL_BELOW = 100;

// ui/base/l10n/time_format.cc rounds to the nearest unit and moves up past these points.
const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 3600;
const SECONDS_PER_DAY = 86400;
const SECONDS_LIMIT = 59.5;
const MINUTES_LIMIT_SECONDS = 59.5 * SECONDS_PER_MINUTE;
const HOURS_LIMIT_SECONDS = 23.5 * SECONDS_PER_HOUR;
const MILLISECONDS_PER_SECOND = 1000;

/** Chrome shows 完成 for this long after a download finishes, then how long ago it did. */
const JUST_FINISHED_MS = 60 * MILLISECONDS_PER_SECOND;

function byteUnitIndex(bytes: number): ByteUnitIndex {
  let index = BYTE_UNITS.length - 1;
  while (index > 0 && bytes < BYTE_UNITS[index].minimumBytes) {
    index -= 1;
  }
  return index as ByteUnitIndex;
}

function formatQuantity(bytes: number, unitIndex: ByteUnitIndex, locale: string): string {
  const amount = bytes / BYTES_PER_KIB ** unitIndex;
  const hasDecimal = bytes !== 0 && unitIndex !== 0 && amount < ONE_DECIMAL_BELOW;
  const digits = hasDecimal ? 1 : 0;
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(amount);
}

/** A size such as "10.5 MB" (ui::FormatBytes). */
export function formatBytes(bytes: number, t: TFunction, locale: string): string {
  const unitIndex = byteUnitIndex(bytes);
  return t(`workspace.browser.downloads.units.${BYTE_UNITS[unitIndex].key}`, {
    quantity: formatQuantity(bytes, unitIndex, locale),
  });
}

/** A speed such as "253 KB/s" (ui::FormatSpeed). */
export function formatSpeed(bytesPerSecond: number, t: TFunction, locale: string): string {
  const unitIndex = byteUnitIndex(bytesPerSecond);
  return t(`workspace.browser.downloads.speedUnits.${BYTE_UNITS[unitIndex].key}`, {
    quantity: formatQuantity(bytesPerSecond, unitIndex, locale),
  });
}

/** "10.5/500 MB": both counts in the total's unit, the unit written once. */
export function formatSizePair(
  receivedBytes: number,
  totalBytes: number,
  t: TFunction,
  locale: string,
): string {
  return t("workspace.browser.downloads.sizes", {
    received: formatQuantity(receivedBytes, byteUnitIndex(totalBytes), locale),
    total: formatBytes(totalBytes, t, locale),
  });
}

type TimeUnit = "seconds" | "minutes" | "hours" | "days";

/** The unit and rounded count Chrome's TimeFormat::Simple picks for a span. */
function timeSpan(seconds: number): { unit: TimeUnit; count: number } {
  if (seconds < SECONDS_LIMIT) {
    return { unit: "seconds", count: Math.round(seconds) };
  }
  if (seconds < MINUTES_LIMIT_SECONDS) {
    return { unit: "minutes", count: Math.round(seconds / SECONDS_PER_MINUTE) };
  }
  if (seconds < HOURS_LIMIT_SECONDS) {
    return { unit: "hours", count: Math.round(seconds / SECONDS_PER_HOUR) };
  }
  return { unit: "days", count: Math.round(seconds / SECONDS_PER_DAY) };
}

/**
 * One of Chrome's counted messages. Each has a form for exactly one and one for any other
 * count; docs/i18n.md explains why a locale carries no more.
 */
function countedText(key: string, count: number, t: TFunction): string {
  return count === 1 ? t(`${key}One`) : t(`${key}Other`, { count });
}

/** "还剩 33 分钟": Chrome's long remaining time, as the bubble writes it. */
export function formatTimeLeft(seconds: number, t: TFunction): string {
  const span = timeSpan(seconds);
  return countedText(`workspace.browser.downloads.timeLeft.${span.unit}`, span.count, t);
}

/** "还剩 33 分钟" in the downloads page's short form ("33 mins left"). */
export function formatTimeLeftShort(seconds: number, t: TFunction): string {
  const span = timeSpan(seconds);
  return countedText(`workspace.browser.downloads.timeLeftShort.${span.unit}`, span.count, t);
}

/** "3 分钟前". */
export function formatTimeAgo(seconds: number, t: TFunction): string {
  const span = timeSpan(seconds);
  return countedText(`workspace.browser.downloads.timeAgo.${span.unit}`, span.count, t);
}

/** "3 分钟", as in 即将在 3 分钟后打开…. */
export function formatDuration(seconds: number, t: TFunction): string {
  const span = timeSpan(seconds);
  return countedText(`workspace.browser.downloads.duration.${span.unit}`, span.count, t);
}

/** Seconds until a running download finishes, or null when Chrome would show no estimate. */
function secondsLeft(download: DesktopBrowserDownload): number | null {
  if (download.totalBytes <= 0 || download.bytesPerSecond <= 0) {
    return null;
  }
  return (download.totalBytes - download.receivedBytes) / download.bytesPerSecond;
}

/** The bubble status line and whether Chrome colors it as an error. */
export interface BubbleStatus {
  text: string;
  isError: boolean;
}

function inProgressBubbleStatus(
  download: DesktopBrowserDownload,
  t: TFunction,
  locale: string,
): string {
  const sizes =
    download.totalBytes > 0
      ? formatSizePair(download.receivedBytes, download.totalBytes, t, locale)
      : formatBytes(download.receivedBytes, t, locale);
  const withMessage = (message: string) =>
    t("workspace.browser.downloads.statusWithMessage", { status: sizes, message });
  const transferring = (message: string) =>
    t("workspace.browser.downloads.statusWithSymbol", { status: withMessage(message) });
  if (download.isPaused) {
    return withMessage(t("workspace.browser.downloads.paused"));
  }
  const remaining = secondsLeft(download);
  if (download.openWhenDone) {
    if (remaining === null) {
      return withMessage(t("workspace.browser.downloads.openWhenComplete"));
    }
    return transferring(
      t("workspace.browser.downloads.openIn", { time: formatDuration(remaining, t) }),
    );
  }
  if (remaining !== null) {
    return transferring(formatTimeLeft(remaining, t));
  }
  if (download.receivedBytes === 0) {
    return withMessage(t("workspace.browser.downloads.starting"));
  }
  return withMessage(t("workspace.browser.downloads.resuming"));
}

/** The bubble row's status line (download_ui_model.cc GetStatusTextForBubble). */
export function bubbleStatus(
  download: DesktopBrowserDownload,
  now: number,
  t: TFunction,
  locale: string,
): BubbleStatus {
  if (download.state === "in_progress") {
    return { text: inProgressBubbleStatus(download, t, locale), isError: false };
  }
  if (download.state === "cancelled") {
    return { text: t("workspace.browser.downloads.cancelled"), isError: false };
  }
  if (download.state === "interrupted") {
    const reasonKey =
      download.interruptReason === "shutdown"
        ? "workspace.browser.downloads.failedUnfinished"
        : "workspace.browser.downloads.failedGeneric";
    return { text: t(reasonKey), isError: true };
  }
  if (download.isFileMissing) {
    return { text: t("workspace.browser.downloads.removed"), isError: false };
  }
  const size = formatBytes(download.totalBytes || download.receivedBytes, t, locale);
  const finishedAgo = now - (download.endTime ?? now);
  const message =
    finishedAgo < JUST_FINISHED_MS
      ? t("workspace.browser.downloads.done")
      : formatTimeAgo(finishedAgo / MILLISECONDS_PER_SECOND, t);
  return {
    text: t("workspace.browser.downloads.statusWithMessage", { status: size, message }),
    isError: false,
  };
}

/**
 * The downloads page card's progress line: "253 KB/s - 10.5 MB，共 500 MB，还剩 33 分钟"
 * (DownloadUIModel::GetTabProgressStatusText).
 */
export function pageProgressText(
  download: DesktopBrowserDownload,
  t: TFunction,
  locale: string,
): string {
  const received = formatBytes(download.receivedBytes, t, locale);
  const amount =
    download.totalBytes > 0
      ? t("workspace.browser.downloads.page.receivedOfTotal", {
          received,
          total: formatBytes(download.totalBytes, t, locale),
        })
      : received;
  const speed = formatSpeed(download.isPaused ? 0 : download.bytesPerSecond, t, locale);
  let timeLeft: string | null = null;
  if (download.isPaused) {
    timeLeft = t("workspace.browser.downloads.paused");
  } else {
    const remaining = secondsLeft(download);
    timeLeft = remaining === null ? null : formatTimeLeftShort(remaining, t);
  }
  if (timeLeft === null) {
    return t("workspace.browser.downloads.page.progressTimeUnknown", { speed, amount });
  }
  return t("workspace.browser.downloads.page.progress", { speed, amount, timeLeft });
}

/** The tag after a card's file name: 已取消, 已删除 or 失败 - …; null for none. */
export function pageTag(download: DesktopBrowserDownload, t: TFunction): string | null {
  if (download.state === "cancelled") {
    return t("workspace.browser.downloads.page.cancelledTag");
  }
  if (download.state === "interrupted") {
    const reasonKey =
      download.interruptReason === "shutdown"
        ? "workspace.browser.downloads.page.failureShutdown"
        : "workspace.browser.downloads.page.failureGeneric";
    return t("workspace.browser.downloads.page.failed", { reason: t(reasonKey) });
  }
  if (download.isFileMissing) {
    return t("workspace.browser.downloads.page.removedTag");
  }
  return null;
}

function startOfLocalDay(time: number): number {
  const date = new Date(time);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** The downloads page's date heading: 今天, 昨天, or the long date (2026年10月15日). */
export function pageDateHeader(
  startTime: number,
  now: number,
  t: TFunction,
  locale: string,
): string {
  const today = startOfLocalDay(now);
  const day = startOfLocalDay(startTime);
  if (day === today) {
    return t("workspace.browser.downloads.page.today");
  }
  const yesterday = startOfLocalDay(today - 1);
  if (day === yesterday) {
    return t("workspace.browser.downloads.page.yesterday");
  }
  return new Intl.DateTimeFormat(locale, { dateStyle: "long" }).format(startTime);
}
