import { describe, expect, it } from "vitest";
import type { DesktopBrowserDownload } from "@/desktop/host";
import {
  cardButtons,
  cardMenuActions,
  hasClearableDownloads,
  initiatorHost,
  isActiveCard,
  matchesSearch,
  startsNewDay,
} from "./page-model";

const NOW = new Date(2026, 9, 17, 12, 0, 0).getTime();
const HOUR = 3_600_000;

function download(overrides: Partial<DesktopBrowserDownload>): DesktopBrowserDownload {
  return {
    id: "download",
    url: "https://example.com/report.pdf",
    browserId: null,
    initiatorOrigin: "https://example.com",
    fileName: "Report.pdf",
    filePath: "/Users/someone/Downloads/Report.pdf",
    totalBytes: 100,
    receivedBytes: 50,
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

describe("download cards", () => {
  it("offers each state's buttons and menu items, as chrome://downloads does", () => {
    expect(cardButtons(download({}))).toEqual(["copyLink", "moreActions"]);
    expect(cardMenuActions(download({}))).toEqual(["pause", "cancel"]);
    expect(cardMenuActions(download({ isPaused: true }))).toEqual(["resume", "cancel"]);

    const finished = download({ state: "complete" });
    expect(cardButtons(finished)).toEqual(["copyLink", "showInFolder", "remove"]);
    expect(cardButtons({ ...finished, isFileMissing: true })).toEqual(["copyLink", "remove"]);

    const cancelled = download({ state: "cancelled" });
    expect(cardButtons(cancelled)).toEqual(["copyLink", "moreActions", "remove"]);
    expect(cardMenuActions(cancelled)).toEqual(["remove", "retry"]);
    expect(cardMenuActions(download({ state: "interrupted", canResume: true }))).toEqual([
      "resume",
      "remove",
    ]);
    expect(cardMenuActions(download({ state: "interrupted" }))).toEqual(["remove", "retry"]);
  });

  it("grays out paused, stopped and removed downloads", () => {
    expect(isActiveCard(download({}))).toBe(true);
    expect(isActiveCard(download({ isPaused: true }))).toBe(false);
    expect(isActiveCard(download({ state: "complete" }))).toBe(true);
    expect(isActiveCard(download({ state: "complete", isFileMissing: true }))).toBe(false);
    expect(isActiveCard(download({ state: "cancelled" }))).toBe(false);
  });

  it("names the site without its scheme", () => {
    expect(initiatorHost(download({}))).toBe("example.com");
    expect(initiatorHost(download({ initiatorOrigin: null }))).toBeNull();
  });
});

describe("the downloads list", () => {
  it("searches names and addresses, ignoring case", () => {
    expect(matchesSearch(download({}), "report")).toBe(true);
    expect(matchesSearch(download({}), "EXAMPLE.COM")).toBe(true);
    expect(matchesSearch(download({}), "invoice")).toBe(false);
    expect(matchesSearch(download({}), "  ")).toBe(true);
  });

  it("heads the first card of each day", () => {
    const list = [
      download({ id: "a", startTime: NOW }),
      download({ id: "b", startTime: NOW - HOUR }),
      download({ id: "c", startTime: NOW - 24 * HOUR }),
    ];
    expect(list.map((_, index) => startsNewDay(list, index))).toEqual([true, false, true]);
  });

  it("offers 全部清除 only when something has stopped downloading", () => {
    expect(hasClearableDownloads([download({})])).toBe(false);
    expect(hasClearableDownloads([download({}), download({ state: "complete" })])).toBe(true);
  });
});
