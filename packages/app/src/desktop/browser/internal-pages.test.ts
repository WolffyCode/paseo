import { describe, expect, it } from "vitest";
import {
  BROWSER_EXTENSIONS_URL,
  browserInternalPage,
  extensionDetailsId,
  extensionDetailsUrl,
  settingsRoute,
  settingsUrl,
  BROWSER_SETTINGS_URL,
} from "./internal-pages";

describe("browserInternalPage", () => {
  it("recognizes Helm's pages with or without a query", () => {
    expect(browserInternalPage(BROWSER_EXTENSIONS_URL)).toBe("extensions");
    expect(browserInternalPage(`${BROWSER_EXTENSIONS_URL}?id=abc`)).toBe("extensions");
  });

  it("leaves web pages, the start page and unknown Helm pages alone", () => {
    expect(browserInternalPage("https://example.com/extensions")).toBeNull();
    expect(browserInternalPage("paseo://start")).toBeNull();
    expect(browserInternalPage("paseo://flags")).toBeNull();
    expect(browserInternalPage("not a url")).toBeNull();
  });

  it("reads the settings route from the path", () => {
    expect(browserInternalPage(settingsUrl("/clearBrowserData"))).toBe("settings");
    expect(settingsRoute(settingsUrl("/clearBrowserData"))).toBe("/clearBrowserData");
    expect(settingsRoute(BROWSER_SETTINGS_URL)).toBe("/");
  });

  it("reads back the extension a details address shows", () => {
    expect(extensionDetailsId(extensionDetailsUrl("abc"))).toBe("abc");
    expect(browserInternalPage(extensionDetailsUrl("abc"))).toBe("extensions");
    expect(extensionDetailsId(BROWSER_EXTENSIONS_URL)).toBeNull();
  });
});
