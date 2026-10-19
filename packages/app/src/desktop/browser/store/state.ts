import { z } from "zod";
import {
  BROWSER_START_URL,
  isBrowserStartUrl,
  type BrowserRecentSite,
} from "@/desktop/browser/start-page";

export type BrowserViewport =
  | { mode: "responsive" }
  | { mode: "fixed"; width: number; height: number };

export const RESPONSIVE_BROWSER_VIEWPORT: BrowserViewport = { mode: "responsive" };

export interface BrowserRecord {
  browserId: string;
  url: string;
  title: string;
  isLoading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  faviconUrl: string | null;
  lastError: string | null;
  viewport: BrowserViewport;
  createdAt: number;
}

export type BrowserRecordPatch = Partial<Omit<BrowserRecord, "browserId" | "createdAt">>;

export interface BrowserHistoryEntry {
  url: string;
  title: string;
  faviconUrl: string | null;
  visitedAt: number;
}

/** A page closed in column 3, kept so ⇧⌘T and the history menu can reopen it. */
export interface BrowserClosedEntry {
  url: string;
  title: string;
  faviconUrl: string | null;
  closedAt: number;
}

export interface BrowserIndexState {
  browsersById: Record<string, BrowserRecord>;
  /** Newest first, across every conversation, as Chrome's recently closed list is per profile. */
  closedBrowsers: BrowserClosedEntry[];
  history: BrowserHistoryEntry[];
}

// Chrome's tab restore service keeps the 25 most recently closed entries.
const CLOSED_BROWSER_LIMIT = 25;

const BrowserViewportSchema = z.discriminatedUnion("mode", [
  z.strictObject({ mode: z.literal("responsive") }),
  z.strictObject({
    mode: z.literal("fixed"),
    width: z.number().positive(),
    height: z.number().positive(),
  }),
]);

const BrowserRecordSchema = z.strictObject({
  browserId: z.string(),
  url: z.string(),
  title: z.string(),
  isLoading: z.boolean(),
  canGoBack: z.boolean(),
  canGoForward: z.boolean(),
  faviconUrl: z.string().nullable(),
  lastError: z.string().nullable(),
  viewport: BrowserViewportSchema.optional().default(RESPONSIVE_BROWSER_VIEWPORT),
  createdAt: z.number(),
});

const BrowserClosedEntrySchema = z.strictObject({
  url: z.string(),
  title: z.string(),
  faviconUrl: z.string().nullable(),
  closedAt: z.number(),
});

// Not strict: a record saved while browsers lived in windows still carries `windowsById`, and
// rejecting it would throw away the history along with it.
export const BrowserIndexStateSchema: z.ZodType<BrowserIndexState> = z.object({
  browsersById: z.record(z.string(), BrowserRecordSchema),
  closedBrowsers: z.array(BrowserClosedEntrySchema).optional().default([]),
  history: z
    .array(
      z.strictObject({
        url: z.string(),
        title: z.string(),
        faviconUrl: z.string().nullable(),
        visitedAt: z.number(),
      }),
    )
    .optional()
    .default([]),
});

export function createFixedBrowserViewport(width: number, height: number): BrowserViewport {
  return {
    mode: "fixed",
    width: Math.max(1, Math.round(width)),
    height: Math.max(1, Math.round(height)),
  };
}

export function normalizeBrowserViewport(value: unknown): BrowserViewport {
  const result = BrowserViewportSchema.safeParse(value);
  return result.success && result.data.mode === "fixed"
    ? createFixedBrowserViewport(result.data.width, result.data.height)
    : RESPONSIVE_BROWSER_VIEWPORT;
}

function browserViewportsEqual(left: BrowserViewport, right: BrowserViewport): boolean {
  return (
    left.mode === right.mode &&
    (left.mode === "responsive" ||
      (right.mode === "fixed" && left.width === right.width && left.height === right.height))
  );
}

export function normalizeBrowserIndexState(value: unknown): BrowserIndexState {
  const result = BrowserIndexStateSchema.safeParse(value);
  if (!result.success) {
    return { browsersById: {}, closedBrowsers: [], history: [] };
  }
  return result.data;
}

