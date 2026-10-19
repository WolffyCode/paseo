import { useEffect } from "react";
import { getDesktopHost, type DesktopBrowserBridge } from "@/desktop/host";
import {
  collectAllTabs,
  findPaneContainingTab,
  useWorkspaceLayoutStore,
  useWorkspaceLayoutStoreHydrated,
  type WorkspaceLayout,
  type WorkspaceTabPlacement,
} from "@/stores/workspace-layout-store";
import type { WorkspaceTabTarget } from "@/workspace-tabs/model";
import { browserInternalPage } from "./internal-pages";
import { reloadResidentBrowserWebview, removeResidentBrowserWebview } from "./resident-webviews";
import { useBrowserStore, useBrowserStoreHydrated, type BrowserClosedEntry } from "./store";

/** A page and the column-3 tab that shows it. */
export interface WorkspaceBrowserTab {
  workspaceKey: string;
  tabId: string;
  browserId: string;
}

/** How a new page shows up: selected and in front, or quietly added beside its source. */
export type BrowserOpenActivation = "focus" | "background";

// A page opened without an address starts with the cursor in its address bar, as Chrome's new
// tab does. The page reads this once when it mounts.
const browsersAwaitingAddressFocus = new Set<string>();

/** Whether `browserId` was just opened empty and should focus its address bar; asks only once. */
export function takeAddressFocusRequest(browserId: string): boolean {
  return browsersAwaitingAddressFocus.delete(browserId);
}

function browserTarget(browserId: string): WorkspaceTabTarget {
  return { kind: "browser", browserId };
}

function createPage(input: { url: string | null; closedEntry?: BrowserClosedEntry }): string {
  const browserStore = useBrowserStore.getState();
  const browserId = input.closedEntry
    ? browserStore.createBrowser({
        initialUrl: input.closedEntry.url,
        title: input.closedEntry.title,
        faviconUrl: input.closedEntry.faviconUrl,
      })
    : browserStore.createBrowser({ initialUrl: input.url ?? undefined });
  if (input.url === null && !input.closedEntry) {
    browsersAwaitingAddressFocus.add(browserId);
  }
  return browserId;
}

/**
 * Opens a page as a column-3 tab of the workspace: `url` null shows the new tab page. With
 * `replaceTabId` the page takes that tab's place (the column-3 home page turning into a page).
 */
export function openBrowserInWorkspace(input: {
  workspaceKey: string;
  url: string | null;
  activation: BrowserOpenActivation;
  placement?: WorkspaceTabPlacement;
  replaceTabId?: string | null;
}): WorkspaceBrowserTab | null {
  const layoutStore = useWorkspaceLayoutStore.getState();
  const browserId = createPage({ url: input.url });
  const target = browserTarget(browserId);
  const tabId = input.replaceTabId
    ? layoutStore.replaceTab(input.workspaceKey, input.replaceTabId, target)
    : layoutStore.openTab({
        workspaceKey: input.workspaceKey,
        target,
        intent: input.activation === "focus" ? "reveal" : "background",
        placement: input.placement,
      });
  if (!tabId) {
    useBrowserStore.getState().removeBrowser(browserId);
    browsersAwaitingAddressFocus.delete(browserId);
    return null;
  }
  return { workspaceKey: input.workspaceKey, tabId, browserId };
}

/** The column-3 tab that shows `browserId` in `layout`. */
export function findBrowserTabInLayout(layout: WorkspaceLayout, browserId: string): string | null {
  const tab = collectAllTabs(layout.root).find(
    (candidate) => candidate.target.kind === "browser" && candidate.target.browserId === browserId,
  );
  return tab?.tabId ?? null;
}

/** The tab that shows `browserId`, in whichever workspace has one. */
export function findShownBrowserTab(browserId: string): WorkspaceBrowserTab | null {
  const { layoutByWorkspace } = useWorkspaceLayoutStore.getState();
  for (const [workspaceKey, layout] of Object.entries(layoutByWorkspace)) {
    const tabId = findBrowserTabInLayout(layout, browserId);
    if (tabId) {
      return { workspaceKey, tabId, browserId };
    }
  }
  return null;
}

/** Opens a page right after `sourceBrowserId`'s tab, in the same pane. */
function openPageBeside(input: {
  sourceBrowserId: string;
  browserId: string;
  isActive: boolean;
}): WorkspaceBrowserTab | null {
  const source = findShownBrowserTab(input.sourceBrowserId);
  const layoutStore = useWorkspaceLayoutStore.getState();
  const layout = source ? layoutStore.layoutByWorkspace[source.workspaceKey] : undefined;
  const pane = source && layout ? findPaneContainingTab(layout.root, source.tabId) : null;
  if (!source || !pane) {
    useBrowserStore.getState().removeBrowser(input.browserId);
    browsersAwaitingAddressFocus.delete(input.browserId);
    return null;
  }
  const tabId = layoutStore.openTab({
    workspaceKey: source.workspaceKey,
    target: browserTarget(input.browserId),
    intent: input.isActive ? "reveal" : "background",
    placement: { mode: "pane", paneId: pane.id },
    insertionPosition: { afterTabId: source.tabId },
  });
  return tabId ? { workspaceKey: source.workspaceKey, tabId, browserId: input.browserId } : null;
}

/**
 * A page's link, ⌘T, or an extension's chrome.tabs.create opens a new column-3 tab right after
 * the page, as Chrome opens it next to its opener. Without a URL the tab shows the new tab page.
 */
