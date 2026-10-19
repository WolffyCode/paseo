import type { TFunction } from "i18next";
import { describe, expect, it } from "vitest";
import type { ChromeMenuEntry } from "../chrome-menu/model";
import { appMenuChoice, appMenuProfileName, buildAppMenuEntries } from "./app-menu";

const t = ((key: string) => key) as unknown as TFunction;
const profile = { name: "您的 Helm", avatarId: null };

function findEntry(entries: readonly ChromeMenuEntry[], id: string): ChromeMenuEntry | undefined {
  for (const entry of entries) {
    if ((entry.kind === "item" || entry.kind === "submenu") && entry.id === id) {
      return entry;
    }
    if (entry.kind === "submenu") {
      const nested = findEntry(entry.entries, id);
      if (nested) return nested;
    }
  }
  return undefined;
}

describe("the ⋮ menu", () => {
  it("dims the zoom buttons at Chrome's smallest and largest steps", () => {
    const atMax = buildAppMenuEntries({
      t,
      os: "mac",
      zoomFactor: 5,
      recentlyClosed: [],
      profile,
    });
    const zoomRow = atMax.find((entry) => entry.kind === "zoom");
    expect(zoomRow).toMatchObject({ percent: 500, canZoomIn: false, canZoomOut: true });
  });

  it("lists recently closed tabs under 历史记录, the newest carrying ⇧⌘T", () => {
    const entries = buildAppMenuEntries({
      t,
      os: "mac",
      zoomFactor: 1,
      recentlyClosed: [
        { url: "https://a.test/", title: "A", faviconUrl: null, closedAt: 2 },
        { url: "https://b.test/", title: "B", faviconUrl: null, closedAt: 1 },
      ],
      profile,
    });
    const history = findEntry(entries, "history");
    expect(history?.kind === "submenu" && history.entries).toEqual([
      { kind: "title", label: "workspace.browser.appMenu.recentTabs" },
      { kind: "item", id: "reopen:0", label: "A", shortcut: ["mod", "shift", "T"] },
      { kind: "item", id: "reopen:1", label: "B", shortcut: undefined },
    ]);
  });

  it("shows each platform's keys for 下载内容 and 开发者工具", () => {
    const entries = buildAppMenuEntries({
      t,
      os: "non-mac",
      zoomFactor: 1,
      recentlyClosed: [],
      profile,
    });
    expect(findEntry(entries, "showDownloads")).toMatchObject({ shortcut: ["ctrl", "J"] });
    expect(findEntry(entries, "devTools")).toMatchObject({ shortcut: ["ctrl", "shift", "I"] });
  });

  it("shows the profile's name and picked avatar on its row, which opens 自定义您的 Helm", () => {
    const entries = buildAppMenuEntries({
      t,
      os: "mac",
      zoomFactor: 1,
      recentlyClosed: [],
      profile: { name: "测试资料", avatarId: "corgi" },
    });
    const profileRow = findEntry(entries, "profile");
    expect(profileRow).toMatchObject({ label: "测试资料", profileRow: { avatarId: "corgi" } });
    expect(profileRow?.kind === "submenu" && profileRow.entries).toEqual([
      {
        kind: "item",
        id: "customizeChrome",
        label: "workspace.browser.appMenu.customizeYourChrome",
        icon: "menuCustomize",
      },
    ]);
  });

  it("cuts a profile name past 30 characters to whole characters and an ellipsis", () => {
    expect(appMenuProfileName("a".repeat(30))).toBe("a".repeat(30));
    expect(appMenuProfileName("a".repeat(31))).toBe(`${"a".repeat(29)}…`);
    // A surrogate pair that would straddle the cut is left out whole.
    expect(appMenuProfileName(`${"a".repeat(28)}😀😀`)).toBe(`${"a".repeat(28)}…`);
  });

  it("turns a chosen row into the command it runs", () => {
    expect(appMenuChoice("savePage")).toEqual({ kind: "command", command: "savePage" });
    expect(appMenuChoice("reopen:3")).toEqual({ kind: "reopenClosed", closedIndex: 3 });
    expect(appMenuChoice("profile")).toBeNull();
  });
});
