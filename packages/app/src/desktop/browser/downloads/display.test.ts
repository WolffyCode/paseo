import { describe, expect, it } from "vitest";
import type { DesktopBrowserDownload } from "@/desktop/host";
import { bubbleDownloads, downloadButtonState, nextButtonChangeAt } from "./display";

const NOW = 1_800_000_000_000;
const MINUTE = 60_000;
const NONE_ACTIONED: ReadonlySet<string> = new Set();

function download(overrides: Partial<DesktopBrowserDownload>): DesktopBrowserDownload {
  return {
    id: "download",
    url: "https://example.com/file.zip",
    browserId: null,
    initiatorOrigin: null,
    fileName: "file.zip",
    filePath: "/Users/someone/Downloads/file.zip",
    totalBytes: 100,
    receivedBytes: 0,
    bytesPerSecond: 0,
    state: "in_progress",
    interruptReason: null,
    isPaused: false,
    canResume: false,
    openWhenDone: false,
    startTime: NOW - MINUTE,
    endTime: null,
    isFileMissing: false,
    opensTypeAutomatically: false,
    canOpenTypeAutomatically: true,
    ...overrides,
  };
}

describe("bubbleDownloads", () => {
  it("lists running, then paused, then finished downloads of the last day, newest first", () => {
    const rows = bubbleDownloads(
      [
        download({ id: "done-new", state: "complete", startTime: NOW - 2 * MINUTE, endTime: NOW }),
        download({ id: "paused", isPaused: true, startTime: NOW - 3 * MINUTE }),
        download({ id: "running-old", startTime: NOW - 9 * MINUTE }),
        download({ id: "running-new", startTime: NOW - 4 * MINUTE }),
        download({ id: "yesterday", state: "complete", startTime: NOW - 25 * 60 * MINUTE }),
      ],
      NOW,
    );
    expect(rows.map((row) => row.id)).toEqual(["running-new", "running-old", "paused", "done-new"]);
  });
});

describe("downloadButtonState", () => {
  it("shows progress, the underline and a badge while two downloads run", () => {
    const state = downloadButtonState({
      rows: [download({ id: "a", receivedBytes: 30 }), download({ id: "b", receivedBytes: 45 })],
      now: NOW,
      actionedIds: NONE_ACTIONED,
    });
    expect(state).toEqual({
      isShown: true,
      icon: "inProgress",
      isActive: true,
      ring: { kind: "progress", percent: 37 },
      badgeCount: 2,
      tooltip: { kind: "inProgress", count: 2 },
    });
  });

  it("spins when a size is unknown and goes quiet when everything is paused", () => {
    expect(
      downloadButtonState({
        rows: [download({ totalBytes: 0 })],
        now: NOW,
        actionedIds: NONE_ACTIONED,
      }).ring,
    ).toEqual({ kind: "spinner" });
    const paused = downloadButtonState({
      rows: [download({ isPaused: true })],
      now: NOW,
      actionedIds: NONE_ACTIONED,
    });
    expect(paused.isActive).toBe(false);
    expect(paused.badgeCount).toBeNull();
  });

  it("stays active for a minute after a download finishes, until the user sees it in the bubble", () => {
    const finished = [download({ state: "complete", endTime: NOW - 10_000 })];
    expect(
      downloadButtonState({ rows: finished, now: NOW, actionedIds: NONE_ACTIONED }),
    ).toMatchObject({
      isShown: true,
      icon: "idle",
      isActive: true,
      tooltip: { kind: "newDownload" },
    });
    expect(
      downloadButtonState({ rows: finished, now: NOW, actionedIds: new Set(["download"]) })
        .isActive,
    ).toBe(false);
    expect(
      downloadButtonState({ rows: finished, now: NOW + 2 * MINUTE, actionedIds: NONE_ACTIONED })
        .isActive,
    ).toBe(false);
  });

  it("leaves the toolbar an hour after the last download ends", () => {
    const finished = [download({ state: "complete", endTime: NOW })];
    expect(
      downloadButtonState({ rows: finished, now: NOW + 59 * MINUTE, actionedIds: NONE_ACTIONED })
        .isShown,
    ).toBe(true);
    expect(
      downloadButtonState({ rows: finished, now: NOW + 61 * MINUTE, actionedIds: NONE_ACTIONED })
        .isShown,
    ).toBe(false);
    expect(downloadButtonState({ rows: [], now: NOW, actionedIds: NONE_ACTIONED }).isShown).toBe(
      false,
    );
  });

  it("wakes up when the minute and then the hour run out", () => {
    const finished = [download({ state: "complete", endTime: NOW })];
    expect(nextButtonChangeAt(finished, NOW)).toBe(NOW + MINUTE);
    expect(nextButtonChangeAt(finished, NOW + MINUTE)).toBe(NOW + 60 * MINUTE);
    expect(nextButtonChangeAt(finished, NOW + 60 * MINUTE)).toBeNull();
    expect(nextButtonChangeAt([download({})], NOW)).toBeNull();
  });
});