export function trimNonEmpty(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function normalizeBrowserUrl(value: string | null | undefined): string {
  const trimmed = trimNonEmpty(value);
  if (!trimmed) {
    return BROWSER_START_URL;
  }
  if (/^(localhost|\d{1,3}(?:\.\d{1,3}){3}|\[[\da-fA-F:.]+])(?::\d+)?(?:[/?#]|$)/.test(trimmed)) {
    return `http://${trimmed}`;
  }
  if (/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(trimmed)) {
    return trimmed;
  }
  if (trimmed.startsWith("//")) {
    return `https:${trimmed}`;
  }
  return `https://${trimmed}`;
}

export function createBrowserRecord(input: {
  browserId: string;
  initialUrl: string | null | undefined;
  now: number;
}): BrowserRecord {
  return {
    browserId: input.browserId,
    url: normalizeBrowserUrl(input.initialUrl),
    title: "",
    isLoading: false,
    canGoBack: false,
    canGoForward: false,
    faviconUrl: null,
    lastError: null,
    viewport: RESPONSIVE_BROWSER_VIEWPORT,
    createdAt: input.now,
  };
}

export function applyBrowserPatch<S extends BrowserIndexState>(
  state: S,
  browserId: string,
  patch: BrowserRecordPatch,
): S {
  const normalizedBrowserId = trimNonEmpty(browserId);
  if (!normalizedBrowserId) {
    return state;
  }
  const existing = state.browsersById[normalizedBrowserId];
  if (!existing) {
    return state;
  }

  const nextViewport = patch.viewport
    ? normalizeBrowserViewport(patch.viewport)
    : existing.viewport;
  const nextRecord: BrowserRecord = {
    ...existing,
    ...patch,
    viewport: nextViewport,
    url: normalizeBrowserUrl(patch.url ?? existing.url),
  };

  if (
    nextRecord.url === existing.url &&
    nextRecord.title === existing.title &&
    nextRecord.isLoading === existing.isLoading &&
    nextRecord.canGoBack === existing.canGoBack &&
    nextRecord.canGoForward === existing.canGoForward &&
    nextRecord.faviconUrl === existing.faviconUrl &&
    nextRecord.lastError === existing.lastError &&
    browserViewportsEqual(nextRecord.viewport, existing.viewport)
  ) {
    return state;
  }

  return {
    ...state,
    history:
      patch.title !== undefined || patch.faviconUrl !== undefined
        ? state.history.map((entry) =>
            entry.url === nextRecord.url
              ? {
                  ...entry,
                  title: nextRecord.title || entry.title,
                  faviconUrl: nextRecord.faviconUrl,
                }
              : entry,
          )
        : state.history,
    browsersById: {
      ...state.browsersById,
      [normalizedBrowserId]: nextRecord,
    },
  };
}

/** The web page a browser shows; null on its start page, after a failed load, or on a non-web URL. */
export function browserPage(browser: BrowserRecord): BrowserRecentSite | null {
  if (browser.lastError) return null;
  let url: URL;
  try {
    url = new URL(browser.url);
  } catch {
    // An address that does not parse is not a page to remember.
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  return {
    url: browser.url,
    title: browser.title.trim() || url.host,
    faviconUrl: browser.faviconUrl,
  };
}

export function recordBrowserVisit<S extends BrowserIndexState>(
  state: S,
  browserId: string,
  now: number,
): S {
  const browser = state.browsersById[browserId];
  if (!browser) return state;
  const page = browserPage(browser);
  if (!page) return state;
  const entry: BrowserHistoryEntry = { ...page, visitedAt: now };
  return {
    ...state,
    history: [entry, ...state.history.filter((site) => site.url !== entry.url)].slice(0, 100),
  };
}

export function addBrowser<S extends BrowserIndexState>(state: S, record: BrowserRecord): S {
  return { ...state, browsersById: { ...state.browsersById, [record.browserId]: record } };
}

/** Forgets a page; a page that showed something goes on the recently closed list. */
export function removeBrowser<S extends BrowserIndexState>(
  state: S,
  input: { browserId: string; now: number },
): S {
  const browser = state.browsersById[input.browserId];
  if (!browser) {
    return state;
  }
  const browsersById = { ...state.browsersById };
  delete browsersById[input.browserId];
  // Chrome's tab restore service skips tabs that only showed the new tab page.
  if (isBrowserStartUrl(browser.url)) {
    return { ...state, browsersById };
  }
  const closedEntry: BrowserClosedEntry = {
    url: browser.url,
    title: browser.title,
    faviconUrl: browser.faviconUrl,
    closedAt: input.now,
  };
  return {
    ...state,
    browsersById,
    closedBrowsers: [closedEntry, ...state.closedBrowsers].slice(0, CLOSED_BROWSER_LIMIT),
  };
}

/**
 * 删除浏览数据's 浏览记录: visits at or after `since` go, and the recently closed pages with
 * them, as Chrome's history deletion also clears the tab restore list for the range.
 */
export function deleteBrowserHistory<S extends BrowserIndexState>(state: S, since: number): S {
  return {
    ...state,
    history: state.history.filter((entry) => entry.visitedAt < since),
    closedBrowsers: state.closedBrowsers.filter((entry) => entry.closedAt < since),
  };
}

/** Takes a closed page off the list to reopen it: the newest by default (⇧⌘T). */
export function takeClosedBrowser<S extends BrowserIndexState>(
  state: S,
  closedIndex: number,
): { state: S; entry: BrowserClosedEntry | null } {
  const entry = state.closedBrowsers[closedIndex] ?? null;
  if (!entry) {
    return { state, entry };
  }
  return {
    state: {
      ...state,
      closedBrowsers: state.closedBrowsers.filter((_, index) => index !== closedIndex),
    },
    entry,
  };
}

export function sanitizeBrowsersForPersist(state: BrowserIndexState): BrowserIndexState {
  return {
    history: state.history,
    closedBrowsers: state.closedBrowsers,
    browsersById: Object.fromEntries(
      Object.entries(state.browsersById).map(([browserId, browser]) => [
        browserId,
        { ...browser, isLoading: false, lastError: null },
      ]),
    ),
  };
}
