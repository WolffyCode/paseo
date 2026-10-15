import { describe, expect, it } from "vitest";
import { BROWSER_START_URL, isBrowserStartUrl, openBrowserStartPage } from "./start-page";

describe("openBrowserStartPage", () => {
  it("treats the start address as an empty start page", () => {
    const page = openBrowserStartPage({ browserId: "b1", url: BROWSER_START_URL });
    expect(page.getState()).toEqual({
      phase: "start",
      draft: "",
      url: BROWSER_START_URL,
      canGoBack: false,
      canGoForward: false,
      isLoading: false,
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
    expect(page.getState().phase).toBe("navigating");
    expect(page.getState().url).toBe(BROWSER_START_URL);
    page.observeNavigation({
      requestId: second?.requestId,
      url: "https://paseo.sh",
      isLoading: false,
    });
    expect(page.getState()).toMatchObject({
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
    expect(page.getState().phase).toBe("start");
  });

  it("returns back and forward only when the observed history allows them", () => {
    const page = openBrowserStartPage({ browserId: "b1", url: "https://paseo.sh" });
    expect(page.goBack()).toBeNull();
    page.observeNavigation({ url: "https://paseo.sh", canGoBack: true, canGoForward: false });
    expect(page.goBack()).toMatchObject({ kind: "back" });
    expect(page.goForward()).toBeNull();
  });
});
