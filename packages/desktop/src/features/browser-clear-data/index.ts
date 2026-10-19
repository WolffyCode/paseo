import { ipcMain, type Session } from "electron";

/**
 * The profile-side half of Chrome's 删除浏览数据: the cache size and cookie hosts its counters
 * show, and deleting site data and cache. History and download history live with their owners
 * and are deleted there.
 */

// Chrome's "Cookies and other site data": cookies and every kind of site storage.
const SITE_DATA_TYPES = [
  "cookies",
  "localStorage",
  "indexedDB",
  "serviceWorkers",
  "fileSystems",
  "webSQL",
  "backgroundFetch",
] as const;

export interface BrowsingDataCounts {
  cacheBytes: number;
  /** The host of every stored cookie, once each, for the renderer to group into sites. */
  cookieDomains: string[];
}

interface ClearRequest {
  siteData: boolean;
  cache: boolean;
  /** Only these origins, or every origin when null. */
  origins: string[] | null;
}

function readClearRequest(raw: unknown): ClearRequest | null {
  if (typeof raw !== "object" || raw === null) {
    return null;
  }
  const { siteData, cache, origins } = raw as Record<string, unknown>;
  const isOriginList =
    origins === null ||
    (Array.isArray(origins) && origins.every((origin) => typeof origin === "string"));
  if (typeof siteData !== "boolean" || typeof cache !== "boolean" || !isOriginList) {
    return null;
  }
  return { siteData, cache, origins: origins as string[] | null };
}

async function countBrowsingData(profileSession: Session): Promise<BrowsingDataCounts> {
  const [cacheBytes, cookies] = await Promise.all([
    profileSession.getCacheSize(),
    profileSession.cookies.get({}),
  ]);
  const cookieDomains = new Set(cookies.map((cookie) => cookie.domain ?? "").filter(Boolean));
  return { cacheBytes, cookieDomains: [...cookieDomains] };
}

async function clearBrowsingData(profileSession: Session, request: ClearRequest): Promise<void> {
  // A range that visited no site reaches no stored data.
  if (request.origins?.length === 0) {
    return;
  }
  const originFilter = request.origins ? { origins: request.origins } : {};
  if (request.siteData) {
    await profileSession.clearData({ dataTypes: [...SITE_DATA_TYPES], ...originFilter });
  }
  if (request.cache) {
    if (request.origins) {
      await profileSession.clearData({ dataTypes: ["cache"], ...originFilter });
    } else {
      await profileSession.clearCache();
    }
  }
}

export function registerBrowsingDataIpc(profileSession: Session): void {
  ipcMain.handle("paseo:browser:browsing-data:counts", () => countBrowsingData(profileSession));
  ipcMain.handle("paseo:browser:browsing-data:clear", async (_event, raw: unknown) => {
    const request = readClearRequest(raw);
    if (request) {
      await clearBrowsingData(profileSession, request);
    }
  });
}
