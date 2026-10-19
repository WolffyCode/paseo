import { beforeAll, describe, expect, it } from "vitest";
import type { DesktopBrowserDownload } from "@/desktop/host";
import { i18n } from "@/i18n/i18next";
import {
  bubbleStatus,
  formatBytes,
  formatSizePair,
  formatTimeLeft,
  pageDateHeader,
  pageProgressText,
  pageTag,
} from "./format";

const LOCALE = "zh-CN";
const MIB = 1024 ** 2;
const KIB = 1024;
const NOW = new Date(2026, 9, 17, 12, 0, 0).getTime();
const MINUTE = 60_000;

function download(overrides: Partial<DesktopBrowserDownload>): DesktopBrowserDownload {
  return {
    id: "download",
    url: "https://example.com/file.zip",
    browserId: null,
    initiatorOrigin: null,
    fileName: "file.zip",
    filePath: "/Users/someone/Downloads/file.zip",
    totalBytes: 0,
    receivedBytes: 0,
    bytesPerSecond: 0,
    state: "in_progress",
    interruptReason: null,
    isPaused: false,
    canResume: false,
    openWhenDone: false,
    startTime: NOW,
    endTime: null,
    isFileMissing: false,
    opensTypeAutomatically: false,
    canOpenTypeAutomatically: true,
    ...overrides,
  };
}

describe("download text", () => {
  // The real resources, so a key nobody added renders as the key and fails.
  beforeAll(async () => {
    if (!i18n.isInitialized) {
      await i18n.init();
    }
    await i18n.changeLanguage(LOCALE);
  });

  it("formats sizes with Chrome's units and thresholds", () => {
    expect(formatBytes(0, i18n.t, LOCALE)).toBe("0 B");
    expect(formatBytes(3 * KIB - 1, i18n.t, LOCALE)).toBe("3,071 B");
    expect(formatBytes(3 * KIB, i18n.t, LOCALE)).toBe("3.0 KB");
    expect(formatBytes(1.5 * MIB, i18n.t, LOCALE)).toBe("1,536 KB");
    expect(formatBytes(500 * MIB, i18n.t, LOCALE)).toBe("500 MB");
    expect(formatSizePair(10.5 * MIB, 500 * MIB, i18n.t, LOCALE)).toBe("10.5/500 MB");
  });

  it("rounds remaining time the way TimeFormat does", () => {
    expect(formatTimeLeft(59, i18n.t)).toBe("还剩 59 秒");
    expect(formatTimeLeft(59.6, i18n.t)).toBe("还剩 1 分钟");
    expect(formatTimeLeft(33 * 60, i18n.t)).toBe("还剩 33 分钟");
  });

  it("writes the bubble status for each state", () => {
    const running = download({
      totalBytes: 500 * MIB,
      receivedBytes: 10.5 * MIB,
      bytesPerSecond: (489.5 * MIB) / (33 * 60),
    });
    expect(bubbleStatus(running, NOW, i18n.t, LOCALE)).toEqual({
      text: "↓ 10.5/500 MB • 还剩 33 分钟",
      isError: false,
    });
    const paused = download({ totalBytes: 100 * MIB, receivedBytes: 2.6 * MIB, isPaused: true });
    expect(bubbleStatus(paused, NOW, i18n.t, LOCALE).text).toBe("2.6/100 MB • 已暂停");
    const starting = download({ totalBytes: 100 * MIB });
    expect(bubbleStatus(starting, NOW, i18n.t, LOCALE).text).toBe("0/100 MB • 即将开始下载…");

    const finished = download({ state: "complete", totalBytes: 3 * MIB, endTime: NOW - 10_000 });
    expect(bubbleStatus(finished, NOW, i18n.t, LOCALE).text).toBe("3.0 MB • 完成");
    expect(bubbleStatus(finished, NOW + 3 * MINUTE, i18n.t, LOCALE).text).toBe("3.0 MB • 3 分钟前");
    expect(bubbleStatus({ ...finished, isFileMissing: true }, NOW, i18n.t, LOCALE).text).toBe(
      "已删除",
    );
    expect(bubbleStatus(download({ state: "cancelled" }), NOW, i18n.t, LOCALE).text).toBe("已取消");
    expect(
      bubbleStatus(
        download({ state: "interrupted", interruptReason: "unknown" }),
        NOW,
        i18n.t,
        LOCALE,
      ),
    ).toEqual({ text: "出了点问题", isError: true });
  });

  it("writes the downloads page's progress line and tags", () => {
    const running = download({
      totalBytes: 500 * MIB,
      receivedBytes: 10.5 * MIB,
      bytesPerSecond: 253 * KIB,
    });
    expect(pageProgressText(running, i18n.t, LOCALE)).toMatch(
      /^253 KB\/s - 10\.5 MB，共 500 MB，还剩 \d+ 分钟$/,
    );
    const paused = download({ totalBytes: 100 * MIB, receivedBytes: 2.6 * MIB, isPaused: true });
    expect(pageProgressText(paused, i18n.t, LOCALE)).toBe("0 B/s - 2.6 MB，共 100 MB，已暂停");
    expect(pageTag(download({ state: "interrupted", interruptReason: "shutdown" }), i18n.t)).toBe(
      "失败 - 关机",
    );
    expect(pageTag(download({ state: "complete", isFileMissing: true }), i18n.t)).toBe("已删除");
  });

  it("heads each day with 今天, 昨天 or the long date", () => {
    expect(pageDateHeader(NOW - MINUTE, NOW, i18n.t, LOCALE)).toBe("今天");
    expect(pageDateHeader(NOW - 24 * 60 * MINUTE, NOW, i18n.t, LOCALE)).toBe("昨天");
    expect(pageDateHeader(new Date(2026, 9, 15, 9).getTime(), NOW, i18n.t, LOCALE)).toBe(
      "2026年10月15日",
    );
  });
});
