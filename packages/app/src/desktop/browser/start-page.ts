export const BROWSER_START_URL = "paseo://start";

const BLANK_URL = "about:blank";

export type BrowserStartPhase = "start" | "navigating" | "page";

const RECENT_SITE_LIMIT = 4;

export interface BrowserStartSnapshot {
  phase: BrowserStartPhase;
  draft: string;
  url: string;
  canGoBack: boolean;
  canGoForward: boolean;
  isLoading: boolean;
  recentSites: BrowserRecentSite[];
  addressFocused: boolean;
  suggestions: BrowserRecentSite[];
  selectedSuggestionIndex: number;
}

export interface BrowserRecentSite {
  url: string;
  title: string;
  faviconUrl: string | null;
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
  let history: readonly BrowserRecentSite[] = [];
  let addressQuery = "";
  const initialUrl = isBrowserStartUrl(input.url) ? BROWSER_START_URL : input.url;
  let snapshot: BrowserStartSnapshot = {
    phase: phaseForUrl(initialUrl),
    draft: phaseForUrl(initialUrl) === "start" ? "" : initialUrl,
    url: initialUrl,
    canGoBack: false,
    canGoForward: false,
    isLoading: false,
    recentSites: [],
    addressFocused: false,
    suggestions: [],
    selectedSuggestionIndex: -1,
  };

  function publish(next: BrowserStartSnapshot) {
    if (closed) return;
    const query = addressQuery.trim().toLocaleLowerCase();
    const suggestions = next.addressFocused
      ? history
          .filter(
            (site) => !query || `${site.title} ${site.url}`.toLocaleLowerCase().includes(query),
          )
          .slice(0, 6)
      : [];
    snapshot = {
      ...next,
      recentSites: history.slice(0, RECENT_SITE_LIMIT),
      suggestions,
      selectedSuggestionIndex:
        next.selectedSuggestionIndex < suggestions.length ? next.selectedSuggestionIndex : -1,
    };
    for (const listener of listeners) listener();
  }

  function nextRequestId(): number {
    latestRequestId += 1;
    return latestRequestId;
  }

  function submitAddress(value: string): BrowserNavigationIntent | null {
    if (closed) return null;
    const trimmed = value.trim();
    if (trimmed.length === 0 || isBrowserStartUrl(trimmed)) return null;
    const requestId = nextRequestId();
    publish({
      ...snapshot,
      draft: trimmed,
      phase: "navigating",
      isLoading: true,
      addressFocused: false,
      selectedSuggestionIndex: -1,
    });
    return { kind: "load", url: trimmed, requestId };
  }

  return {
    browserId: input.browserId,
    getSnapshot(): BrowserStartSnapshot {
      return snapshot;
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    editDraft(text: string) {
      if (closed || text === snapshot.draft) return;
      addressQuery = text;
      publish({ ...snapshot, draft: text, selectedSuggestionIndex: -1 });
    },
    setHistory(sites: readonly BrowserRecentSite[]) {
      if (closed || history === sites) return;
      history = sites;
      publish(snapshot);
    },
    focusAddress() {
      addressQuery = "";
      publish({ ...snapshot, addressFocused: true, selectedSuggestionIndex: -1 });
    },
    blurAddress() {
      publish({ ...snapshot, addressFocused: false, selectedSuggestionIndex: -1 });
    },
    cancelAddressEditing() {
      publish({
        ...snapshot,
        draft: isBrowserStartUrl(snapshot.url) ? "" : snapshot.url,
        addressFocused: false,
        selectedSuggestionIndex: -1,
      });
    },
    moveSuggestion(direction: 1 | -1) {
      const count = snapshot.suggestions.length;
      if (!count) return;
      // Index -1 is the row for what was typed, the default match Chrome lists first; the
      // arrows cycle through it like any other row.
      const rowCount = count + 1;
      const currentRow = snapshot.selectedSuggestionIndex + 1;
      const nextRow = (currentRow + direction + rowCount) % rowCount;
      publish({ ...snapshot, selectedSuggestionIndex: nextRow - 1 });
    },
    submitSuggestion(index: number): BrowserNavigationIntent | null {
      const site = snapshot.suggestions[index];
      return site ? submitAddress(site.url) : null;
    },
    submitDraft(): BrowserNavigationIntent | null {
      const selected = snapshot.suggestions[snapshot.selectedSuggestionIndex];
      return submitAddress(selected?.url ?? snapshot.draft);
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
      const isLoading = patch.isLoading ?? snapshot.isLoading;
      let phase = snapshot.phase;
      if (patch.url !== undefined) {
        if (isStart) {
          phase = "start";
        } else {
          phase = isLoading ? "navigating" : "page";
        }
      } else if (phase !== "start" && patch.isLoading !== undefined) {
        phase = isLoading ? "navigating" : "page";
      }
      let draft = snapshot.draft;
      if (patch.url !== undefined && url !== snapshot.url) {
        draft = isStart ? "" : url;
      }
      publish({
        ...snapshot,
        phase,
        draft,
        url: isStart ? BROWSER_START_URL : url,
        canGoBack: patch.canGoBack ?? snapshot.canGoBack,
        canGoForward: patch.canGoForward ?? snapshot.canGoForward,
        isLoading,
      });
    },
    close() {
      closed = true;
      listeners.clear();
    },
  };
}
