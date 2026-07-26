import { describe, expect, test } from "vitest";
import { formatRelative } from "./relative-time";

const NOW = Date.parse("2026-07-24T12:00:00.000Z");

describe("formatRelative", () => {
  test("uses the just-now bucket before one full minute", () => {
    expect(formatRelative("2026-07-24T11:59:59.999Z", NOW)).toBe("刚刚");
    expect(formatRelative("2026-07-24T12:01:00.000Z", NOW)).toBe("刚刚");
  });

  test("uses minute and hour boundaries without rounding up", () => {
    expect(formatRelative("2026-07-24T11:59:00.000Z", NOW)).toBe("1 分钟前");
    expect(formatRelative("2026-07-24T11:00:00.000Z", NOW)).toBe("1 小时前");
    expect(formatRelative("2026-07-24T11:01:00.000Z", NOW)).toBe("59 分钟前");
  });

  test("switches to day labels after one full day", () => {
    expect(formatRelative("2026-07-23T12:00:00.000Z", NOW)).toBe("1 天前");
    expect(formatRelative("2026-07-22T12:00:00.000Z", NOW)).toBe("2 天前");
  });

  test("preserves missing and invalid timestamps explicitly", () => {
    expect(formatRelative(null, NOW)).toBe("暂无最近变更");
    expect(formatRelative("not-a-timestamp", NOW)).toBe("not-a-timestamp");
  });
});
