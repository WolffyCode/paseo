import { describe, it, expect } from "vitest";
import { i18n } from "@/i18n/i18next";
import {
  describeRelativeTime,
  formatDuration,
  formatLargestUnitDuration,
  formatMessageTimestamp,
  formatPreciseDuration,
  formatTimeAgo,
} from "./time";

const englishT = i18n.getFixedT("en");
const chineseT = i18n.getFixedT("zh-CN");

describe("formatTimeAgo", () => {
  const now = new Date("2026-07-16T12:00:00.000Z");

  it.each([
    ["2026-07-16T11:59:55.000Z", "just now"],
    ["2026-07-16T11:59:30.000Z", "just now"],
    ["2026-07-16T11:59:00.000Z", "1m ago"],
    ["2026-07-16T11:55:00.000Z", "5m ago"],
    ["2026-07-16T10:00:00.000Z", "2h ago"],
    ["2026-07-13T12:00:00.000Z", "3d ago"],
    ["2026-01-15T12:00:00.000Z", "Jan 15"],
  ])("formats %s as %s", (date, expected) => {
    expect(formatTimeAgo(new Date(date), englishT, "en", now)).toBe(expected);
  });

  it.each([
    ["2026-07-16T11:59:30.000Z", "刚刚"],
    ["2026-07-16T11:55:00.000Z", "5 分钟前"],
    ["2026-07-16T10:00:00.000Z", "2 小时前"],
    ["2026-07-13T12:00:00.000Z", "3 天前"],
    ["2026-01-15T12:00:00.000Z", "1月15日"],
  ])("formats %s as %s in Chinese", (date, expected) => {
    expect(formatTimeAgo(new Date(date), chineseT, "zh-CN", now)).toBe(expected);
  });
});

describe("describeRelativeTime in prose", () => {
  const now = new Date("2026-07-16T12:00:00.000Z");

  it.each([
    ["2026-07-16T11:59:30.000Z", "just now", "minute"],
    ["2026-07-16T11:55:00.000Z", "5m ago", "minute"],
    ["2026-07-16T10:00:00.000Z", "2h ago", "hour"],
    ["2026-07-13T12:00:00.000Z", "3d ago", "day"],
    ["2026-01-15T12:00:00.000Z", "Jan 15", "static"],
  ] as const)("formats %s as %s at %s resolution", (date, label, resolution) => {
    expect(describeRelativeTime(new Date(date), "prose", englishT, "en", now)).toEqual({
      label,
      resolution,
    });
  });
});

describe("describeRelativeTime compactly", () => {
  const now = new Date("2026-07-16T12:00:00.000Z");

  it.each([
    ["2026-07-16T11:59:59.000Z", "now", "minute"],
    ["2026-07-16T11:59:30.000Z", "now", "minute"],
    ["2026-07-16T11:59:00.000Z", "1m", "minute"],
    ["2026-07-16T11:55:00.000Z", "5m", "minute"],
    ["2026-07-16T11:00:00.000Z", "1h", "hour"],
    ["2026-07-16T10:00:00.000Z", "2h", "hour"],
    ["2026-07-15T12:00:00.000Z", "1d", "day"],
    ["2026-07-13T12:00:00.000Z", "3d", "day"],
    ["2026-07-10T12:00:00.000Z", "6d", "day"],
    ["2026-07-09T12:00:00.000Z", "Jul 9", "static"],
    ["2026-01-15T12:00:00.000Z", "Jan 15", "static"],
  ] as const)("formats %s as %s at %s resolution", (date, label, resolution) => {
    expect(describeRelativeTime(new Date(date), "compact", englishT, "en", now)).toEqual({
      label,
      resolution,
    });
  });

  it.each([
    ["2026-07-16T11:59:30.000Z", "刚刚"],
    ["2026-07-16T11:55:00.000Z", "5 分钟"],
    ["2026-07-16T10:00:00.000Z", "2 小时"],
    ["2026-07-13T12:00:00.000Z", "3 天"],
    ["2026-07-09T12:00:00.000Z", "7月9日"],
  ])("formats %s as %s in Chinese", (date, label) => {
    expect(describeRelativeTime(new Date(date), "compact", chineseT, "zh-CN", now).label).toBe(
      label,
    );
  });

  it("never shows a sub-minute count", () => {
    // A seconds label is only true for the second it rendered. Everything under a minute is
    // "now", which stays true and lets the row sit still.
    for (let seconds = 0; seconds < 60; seconds += 1) {
      const date = new Date(now.getTime() - seconds * 1000);
      expect(describeRelativeTime(date, "compact", englishT, "en", now).label).toBe("now");
    }
  });

  it("switches to an absolute date exactly at seven days", () => {
    const almost = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000 - 1));
    const exactly = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    expect(describeRelativeTime(almost, "compact", englishT, "en", now).resolution).toBe("day");
    expect(describeRelativeTime(exactly, "compact", englishT, "en", now).resolution).toBe("static");
  });
});

