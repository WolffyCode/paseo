export const BROWSER_START_URL = "paseo://start";

const BLANK_URL = "about:blank";

export type BrowserStartPhase = "start" | "navigating" | "page";

export interface BrowserStartSnapshot {
  phase: BrowserStartPhase;
  draft: string;
  url: string;
  canGoBack: boolean;
  canGoForward: boolean;
  isLoading: boolean;
}

export type BrowserNavigationIntent =
  | { kind: "load"; url: string; requestId: number }
  | { kind: "back"; requestId: number }
  | { kind: "forward"; requestId: number }
  | { kind: "reload"; requestId: number };

export interface BrowserNavigationObservation {
  requestId?: number;
  url?: string;
  canGoBack?: boolean;
  canGoForward?: boolean;
  isLoading?: boolean;
}

export function isBrowserStartUrl(url: string): boolean {
  const trimmed = url.trim();
  return trimmed.length === 0 || trimmed === BLANK_URL || trimmed === BROWSER_START_URL;
}

function phaseForUrl(url: string): BrowserStartPhase {
  return isBrowserStartUrl(url) ? "start" : "page";
}

export function openBrowserStartPage(input: { browserId: string; url: string }) {
  const listeners = new Set<() => void>();
  let closed = false;
  let latestRequestId = 0;
  const initialUrl = isBrowserStartUrl(input.url) ? BROWSER_START_URL : input.url;
  let snapshot: BrowserStartSnapshot = {
    phase: phaseForUrl(initialUrl),
    draft: phaseForUrl(initialUrl) === "start" ? "" : initialUrl,
    url: initialUrl,
    canGoBack: false,
    canGoForward: false,
    isLoading: false,
  };

  function publish(next: BrowserStartSnapshot) {
    if (closed) return;
    snapshot = next;
    for (const listener of listeners) listener();
  }

  function nextRequestId(): number {
    latestRequestId += 1;
    return latestRequestId;
  }

  return {
    browserId: input.browserId,
    getState(): BrowserStartSnapshot {
      return snapshot;
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    editDraft(text: string) {
      if (closed || text === snapshot.draft) return;
      publish({ ...snapshot, draft: text });
    },
    submitDraft(): BrowserNavigationIntent | null {
      if (closed) return null;
      const trimmed = snapshot.draft.trim();
      if (trimmed.length === 0 || isBrowserStartUrl(trimmed)) {
        publish({ ...snapshot, draft: "", phase: "start", url: BROWSER_START_URL });
        return null;
      }
      const requestId = nextRequestId();
      publish({ ...snapshot, draft: trimmed, phase: "navigating" });
      return { kind: "load", url: trimmed, requestId };
    },
    goBack(): BrowserNavigationIntent | null {
      if (closed || !snapshot.canGoBack) return null;
      return { kind: "back", requestId: nextRequestId() };
    },
    goForward(): BrowserNavigationIntent | null {
      if (closed || !snapshot.canGoForward) return null;
      return { kind: "forward", requestId: nextRequestId() };
    },
    reload(): BrowserNavigationIntent | null {
      if (closed || snapshot.phase === "start") return null;
      return { kind: "reload", requestId: nextRequestId() };
    },
    observeNavigation(patch: BrowserNavigationObservation) {
      if (closed) return;
      if (patch.requestId !== undefined && patch.requestId < latestRequestId) return;
      const url = patch.url ?? snapshot.url;
      const isStart = isBrowserStartUrl(url);
      let phase: BrowserStartPhase = "page";
      if (isStart) {
        phase = "start";
      } else if (patch.isLoading) {
        phase = "navigating";
      }
      publish({
        phase,
        draft: isStart ? "" : url,
        url: isStart ? BROWSER_START_URL : url,
        canGoBack: patch.canGoBack ?? snapshot.canGoBack,
        canGoForward: patch.canGoForward ?? snapshot.canGoForward,
        isLoading: patch.isLoading ?? snapshot.isLoading,
      });
    },
    close() {
      closed = true;
      listeners.clear();
    },
  };
}