export function openBrowserFromPage(input: {
  sourceBrowserId: string;
  url: string | null;
  isActive: boolean;
}): string | null {
  const browserId = createPage({ url: input.url });
  return openPageBeside({ ...input, browserId })?.browserId ?? null;
}

/** Chrome's tab menu for a page's column-3 tab: 在右侧新增标签页, 重新加载 and 复制. */
export const browserTabCommands = {
  newTabToRight: (browserId: string) => {
    openBrowserFromPage({ sourceBrowserId: browserId, url: null, isActive: true });
  },
  reload: (browserId: string) => {
    reloadResidentBrowserWebview(browserId);
  },
  duplicate: (browserId: string) => {
    const url = useBrowserStore.getState().browsersById[browserId]?.url ?? null;
    openBrowserFromPage({ sourceBrowserId: browserId, url, isActive: true });
  },
};

/** ⇧⌘T or the history menu: reopens a closed page next to `sourceBrowserId`. */
export function reopenClosedBrowser(input: {
  sourceBrowserId: string;
  closedIndex?: number;
}): string | null {
  const closedEntry = useBrowserStore.getState().takeClosedBrowser(input.closedIndex);
  if (!closedEntry) {
    return null;
  }
  const browserId = createPage({ url: closedEntry.url, closedEntry });
  return (
    openPageBeside({ sourceBrowserId: input.sourceBrowserId, browserId, isActive: true })
      ?.browserId ?? null
  );
}

/**
 * The page in `sourceBrowserId`'s column 3 that shows the same Helm page as `url`, whatever its
 * query: Chrome's singleton tabs match a page with its path ignored.
 */
export function findBrowserOnInternalPage(input: {
  sourceBrowserId: string;
  url: string;
}): string | null {
  const page = browserInternalPage(input.url);
  const source = findShownBrowserTab(input.sourceBrowserId);
  const layout = source
    ? useWorkspaceLayoutStore.getState().layoutByWorkspace[source.workspaceKey]
    : undefined;
  const pane = source && layout ? findPaneContainingTab(layout.root, source.tabId) : null;
  if (!page || !pane) {
    return null;
  }
  const { browsersById } = useBrowserStore.getState();
  for (const tab of pane.tabs ?? []) {
    if (tab.target.kind !== "browser") continue;
    const browserId = tab.target.browserId;
    if (browserInternalPage(browsersById[browserId]?.url ?? "") === page) {
      return browserId;
    }
  }
  return null;
}

/** Brings a page's column-3 tab forward, as Chrome activates a tab. */
export function revealBrowserPage(browserId: string): void {
  const shownTab = findShownBrowserTab(browserId);
  if (shownTab) {
    useWorkspaceLayoutStore.getState().focusTab(shownTab.workspaceKey, shownTab.tabId);
  }
}

/** Releases a page: its webview, its registration with the desktop, and its record. */
export function disposeBrowserPage(input: {
  browserId: string;
  browserHost: DesktopBrowserBridge | undefined;
}): void {
  removeResidentBrowserWebview(input.browserId);
  void input.browserHost?.unregisterWorkspaceBrowser?.(input.browserId).catch((error: unknown) => {
    console.error("[browser-page] unregister failed", { browserId: input.browserId, error });
  });
  useBrowserStore.getState().removeBrowser(input.browserId);
}

/** Closes a page from outside its tab: an extension's chrome.tabs.remove, or an agent. */
export function closeBrowserPage(input: {
  browserId: string;
  browserHost: DesktopBrowserBridge | undefined;
}): void {
  const shownTab = findShownBrowserTab(input.browserId);
  if (shownTab) {
    useWorkspaceLayoutStore.getState().closeTab(shownTab.workspaceKey, shownTab.tabId);
  }
  // Released here as well, so the page is gone before the caller hears back.
  disposeBrowserPage(input);
}

/** The pages some workspace tab shows. A page outside this set can't come back on screen. */
export function shownBrowserIds(
  layoutByWorkspace: Readonly<Record<string, WorkspaceLayout>>,
): Set<string> {
  const browserIds = new Set<string>();
  for (const layout of Object.values(layoutByWorkspace)) {
    for (const tab of collectAllTabs(layout.root)) {
      if (tab.target.kind === "browser") {
        browserIds.add(tab.target.browserId);
      }
    }
  }
  return browserIds;
}

/** Releases every page no workspace tab shows: its tab closed or its pane went away. */
export function disposeUnshownBrowserPages(input: {
  layoutByWorkspace: Readonly<Record<string, WorkspaceLayout>>;
  browserHost: DesktopBrowserBridge | undefined;
}): void {
  const shown = shownBrowserIds(input.layoutByWorkspace);
  for (const browserId of Object.keys(useBrowserStore.getState().browsersById)) {
    if (!shown.has(browserId)) {
      disposeBrowserPage({ browserId, browserHost: input.browserHost });
    }
  }
}

/**
 * Keeps each page alive exactly as long as a column-3 tab shows it, whichever way that tab goes
 * away. Runs on layout changes only: a page is created just before the tab that shows it, and
 * checking in between would close it.
 */
export function useBrowserPageLifetime(): void {
  const isLayoutHydrated = useWorkspaceLayoutStoreHydrated();
  const isBrowserHydrated = useBrowserStoreHydrated();
  const layoutByWorkspace = useWorkspaceLayoutStore((state) => state.layoutByWorkspace);

  useEffect(() => {
    if (!isLayoutHydrated || !isBrowserHydrated) {
      return;
    }
    disposeUnshownBrowserPages({ layoutByWorkspace, browserHost: getDesktopHost()?.browser });
  }, [isBrowserHydrated, isLayoutHydrated, layoutByWorkspace]);
}