describe("formatDuration", () => {
  it("renders sub-minute durations as whole seconds", () => {
    expect(formatDuration(0, englishT)).toBe("0s");
    expect(formatDuration(5_600, englishT)).toBe("5s");
    expect(formatDuration(9_900, englishT)).toBe("9s");
    expect(formatDuration(10_400, englishT)).toBe("10s");
    expect(formatDuration(12_340, englishT)).toBe("12s");
    expect(formatDuration(47_000, englishT)).toBe("47s");
  });

  it("renders minutes and remainder seconds without decimals", () => {
    expect(formatDuration(75_230, englishT)).toBe("1m 15s");
    expect(formatDuration(132_000, englishT)).toBe("2m 12s");
    expect(formatDuration(120_000, englishT)).toBe("2m");
  });

  it("renders hours and remainder minutes without decimals", () => {
    expect(formatDuration(3_900_000, englishT)).toBe("1h 5m");
    expect(formatDuration(3_600_000, englishT)).toBe("1h");
  });

  it("guards against negative and NaN", () => {
    expect(formatDuration(-1, englishT)).toBe("0s");
    expect(formatDuration(Number.NaN, englishT)).toBe("0s");
  });

  it("words every shape in Chinese", () => {
    expect(formatDuration(47_000, chineseT)).toBe("47 秒");
    expect(formatDuration(71_000, chineseT)).toBe("1 分 11 秒");
    expect(formatDuration(120_000, chineseT)).toBe("2 分钟");
    expect(formatDuration(3_600_000, chineseT)).toBe("1 小时");
    expect(formatDuration(3_900_000, chineseT)).toBe("1 小时 5 分钟");
  });
});

describe("formatPreciseDuration", () => {
  it("keeps milliseconds under a second", () => {
    expect(formatPreciseDuration(0, englishT)).toBe("0ms");
    expect(formatPreciseDuration(350, englishT)).toBe("350ms");
    expect(formatPreciseDuration(350, chineseT)).toBe("350 毫秒");
  });

  it("reads like formatDuration from a second up", () => {
    expect(formatPreciseDuration(1_000, englishT)).toBe("1s");
    expect(formatPreciseDuration(132_000, englishT)).toBe("2m 12s");
    expect(formatPreciseDuration(Number.NaN, englishT)).toBe("0s");
  });
});

describe("formatLargestUnitDuration", () => {
  it("names only the largest whole unit", () => {
    expect(formatLargestUnitDuration(30_000, englishT)).toBe("0m");
    expect(formatLargestUnitDuration(45 * 60_000, englishT)).toBe("45m");
    expect(formatLargestUnitDuration(179 * 60_000, englishT)).toBe("2h");
    expect(formatLargestUnitDuration(3 * 24 * 60 * 60_000 + 60_000, englishT)).toBe("3d");
  });

  it("words the unit in Chinese", () => {
    expect(formatLargestUnitDuration(3 * 24 * 60 * 60_000, chineseT)).toBe("3 天");
  });
});

describe("formatMessageTimestamp", () => {
  it("shows only time for same-day timestamps", () => {
    const now = new Date(2026, 4, 14, 17, 30);
    const date = new Date(2026, 4, 14, 12, 23);
    const formatted = formatMessageTimestamp(date, "en", now);
    expect(formatted).toMatch(/12:23/);
    expect(formatted).not.toMatch(/Thursday|Wednesday/);
  });

  it("includes weekday for timestamps within the last 6 days", () => {
    // 2026-05-14 is a Thursday. 2026-05-11 is a Monday.
    const now = new Date(2026, 4, 14, 17, 30);
    const date = new Date(2026, 4, 11, 22, 12);
    const formatted = formatMessageTimestamp(date, "en", now);
    expect(formatted).toMatch(/Monday/);
    expect(formatted).toMatch(/10:12 PM|22:12/);
  });

  it("shows the full date for last week's same weekday, even under seven days ago", () => {
    // 2026-09-18 is a Friday. The reply is 6 days 23h45m old and lands on today's weekday,
    // so a weekday label would read as today.
    const now = new Date(2026, 8, 25, 11, 47);
    const date = new Date(2026, 8, 18, 12, 2);
    const formatted = formatMessageTimestamp(date, "en", now);
    expect(formatted).toMatch(/Sep|September/);
    expect(formatted).toMatch(/18/);
    expect(formatted).not.toMatch(/Friday/);
  });

  it("includes full date for older timestamps", () => {
    const now = new Date(2026, 4, 14, 17, 30);
    const date = new Date(2026, 3, 1, 9, 5);
    const formatted = formatMessageTimestamp(date, "en", now);
    expect(formatted).toMatch(/Apr|April/);
    expect(formatted).toMatch(/2026/);
  });

  it("words the weekday and date in the app language", () => {
    const now = new Date(2026, 4, 14, 17, 30);
    expect(formatMessageTimestamp(new Date(2026, 4, 11, 22, 12), "zh-CN", now)).toMatch(/星期一/);
    expect(formatMessageTimestamp(new Date(2026, 3, 1, 9, 5), "zh-CN", now)).toMatch(
      /2026年4月1日/,
    );
  });
});
