import { describe, expect, it } from "vitest";
import { BROWSER_START_URL } from "@/desktop/browser/start-page";
import {
  addBrowser,
  applyBrowserPatch,
  type BrowserIndexState,
  createFixedBrowserViewport,
  createBrowserRecord,
  deleteBrowserHistory,
  normalizeBrowserIndexState,
  normalizeBrowserUrl,
  recordBrowserVisit,
  removeBrowser,
  sanitizeBrowsersForPersist,
  takeClosedBrowser,
} from "./state";

const EMPTY_INDEX: BrowserIndexState = { browsersById: {}, closedBrowsers: [], history: [] };

/** One page per URL, named b1, b2, …. */
function openPages(urls: string[]): BrowserIndexState {
  return urls.reduce(
    (state, url, index) =>
      addBrowser(
        state,
        createBrowserRecord({ browserId: `b${index + 1}`, initialUrl: url, now: 0 }),
      ),
    EMPTY_INDEX,
  );
}

describe("normalizeBrowserUrl", () => {
  it("normalizes local development hosts to http by default", () => {
    expect(normalizeBrowserUrl("localhost:8081")).toBe("http://localhost:8081");
    expect(normalizeBrowserUrl("localhost/path")).toBe("http://localhost/path");
    expect(normalizeBrowserUrl("127.0.0.1:3000/path")).toBe("http://127.0.0.1:3000/path");
    expect(normalizeBrowserUrl("192.168.0.8")).toBe("http://192.168.0.8");
    expect(normalizeBrowserUrl("[::1]:5173")).toBe("http://[::1]:5173");
  });

  it("normalizes public hosts to https by default", () => {
    expect(normalizeBrowserUrl("example.com")).toBe("https://example.com");
    expect(normalizeBrowserUrl("//example.com/path")).toBe("https://example.com/path");
  });

  it("preserves the browser start address", () => {
    expect(normalizeBrowserUrl("paseo://start")).toBe("paseo://start");
  });

  it("keeps explicit protocols unchanged", () => {
    expect(normalizeBrowserUrl("http://localhost:8081")).toBe("http://localhost:8081");
    expect(normalizeBrowserUrl("https://localhost:8081")).toBe("https://localhost:8081");
    expect(normalizeBrowserUrl("file:///tmp/example.html")).toBe("file:///tmp/example.html");
  });

  it("opens a browser without an address on its new tab page", () => {
    expect(normalizeBrowserUrl(null)).toBe(BROWSER_START_URL);
    expect(normalizeBrowserUrl("   ")).toBe(BROWSER_START_URL);
  });
});

describe("createBrowserRecord", () => {
  it("normalizes the initial URL and starts with idle state", () => {
    const record = createBrowserRecord({
      browserId: "b1",
      initialUrl: "localhost:8081",
      now: 1000,
    });

    expect(record).toEqual({
      browserId: "b1",
      url: "http://localhost:8081",
      title: "",
      isLoading: false,
      canGoBack: false,
      canGoForward: false,
      faviconUrl: null,
      lastError: null,
      viewport: { mode: "responsive" },
      createdAt: 1000,
    });
  });
});

describe("applyBrowserPatch", () => {
  it("updates the browser's canonical viewport", () => {
    const initial = openPages(["https://a.test"]);

    const next = applyBrowserPatch(initial, "b1", {
      viewport: createFixedBrowserViewport(639.6, 479.6),
    });

    expect(next.browsersById.b1?.viewport).toEqual({ mode: "fixed", width: 640, height: 480 });
  });

  it("normalizes URL updates", () => {
    const initial = openPages(["https://a.test"]);

    const next = applyBrowserPatch(initial, "b1", { url: "example.com/path" });

    expect(next.browsersById.b1?.url).toBe("https://example.com/path");
  });

  it("returns the same state reference when nothing changes", () => {
    const initial = openPages(["https://a.test"]);

    const next = applyBrowserPatch(initial, "b1", { url: "https://a.test", title: "" });

    expect(next).toBe(initial);
  });

  it("returns the same state when the browser id is unknown", () => {
    const initial = openPages(["https://a.test"]);

    expect(applyBrowserPatch(initial, "missing", { title: "x" })).toBe(initial);
  });

  it("returns the same state when the browser id is blank", () => {
    const initial = openPages(["https://a.test"]);

    expect(applyBrowserPatch(initial, "   ", { title: "x" })).toBe(initial);
  });
});

