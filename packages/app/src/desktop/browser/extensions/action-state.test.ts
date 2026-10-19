import { describe, expect, it } from "vitest";
import {
  actionDetailsForTab,
  actionIconUrl,
  badgeBackgroundColor,
  badgeTextColor,
} from "./action-state";

describe("actionDetailsForTab", () => {
  const action = {
    id: "ext",
    title: "Default title",
    text: "",
    tabs: { "7": { text: "3", color: "#d93025" } },
  };

  it("lets a tab's own values win over the extension defaults", () => {
    expect(actionDetailsForTab(action, 7)).toEqual({
      title: "Default title",
      text: "3",
      color: "#d93025",
    });
  });

  it("uses the defaults for tabs without overrides or without an id yet", () => {
    expect(actionDetailsForTab(action, 8)).toEqual({ title: "Default title", text: "" });
    expect(actionDetailsForTab(action, null)).toEqual({ title: "Default title", text: "" });
  });
});

describe("actionIconUrl", () => {
  it("asks the browser profile for the tab's icon and busts the cache on change", () => {
    expect(
      actionIconUrl({
        extensionId: "ext",
        tabId: 7,
        partition: "persist:paseo-browser",
        iconModified: 42,
      }),
    ).toBe("crx://extension-icon/ext/32/2?tabId=7&partition=persist%3Apaseo-browser&t=42");
  });
});

describe("badge colors", () => {
  it("reads chrome.action color arrays as opaque CSS", () => {
    expect(badgeBackgroundColor([217, 48, 37, 128])).toBe("rgb(217,48,37)");
    expect(badgeBackgroundColor("#1a73e8")).toBe("#1a73e8");
    expect(badgeBackgroundColor(undefined)).toBeNull();
  });

  it("picks dark text on light badges and white text on dark ones", () => {
    expect(badgeTextColor("#F2F2F2")).toBe("#202124");
    expect(badgeTextColor("#fff")).toBe("#202124");
    expect(badgeTextColor("rgb(217,48,37)")).toBe("#FFFFFF");
    expect(badgeTextColor("#282828")).toBe("#FFFFFF");
    expect(badgeTextColor("purple")).toBe("#FFFFFF");
  });
});
