import { useEffect, useState } from "react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { getDesktopHost } from "@/desktop/host";
import { useBrowserStore } from "@/desktop/browser/store";
import { useBrowserDownloadsStore } from "../downloads/store";
import {
  cacheCounter,
  cookieSiteCount,
  deletionBeginTime,
  formatBytesMbOrHigher,
  historyCounter,
  originsVisitedSince,
  siteOf,
  type ClearDataTimePeriod,
  type ClearDataType,
} from "./model";

/**
 * Deletes what the dialog's boxes name, for the range. Each kind of data is deleted by its
 * owner: site data and cache in the profile, download history by the downloads list, browsing
 * history by the browser store.
 */
export async function deleteBrowsingData(input: {
  timePeriod: ClearDataTimePeriod;
  types: ReadonlySet<ClearDataType>;
  now: number;
}): Promise<void> {
  const { types } = input;
  const begin = deletionBeginTime(input.timePeriod, input.now);
  // Read before history goes: a range's site data is found through the visits inside it.
  const origins =
    input.timePeriod === "allTime"
      ? null
      : originsVisitedSince(useBrowserStore.getState().history, begin);
  const browser = getDesktopHost()?.browser;
  if (types.has("siteData") || types.has("cache")) {
    await browser?.browsingData?.clear({
      siteData: types.has("siteData"),
      cache: types.has("cache"),
      origins,
    });
  }
  if (types.has("downloads")) {
    await browser?.downloads?.deleteHistory(begin);
  }
  if (types.has("history")) {
    useBrowserStore.getState().deleteHistory(begin);
  }
}

type CounterTexts = Record<ClearDataType, string | null>;

function historyCounterText(t: TFunction, begin: number): string {
  const counter = historyCounter(useBrowserStore.getState().history, begin);
  if (counter.kind === "none") {
    return t("workspace.browser.clearData.none");
  }
  if (counter.otherSiteCount === 0) {
    return t("workspace.browser.clearData.historyFromSite", { site: counter.lastVisitedSite });
  }
  return t("workspace.browser.clearData.historyFromSites", {
    site: counter.lastVisitedSite,
    others: t("workspace.browser.clearData.otherSites", { count: counter.otherSiteCount }),
  });
}

function downloadsCounterText(t: TFunction, begin: number): string {
  const count = useBrowserDownloadsStore
    .getState()
    .downloads.filter(
      (download) => download.state !== "in_progress" && download.startTime >= begin,
    ).length;
  return count === 0
    ? t("workspace.browser.clearData.noDownloadItems")
    : t("workspace.browser.clearData.downloadItems", { count });
}

function siteDataCounterText(
  t: TFunction,
  cookieDomains: readonly string[],
  visitedSites: ReadonlySet<string> | null,
): string {
  const domains = visitedSites
    ? cookieDomains.filter((domain) => visitedSites.has(siteOf(domain)))
    : cookieDomains;
  const count = cookieSiteCount(domains);
  return count === 0
    ? t("workspace.browser.clearData.noCookieSites")
    : t("workspace.browser.clearData.cookieSites", { count });
}

function cacheCounterText(
  t: TFunction,
  bytes: number,
  timePeriod: ClearDataTimePeriod,
  locale: string,
): string {
  const counter = cacheCounter(bytes, timePeriod);
  if (counter.kind === "almostEmpty") {
    return t("workspace.browser.clearData.cacheAlmostEmpty");
  }
  const size = formatBytesMbOrHigher(counter.bytes, locale);
  return counter.isUpperLimit ? t("workspace.browser.clearData.cacheLessThan", { size }) : size;
}

const CALCULATING: CounterTexts = { history: null, siteData: null, cache: null, downloads: null };

/**
 * The line under each box (browsing_data_counter_utils.cc), counted again whenever the range
 * changes. null while a count is still running: Chrome shows 正在计算… then.
 */
export function useBrowsingDataCounters(timePeriod: ClearDataTimePeriod): CounterTexts {
  const { t, i18n } = useTranslation();
  const [texts, setTexts] = useState<CounterTexts>(CALCULATING);

  useEffect(() => {
    let isCurrent = true;
    const begin = deletionBeginTime(timePeriod, Date.now());
    const history = useBrowserStore.getState().history;
    const visitedSites =
      timePeriod === "allTime"
        ? null
        : new Set(
            originsVisitedSince(history, begin).map((origin) => siteOf(new URL(origin).hostname)),
          );
    setTexts({
      ...CALCULATING,
      history: historyCounterText(t, begin),
      downloads: downloadsCounterText(t, begin),
    });
    void getDesktopHost()
      ?.browser?.browsingData?.counts()
      .then((counts) => {
        if (!isCurrent) return undefined;
        setTexts((current) => ({
          ...current,
          siteData: siteDataCounterText(t, counts.cookieDomains, visitedSites),
          cache: cacheCounterText(t, counts.cacheBytes, timePeriod, i18n.language),
        }));
        return undefined;
      })
      .catch((error: unknown) => {
        // The counters only inform; deleting still works without them.
        console.warn("[clear-browsing-data] counting failed", error);
      });
    return () => {
      isCurrent = false;
    };
  }, [i18n.language, t, timePeriod]);

  return texts;
}
