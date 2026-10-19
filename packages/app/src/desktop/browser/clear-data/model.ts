import * as psl from "psl";

/**
 * Chrome's 删除浏览数据 dialog (chrome/browser/resources/settings/clear_browsing_data_dialog)
 * as data: its time ranges, the data types it offers, and the counter under each.
 */

/** TimePeriod in Chrome's picker order (clear_browsing_data_time_picker.ts allTimePeriodList_). */
export const CLEAR_DATA_TIME_PERIODS = [
  "last15Minutes",
  "lastHour",
  "lastDay",
  "lastWeek",
  "fourWeeks",
  "allTime",
] as const;

export type ClearDataTimePeriod = (typeof CLEAR_DATA_TIME_PERIODS)[number];

// The pref browser.clear_data.time_period starts at LAST_HOUR.
export const DEFAULT_CLEAR_DATA_TIME_PERIOD: ClearDataTimePeriod = "lastHour";

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const PERIOD_LENGTH_MS: Record<Exclude<ClearDataTimePeriod, "allTime">, number> = {
  last15Minutes: 15 * MINUTE_MS,
  lastHour: HOUR_MS,
  lastDay: DAY_MS,
  lastWeek: 7 * DAY_MS,
  fourWeeks: 28 * DAY_MS,
};

/** browsing_data_utils.cc CalculateBeginDeleteTime: the oldest moment the deletion reaches. */
export function deletionBeginTime(period: ClearDataTimePeriod, now: number): number {
  return period === "allTime" ? 0 : now - PERIOD_LENGTH_MS[period];
}

// The picker starts with four chips and drops one while they overflow its row.
export const MAX_TIME_PERIOD_CHIPS = 4;

/**
 * computeExpandedOptionList_: the first chips in order, the last chip being the next one in
 * order or, when the selection sits further down, the selection itself; the rest go under 更多.
 */
export function timePeriodChips(
  selected: ClearDataTimePeriod,
  maxChips: number = MAX_TIME_PERIOD_CHIPS,
): { chips: ClearDataTimePeriod[]; more: ClearDataTimePeriod[] } {
  const leading = CLEAR_DATA_TIME_PERIODS.slice(0, maxChips - 1);
  const nextInOrder = CLEAR_DATA_TIME_PERIODS[maxChips - 1];
  const isSelectionLeading = leading.includes(selected);
  const last = isSelectionLeading || !nextInOrder ? nextInOrder : selected;
  const chips = last ? [...leading, last] : [...leading];
  const more = CLEAR_DATA_TIME_PERIODS.filter((period) => !chips.includes(period));
  return { chips, more };
}

/**
 * The data types Helm's browser keeps, in Chrome's order. Chrome also lists autofill form data,
 * site settings and hosted app data; this browser stores none of those.
 */
export const CLEAR_DATA_TYPES = ["history", "siteData", "cache", "downloads"] as const;

export type ClearDataType = (typeof CLEAR_DATA_TYPES)[number];

// DEFAULT_BROWSING_DATATYPES_LIST: always shown; the rest only after 显示更多 or once ticked.
const DEFAULT_EXPANDED_TYPES: ReadonlySet<ClearDataType> = new Set([
  "history",
  "siteData",
  "cache",
]);

// The browser.clear_data.* prefs' defaults: every type this browser keeps starts ticked.
export const DEFAULT_CHECKED_TYPES: Record<ClearDataType, boolean> = {
  history: true,
  siteData: true,
  cache: true,
  downloads: true,
};

/** setUpDataTypeOptionLists_: which rows show at once and which wait behind 显示更多. */
export function splitDataTypes(checked: Record<ClearDataType, boolean>): {
  expanded: ClearDataType[];
  more: ClearDataType[];
} {
  const isExpanded = (type: ClearDataType) => DEFAULT_EXPANDED_TYPES.has(type) || checked[type];
  return {
    expanded: CLEAR_DATA_TYPES.filter(isExpanded),
    more: CLEAR_DATA_TYPES.filter((type) => !isExpanded(type)),
  };
}

