import { describe, expect, it } from "vitest";
import {
  cacheCounter,
  cookieSiteCount,
  deletionBeginTime,
  formatBytesMbOrHigher,
  historyCounter,
  originsVisitedSince,
  siteOf,
  splitDataTypes,
  timePeriodChips,
  DEFAULT_CHECKED_TYPES,
} from "./model";

const NOW = 1_000_000_000_000;
const MINUTE = 60_000;

describe("the time range", () => {
  it("reaches back as far as Chrome's ranges do", () => {
    expect(deletionBeginTime("last15Minutes", NOW)).toBe(NOW - 15 * MINUTE);
    expect(deletionBeginTime("fourWeeks", NOW)).toBe(NOW - 28 * 24 * 60 * MINUTE);
    expect(deletionBeginTime("allTime", NOW)).toBe(0);
  });

  it("shows four chips and keeps a selection from 更多 as the last chip", () => {
    expect(timePeriodChips("lastHour")).toEqual({
      chips: ["last15Minutes", "lastHour", "lastDay", "lastWeek"],
      more: ["fourWeeks", "allTime"],
    });
    expect(timePeriodChips("allTime")).toEqual({
      chips: ["last15Minutes", "lastHour", "lastDay", "allTime"],
      more: ["lastWeek", "fourWeeks"],
    });
    expect(timePeriodChips("lastHour", 2).chips).toEqual(["last15Minutes", "lastHour"]);
  });
});

describe("the data types", () => {
  it("ticks every type a fresh profile keeps, download history included", () => {
    expect(DEFAULT_CHECKED_TYPES).toEqual({
      history: true,
      siteData: true,
      cache: true,
      downloads: true,
    });
    expect(splitDataTypes(DEFAULT_CHECKED_TYPES)).toEqual({
      expanded: ["history", "siteData", "cache", "downloads"],
      more: [],
    });
  });

  it("moves an unticked type outside the default list behind 展开", () => {
    expect(splitDataTypes({ ...DEFAULT_CHECKED_TYPES, downloads: false })).toEqual({
      expanded: ["history", "siteData", "cache"],
      more: ["downloads"],
    });
    expect(splitDataTypes({ ...DEFAULT_CHECKED_TYPES, cache: false }).expanded).toContain("cache");
  });
});

describe("the site of a host", () => {
  it("is the registrable domain of a name", () => {
    expect(siteOf("mail.google.com")).toBe("google.com");
    expect(siteOf(".news.bbc.co.uk")).toBe("bbc.co.uk");
  });

  it("is the host itself for an address or a name without a registry", () => {
    expect(siteOf("127.0.0.1")).toBe("127.0.0.1");
    expect(siteOf("[::1]")).toBe("[::1]");
    expect(siteOf("localhost")).toBe("localhost");
  });
});

describe("the counters", () => {
  const history = [
    { url: "https://mail.google.com/a", visitedAt: NOW - MINUTE },
    { url: "https://www.google.com/b", visitedAt: NOW - 2 * MINUTE },
    { url: "https://example.com/", visitedAt: NOW - 3 * MINUTE },
    { url: "paseo://downloads", visitedAt: NOW - 4 * MINUTE },
    { url: "https://old.test/", visitedAt: NOW - 120 * MINUTE },
  ];

  it("names the newest site and counts the others, by registrable domain", () => {
    expect(historyCounter(history, NOW - 60 * MINUTE)).toEqual({
      kind: "sites",
      lastVisitedSite: "google.com",
      otherSiteCount: 1,
    });
    expect(historyCounter(history, NOW)).toEqual({ kind: "none" });
  });

  it("lists the web origins visited inside the range", () => {
    expect(originsVisitedSince(history, NOW - 60 * MINUTE)).toEqual([
      "https://mail.google.com",
      "https://www.google.com",
      "https://example.com",
    ]);
  });

  it("counts cookie sites, not cookie hosts", () => {
    expect(cookieSiteCount([".google.com", "accounts.google.com", "example.com"])).toBe(2);
  });

  it("sizes the cache as Chrome words it", () => {
    expect(cacheCounter(500_000, "lastHour")).toEqual({ kind: "almostEmpty" });
    expect(cacheCounter(5 * 1024 * 1024, "lastHour")).toMatchObject({ isUpperLimit: true });
    expect(cacheCounter(5 * 1024 * 1024, "allTime")).toMatchObject({ isUpperLimit: false });
    expect(formatBytesMbOrHigher(12.34 * 1024 * 1024, "en")).toBe("12.3 MB");
    expect(formatBytesMbOrHigher(250 * 1024 * 1024, "en")).toBe("250 MB");
    expect(formatBytesMbOrHigher(3 * 1024 * 1024 * 1024, "en")).toBe("3.0 GB");
  });
});
