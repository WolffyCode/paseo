import { useEffect } from "react";
import { getDesktopHost, type DesktopBrowserNewTabRequestEvent } from "@/desktop/host";
import { findBrowserTabInLayout, openBrowserFromPage } from "@/desktop/browser/workspace-browsers";
import type { WorkspaceLayout } from "@/stores/workspace-layout-store";
import { getIsElectron } from "@/constants/platform";
import { googleSearchUrl } from "@/desktop/browser/address-input";
import { useStableEvent } from "@/hooks/use-stable-event";

export type BrowserNewTabRequest = DesktopBrowserNewTabRequestEvent;

// Extension pages (chrome-extension:) open their own pages, such as options, in new tabs, and
// "View Page Source" opens a view-source: tab.
const NEW_TAB_PROTOCOLS = new Set(["http:", "https:", "chrome-extension:", "view-source:"]);

function isAllowedBrowserNewTabUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return NEW_TAB_PROTOCOLS.has(parsed.protocol) || parsed.href === "about:blank";
  } catch {
    return false;
  }
}

function readDesktopBrowserNewTabRequest(payload: unknown): BrowserNewTabRequest | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const candidate = payload as Partial<BrowserNewTabRequest> & { searchTerms?: unknown };
  if (typeof candidate.sourceBrowserId !== "string" || !candidate.sourceBrowserId.trim()) {
    return null;
  }
  if (typeof candidate.isActive !== "boolean") {
    return null;
  }
  // The page menu's "Search Google for …" sends the selection; the search URL is built here.
  if (typeof candidate.searchTerms === "string" && candidate.searchTerms.trim()) {
    return {
      sourceBrowserId: candidate.sourceBrowserId,
      url: googleSearchUrl(candidate.searchTerms.trim()),
      isActive: candidate.isActive,
    };
  }
  if (typeof candidate.url !== "string" || !isAllowedBrowserNewTabUrl(candidate.url)) {
    return null;
  }
  return {
    sourceBrowserId: candidate.sourceBrowserId,
    url: candidate.url,
    isActive: candidate.isActive,
  };
}

/** A page's new-tab request belongs to the workspace whose layout shows the page. */
export function resolveBrowserNewTabRequest(input: {
  payload: unknown;
  workspaceLayout: WorkspaceLayout | null | undefined;
}): BrowserNewTabRequest | null {
  const request = readDesktopBrowserNewTabRequest(input.payload);
  if (!request || !input.workspaceLayout) {
    return null;
  }
  const sourceTabId = findBrowserTabInLayout(input.workspaceLayout, request.sourceBrowserId);
  return sourceTabId ? request : null;
}

export function useDesktopBrowserNewTabRequests(input: {
  enabled: boolean;
  workspaceLayout: WorkspaceLayout | null | undefined;
}): void {
  const handleNewTabRequest = useStableEvent((payload: unknown) => {
    const request = resolveBrowserNewTabRequest({
      payload,
      workspaceLayout: input.workspaceLayout,
    });
    if (!request) {
      return;
    }
    openBrowserFromPage({
      sourceBrowserId: request.sourceBrowserId,
      url: request.url,
      isActive: request.isActive,
    });
  });

  useEffect(() => {
    if (!input.enabled || !getIsElectron()) {
      return;
    }
    const unsubscribe = getDesktopHost()?.events?.on?.(
      "browser-new-tab-request",
      handleNewTabRequest,
    );
    if (typeof unsubscribe === "function") {
      return unsubscribe;
    }
    return () => {
      void unsubscribe?.then((dispose) => dispose());
    };
  }, [handleNewTabRequest, input.enabled]);
}