// An IPv4 address, or an IPv6 one as URL.hostname writes it, in brackets.
const IP_ADDRESS_HOST = /^(\d{1,3}(\.\d{1,3}){3}|\[[\da-f:.]+\])$/i;

/**
 * The site an address belongs to, as Chrome groups data: its registrable domain, or the host
 * itself for an IP address or a name with no registry, as GetDomainAndRegistry leaves those.
 */
export function siteOf(host: string): string {
  const bareHost = host.replace(/^\./, "").toLowerCase();
  if (IP_ADDRESS_HOST.test(bareHost)) {
    return bareHost;
  }
  return psl.get(bareHost) ?? bareHost;
}

function hostOf(url: string): string | null {
  try {
    const { hostname, protocol } = new URL(url);
    const isWebPage = protocol === "http:" || protocol === "https:";
    return isWebPage && hostname ? hostname : null;
  } catch {
    // An address that doesn't parse belongs to no site.
    return null;
  }
}

interface VisitedPage {
  url: string;
  visitedAt: number;
}

/** History visits inside the range, newest first as the store keeps them. */
function visitsSince<T extends VisitedPage>(history: readonly T[], begin: number): T[] {
  return history.filter((entry) => entry.visitedAt >= begin);
}

export type HistoryCounter =
  | { kind: "none" }
  | { kind: "sites"; lastVisitedSite: string; otherSiteCount: number };

/** CreateHistoryCounterString's input: the newest visit's site and how many other sites. */
export function historyCounter(history: readonly VisitedPage[], begin: number): HistoryCounter {
  const sites: string[] = [];
  for (const entry of visitsSince(history, begin)) {
    const host = hostOf(entry.url);
    if (!host) continue;
    const site = siteOf(host);
    if (!sites.includes(site)) sites.push(site);
  }
  const [lastVisitedSite] = sites;
  if (!lastVisitedSite) {
    return { kind: "none" };
  }
  return { kind: "sites", lastVisitedSite, otherSiteCount: sites.length - 1 };
}

/**
 * The origins whose stored data a range covers. Chromium deletes site data created inside the
 * range; Electron can only delete by origin, so a range short of 时间不限 reaches the sites
 * visited inside it.
 */
export function originsVisitedSince(history: readonly VisitedPage[], begin: number): string[] {
  const origins = new Set<string>();
  for (const entry of visitsSince(history, begin)) {
    if (!hostOf(entry.url)) continue;
    origins.add(new URL(entry.url).origin);
  }
  return [...origins];
}

/** IDS_DEL_COOKIES_COUNTER_ADVANCED's count: the sites cookies are stored for. */
export function cookieSiteCount(cookieDomains: readonly string[]): number {
  return new Set(cookieDomains.map(siteOf)).size;
}

const MEBIBYTE = 1024 * 1024;

export type CacheCounter =
  | { kind: "almostEmpty" }
  /** `isUpperLimit` for a range short of all time: Chrome can only say 少于 the whole cache. */
  | { kind: "size"; bytes: number; isUpperLimit: boolean };

/** The cache counter's three cases (browsing_data_counter_utils.cc). */
export function cacheCounter(bytes: number, period: ClearDataTimePeriod): CacheCounter {
  if (bytes < MEBIBYTE) {
    return { kind: "almostEmpty" };
  }
  return { kind: "size", bytes, isUpperLimit: period !== "allTime" };
}

const BYTE_UNITS = ["MB", "GB", "TB"] as const;
const UNIT_STEP = 1024;
// ui/base/text/bytes_formatting.cc: one decimal below 100 of a unit, none from there on.
const DECIMALS_BELOW = 100;

/** FormatBytesMBOrHigher: the size in MB or a larger unit, in the page's number format. */
export function formatBytesMbOrHigher(bytes: number, locale: string): string {
  let amount = bytes / MEBIBYTE;
  let unitIndex = 0;
  while (amount >= UNIT_STEP && unitIndex < BYTE_UNITS.length - 1) {
    amount /= UNIT_STEP;
    unitIndex += 1;
  }
  const decimals = amount < DECIMALS_BELOW ? 1 : 0;
  const number = new Intl.NumberFormat(locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(amount);
  return `${number} ${BYTE_UNITS[unitIndex]}`;
}