describe("recently closed pages", () => {
  it("forgets a closed page and lists it newest first", () => {
    let state = openPages(["https://a.test/", "https://b.test/"]);
    state = applyBrowserPatch(state, "b1", { title: "A" });
    state = removeBrowser(state, { browserId: "b1", now: 1 });
    state = removeBrowser(state, { browserId: "b2", now: 2 });

    expect(state.browsersById).toEqual({});
    expect(state.closedBrowsers).toEqual([
      { url: "https://b.test/", title: "", faviconUrl: null, closedAt: 2 },
      { url: "https://a.test/", title: "A", faviconUrl: null, closedAt: 1 },
    ]);
  });

  it("skips pages that only showed the new tab page, as Chrome's tab restore does", () => {
    const state = removeBrowser(openPages(["paseo://start"]), { browserId: "b1", now: 1 });

    expect(state.browsersById).toEqual({});
    expect(state.closedBrowsers).toEqual([]);
  });

  it("takes the newest closed page, or one picked from the list", () => {
    let state = openPages(["https://a.test/", "https://b.test/", "https://c.test/"]);
    for (const [index, browserId] of ["b1", "b2", "b3"].entries()) {
      state = removeBrowser(state, { browserId, now: index });
    }

    const newest = takeClosedBrowser(state, 0);
    expect(newest.entry?.url).toBe("https://c.test/");
    const picked = takeClosedBrowser(newest.state, 1);
    expect(picked.entry?.url).toBe("https://a.test/");
    expect(picked.state.closedBrowsers.map((entry) => entry.url)).toEqual(["https://b.test/"]);
    expect(takeClosedBrowser(EMPTY_INDEX, 0)).toEqual({ state: EMPTY_INDEX, entry: null });
  });

  it("remembers at most 25 closed pages", () => {
    let state = EMPTY_INDEX;
    for (let index = 0; index < 30; index += 1) {
      state = addBrowser(
        state,
        createBrowserRecord({ browserId: "b", initialUrl: `https://${index}.test/`, now: 0 }),
      );
      state = removeBrowser(state, { browserId: "b", now: index });
    }

    expect(state.closedBrowsers).toHaveLength(25);
    expect(state.closedBrowsers[0]?.url).toBe("https://29.test/");
  });
});

describe("sanitizeBrowsersForPersist", () => {
  it("clears transient fields on every record and keeps the closed list", () => {
    const initial = openPages(["https://a.test"]);
    const state = applyBrowserPatch(initial, "b1", { isLoading: true, lastError: "network down" });

    const persisted = sanitizeBrowsersForPersist(state);

    expect(persisted.browsersById.b1?.isLoading).toBe(false);
    expect(persisted.browsersById.b1?.lastError).toBe(null);
    expect(persisted.closedBrowsers).toEqual(initial.closedBrowsers);
  });

  it("preserves viewport state", () => {
    const state = applyBrowserPatch(openPages(["https://a.test"]), "b1", {
      viewport: createFixedBrowserViewport(640, 480),
    });

    expect(sanitizeBrowsersForPersist(state).browsersById.b1?.viewport).toEqual({
      mode: "fixed",
      width: 640,
      height: 480,
    });
  });
});

describe("normalizeBrowserIndexState", () => {
  it("defaults legacy persisted records to Responsive", () => {
    const persisted = sanitizeBrowsersForPersist(openPages(["https://a.test"]));
    const legacyRecord: Partial<NonNullable<BrowserIndexState["browsersById"]["b1"]>> = {
      ...persisted.browsersById.b1,
    };
    delete legacyRecord.viewport;

    expect(
      normalizeBrowserIndexState({ ...persisted, browsersById: { b1: legacyRecord } }).browsersById
        .b1?.viewport,
    ).toEqual({ mode: "responsive" });
  });

  it("keeps the history of a record saved while pages lived in windows", () => {
    const history = [{ url: "https://a.test/", title: "A", faviconUrl: null, visitedAt: 1 }];

    const normalized = normalizeBrowserIndexState({
      browsersById: {},
      windowsById: { w1: { windowId: "w1" } },
      history,
    });

    expect(normalized.history).toEqual(history);
    expect(normalized.closedBrowsers).toEqual([]);
  });
});

describe("browser history", () => {
  it("records committed visits once across tabs and preserves them after a tab closes", () => {
    let state = openPages(["https://a.test/", "https://b.test/"]);
    state = recordBrowserVisit(state, "b1", 1);
    state = recordBrowserVisit(state, "b2", 2);
    state = recordBrowserVisit(state, "b1", 3);
    state = applyBrowserPatch(state, "b1", { title: "A", faviconUrl: "https://a.test/icon.png" });
    state = removeBrowser(state, { browserId: "b1", now: 4 });
    expect(state.history.map((site) => site.url)).toEqual(["https://a.test/", "https://b.test/"]);
    expect(state.history[0]).toMatchObject({
      title: "A",
      visitedAt: 3,
      faviconUrl: "https://a.test/icon.png",
    });
    expect(normalizeBrowserIndexState(sanitizeBrowsersForPersist(state)).history).toEqual(
      state.history,
    );
  });

  it("does not record start pages or failed loads", () => {
    let state = openPages(["paseo://start", "https://a.test"]);
    state = applyBrowserPatch(state, "b2", { lastError: "Failed" });

    expect(recordBrowserVisit(state, "b1", 1)).toBe(state);
    expect(recordBrowserVisit(state, "b2", 1)).toBe(state);
    expect(normalizeBrowserIndexState({ browsersById: {} }).history).toEqual([]);
  });
});

describe("deleteBrowserHistory", () => {
  it("deletes visits and closed pages from the range's start on, and keeps older ones", () => {
    const page = (url: string) => ({ url, title: url, faviconUrl: null });
    const state: BrowserIndexState = {
      ...EMPTY_INDEX,
      history: [
        { ...page("https://new.test/"), visitedAt: 200 },
        { ...page("https://old.test/"), visitedAt: 50 },
      ],
      closedBrowsers: [
        { ...page("https://closed-new.test/"), closedAt: 150 },
        { ...page("https://closed-old.test/"), closedAt: 10 },
      ],
    };
    const result = deleteBrowserHistory(state, 100);
    expect(result.history.map((entry) => entry.url)).toEqual(["https://old.test/"]);
    expect(result.closedBrowsers.map((entry) => entry.url)).toEqual(["https://closed-old.test/"]);
  });
});
