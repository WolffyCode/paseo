import { beforeEach, describe, expect, it } from "vitest";
import { createJSONStorage, type StateStorage } from "zustand/middleware";
import { useBrowserStore } from "@/desktop/browser/store";
import { collectAllTabs, useWorkspaceLayoutStore } from "@/stores/workspace-layout-store";
import { BROWSER_EXTENSIONS_URL, extensionDetailsUrl } from "./internal-pages";
import {
  browserTabCommands,
  disposeUnshownBrowserPages,
  findBrowserOnInternalPage,
  openBrowserFromPage,
  openBrowserInWorkspace,
  reopenClosedBrowser,
  requestBrowserNavigation,
  subscribeBrowserNavigation,
  takeAddressFocusRequest,
} from "./workspace-browsers";

class MemoryStateStorage implements StateStorage {
  private readonly values = new Map<string, string>();
  public getItem = (key: string): string | null => this.values.get(key) ?? null;
  public setItem = (key: string, value: string): void => {
    this.values.set(key, value);
  };
  public removeItem = (key: string): void => {
    this.values.delete(key);
  };
  public clear(): void {
    this.values.clear();
  }
}

const storage = new MemoryStateStorage();
useBrowserStore.persist.setOptions({ storage: createJSONStorage(() => storage) });
useWorkspaceLayoutStore.persist.setOptions({ storage: createJSONStorage(() => storage) });

const WORKSPACE_KEY = "server-1:workspace-1";

function workspaceTabs() {
  const layout = useWorkspaceLayoutStore.getState().layoutByWorkspace[WORKSPACE_KEY];
  return layout ? collectAllTabs(layout.root) : [];
}

/** The pages the workspace's tabs show, in tab order. */
function pageTabs(): string[] {
  return workspaceTabs().flatMap((tab) =>
    tab.target.kind === "browser" ? [tab.target.browserId] : [],
  );
}

function tabIdOf(browserId: string): string {
  const tab = workspaceTabs().find(
    (candidate) => candidate.target.kind === "browser" && candidate.target.browserId === browserId,
  );
  if (!tab) throw new Error(`Expected a tab for ${browserId}`);
  return tab.tabId;
}

function openPage(url: string | null): string {
  const opened = openBrowserInWorkspace({ workspaceKey: WORKSPACE_KEY, url, activation: "focus" });
  if (!opened) throw new Error("Expected the page to open");
  return opened.browserId;
}

function urlOf(browserId: string): string | undefined {
  return useBrowserStore.getState().browsersById[browserId]?.url;
}

describe("workspace browser pages", () => {
  beforeEach(() => {
    storage.clear();
    useBrowserStore.setState({ browsersById: {}, closedBrowsers: [], history: [] });
    useWorkspaceLayoutStore.setState({ layoutByWorkspace: {} });
  });

  it("opens every page as its own column-3 tab", () => {
    const first = openPage("https://a.test/");
    const second = openPage("https://b.test/");

    expect(pageTabs()).toEqual([first, second]);
    expect(urlOf(second)).toBe("https://b.test/");
  });

  it("opens a page's links and new tabs right after the page", () => {
    const first = openPage("https://a.test/");
    const last = openPage("https://c.test/");

    const link = openBrowserFromPage({
      sourceBrowserId: first,
      url: "https://b.test/",
      isActive: false,
    });

    expect(pageTabs()).toEqual([first, link, last]);
  });

  it("focuses the address bar of a page opened without an address, once", () => {
    const blank = openPage(null);
    const page = openPage("https://a.test/");

    expect(takeAddressFocusRequest(blank)).toBe(true);
    expect(takeAddressFocusRequest(blank)).toBe(false);
    expect(takeAddressFocusRequest(page)).toBe(false);
  });

  it("duplicates a page next to it, as Chrome's tab menu does", () => {
    const first = openPage("https://a.test/");

    browserTabCommands.duplicate(first);

    const [, duplicate] = pageTabs();
    expect(duplicate).not.toBe(first);
    expect(urlOf(duplicate ?? "")).toBe("https://a.test/");
  });

  it("releases a page once its tab closes, and reopens it next to the current page", () => {
    const first = openPage("https://a.test/");
    const second = openPage("https://b.test/");
    useWorkspaceLayoutStore.getState().closeTab(WORKSPACE_KEY, tabIdOf(first));

    disposeUnshownBrowserPages({
      layoutByWorkspace: useWorkspaceLayoutStore.getState().layoutByWorkspace,
      browserHost: undefined,
    });

    expect(urlOf(first)).toBeUndefined();
    expect(useBrowserStore.getState().closedBrowsers.map((entry) => entry.url)).toEqual([
      "https://a.test/",
    ]);

    const reopened = reopenClosedBrowser({ sourceBrowserId: second });
    expect(pageTabs()).toEqual([second, reopened]);
    expect(urlOf(reopened ?? "")).toBe("https://a.test/");
    expect(useBrowserStore.getState().closedBrowsers).toEqual([]);
  });

  it("finds the page in the same column 3 that shows a Helm page, whatever its query", () => {
    const source = openPage("https://a.test/");
    const extensions = openPage(extensionDetailsUrl("abcdefghijklmnopabcdefghijklmnop"));

    expect(
      findBrowserOnInternalPage({ sourceBrowserId: source, url: BROWSER_EXTENSIONS_URL }),
    ).toBe(extensions);
  });
});

describe("navigation another tab asks a page for", () => {
  it("reaches a page that is already showing, once", () => {
    const visited: string[] = [];
    const unsubscribe = subscribeBrowserNavigation("browser-a", (url) => visited.push(url));
    requestBrowserNavigation("browser-a", "paseo://settings");
    unsubscribe();
    requestBrowserNavigation("browser-a", "paseo://settings/help");

    expect(visited).toEqual(["paseo://settings"]);
  });

  it("waits for a page that hasn't mounted yet", () => {
    requestBrowserNavigation("browser-b", "paseo://downloads");
    const visited: string[] = [];
    const unsubscribe = subscribeBrowserNavigation("browser-b", (url) => visited.push(url));
    unsubscribe();
    subscribeBrowserNavigation("browser-b", (url) => visited.push(url))();

    expect(visited).toEqual(["paseo://downloads"]);
  });
});
