import { describe, expect, it } from "vitest";
import { BROWSER_START_URL, isBrowserStartUrl, openBrowserStartPage } from "./start-page";

describe("openBrowserStartPage", () => {
  it("treats the start address as an empty start page", () => {
    const page = openBrowserStartPage({ browserId: "b1", url: BROWSER_START_URL });
    expect(page.getSnapshot()).toEqual({
      phase: "start",
      draft: "",
      url: BROWSER_START_URL,
      canGoBack: false,
      canGoForward: false,
      isLoading: false,
      recentSites: [],
      addressFocused: false,
      suggestions: [],
      selectedSuggestionIndex: -1,
    });
    expect(isBrowserStartUrl("")).toBe(true);
    expect(isBrowserStartUrl("about:blank")).toBe(true);
    expect(isBrowserStartUrl("https://example.com")).toBe(false);
  });

  it("submits a url as a navigation intent and ignores an older result", () => {
    const page = openBrowserStartPage({ browserId: "b1", url: BROWSER_START_URL });
    page.editDraft("  example.com  ");
    const first = page.submitDraft();
    page.editDraft("paseo.sh");
    const second = page.submitDraft();
    page.observeNavigation({ requestId: first?.requestId, url: "https://example.com" });
    expect(page.getSnapshot().phase).toBe("navigating");
    expect(page.getSnapshot().url).toBe(BROWSER_START_URL);
    page.observeNavigation({
      requestId: second?.requestId,
      url: "https://paseo.sh",
      isLoading: false,
    });
    expect(page.getSnapshot()).toMatchObject({
      phase: "page",
      url: "https://paseo.sh",
      draft: "https://paseo.sh",
    });
  });

  it("keeps an empty submit on the start page and ignores reload there", () => {
    const page = openBrowserStartPage({ browserId: "b1", url: BROWSER_START_URL });
    page.editDraft("   ");
    expect(page.submitDraft()).toBeNull();
    expect(page.reload()).toBeNull();
    expect(page.getSnapshot().phase).toBe("start");
  });

  it("keeps the submitted navigation active when loading starts before the URL commits", () => {
    const page = openBrowserStartPage({ browserId: "b1", url: BROWSER_START_URL });
    page.editDraft("example.com");
    page.submitDraft();
    expect(page.getSnapshot().isLoading).toBe(true);

    page.observeNavigation({ isLoading: true, canGoBack: false, canGoForward: false });
    expect(page.getSnapshot()).toMatchObject({
      phase: "navigating",
      draft: "example.com",
      isLoading: true,
    });

    page.observeNavigation({ url: "https://example.com/", isLoading: false, canGoBack: true });
    expect(page.getSnapshot()).toMatchObject({
      phase: "page",
      draft: "https://example.com/",
      isLoading: false,
      canGoBack: true,
    });
  });

  it("does not overwrite an edited address when only loading or history changes", () => {
    const page = openBrowserStartPage({ browserId: "b1", url: "https://example.com/" });
    page.editDraft("https://paseo.sh");
    page.observeNavigation({ isLoading: false, canGoBack: true });
    expect(page.getSnapshot().draft).toBe("https://paseo.sh");
    expect(page.goBack()).toMatchObject({ kind: "back" });
    page.observeNavigation({ url: "https://example.com/", isLoading: false });
    expect(page.getSnapshot().draft).toBe("https://paseo.sh");
  });

  it("does not replace an open webpage when an empty address is submitted", () => {
    const page = openBrowserStartPage({ browserId: "b1", url: "https://example.com/" });
    page.editDraft("   ");
    expect(page.submitDraft()).toBeNull();
    expect(page.getSnapshot()).toMatchObject({ phase: "page", url: "https://example.com/" });
  });

  it("settles a failed first navigation without returning to the start page", () => {
    const page = openBrowserStartPage({ browserId: "b1", url: BROWSER_START_URL });
    page.editDraft("https://unreachable.test");
    page.submitDraft();
    page.observeNavigation({ isLoading: false });
    expect(page.getSnapshot()).toMatchObject({
      phase: "page",
      draft: "https://unreachable.test",
      isLoading: false,
    });
  });

  it("shares recommendations and filters focused address suggestions by title or URL", () => {
    const page = openBrowserStartPage({ browserId: "b1", url: BROWSER_START_URL });
    const history = [
      { url: "https://paseo.sh", title: "Paseo", faviconUrl: null },
      { url: "https://a.test", title: "文档", faviconUrl: null },
      ...["b", "c", "d", "e", "f"].map((host) => ({
        url: `https://${host}.test`,
        title: host,
        faviconUrl: null,
      })),
    ];
    page.setHistory(history);
    expect(page.getSnapshot().recentSites).toEqual(history.slice(0, 4));
    expect(page.getSnapshot().suggestions).toEqual([]);
    page.focusAddress();
    expect(page.getSnapshot().suggestions).toEqual(history.slice(0, 6));
    page.editDraft("文档");
    expect(page.getSnapshot().suggestions).toEqual([history[1]]);
    page.editDraft("PASEO.SH");
    expect(page.getSnapshot().suggestions).toEqual([history[0]]);
  });

  it("navigates the keyboard-selected suggestion and closes the popup", () => {
    const page = openBrowserStartPage({ browserId: "b1", url: BROWSER_START_URL });
    page.setHistory([
      { url: "https://a.test", title: "A", faviconUrl: null },
      { url: "https://b.test", title: "B", faviconUrl: null },
    ]);
    page.focusAddress();
    page.moveSuggestion(-1);
    expect(page.getSnapshot().selectedSuggestionIndex).toBe(1);
    expect(page.submitDraft()).toMatchObject({ kind: "load", url: "https://b.test" });
    expect(page.getSnapshot()).toMatchObject({
      addressFocused: false,
      suggestions: [],
      phase: "navigating",
    });
  });

  it("cycles the arrow keys through the typed text's row and the suggestions", () => {
    const page = openBrowserStartPage({ browserId: "b1", url: BROWSER_START_URL });
    page.setHistory([
      { url: "https://a.test", title: "A", faviconUrl: null },
      { url: "https://b.test", title: "B", faviconUrl: null },
    ]);
    page.focusAddress();
    page.moveSuggestion(1);
    page.moveSuggestion(1);
    expect(page.getSnapshot().selectedSuggestionIndex).toBe(1);
    page.moveSuggestion(1);
    expect(page.getSnapshot().selectedSuggestionIndex).toBe(-1);
    page.moveSuggestion(1);
    expect(page.getSnapshot().selectedSuggestionIndex).toBe(0);
  });

  it("cancels an address edit without changing the current page", () => {
    const page = openBrowserStartPage({ browserId: "b1", url: "https://a.test" });
    page.focusAddress();
    page.editDraft("https://b.test");
    page.cancelAddressEditing();
    expect(page.getSnapshot()).toMatchObject({
      draft: "https://a.test",
      url: "https://a.test",
      phase: "page",
      addressFocused: false,
    });
  });

  it("returns back and forward only when the observed history allows them", () => {
    const page = openBrowserStartPage({ browserId: "b1", url: "https://paseo.sh" });
    expect(page.goBack()).toBeNull();
    page.observeNavigation({ url: "https://paseo.sh", canGoBack: true, canGoForward: false });
    expect(page.goBack()).toMatchObject({ kind: "back" });
    expect(page.goForward()).toBeNull();
  });
});
