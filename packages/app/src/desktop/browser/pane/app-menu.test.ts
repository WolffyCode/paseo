import type { TFunction } from "i18next";
import { describe, expect, it } from "vitest";
import type { ChromeMenuEntry } from "../chrome-menu/model";
import { appMenuChoice, buildAppMenuEntries } from "./app-menu";

const t = ((key: string) => key) as unknown as TFunction;

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
    const atMax = buildAppMenuEntries({ t, os: "mac", zoomFactor: 5, recentlyClosed: [] });
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
    });
    const history = findEntry(entries, "history");
    expect(history?.kind === "submenu" && history.entries).toEqual([
      { kind: "title", label: "workspace.browser.appMenu.recentTabs" },
      { kind: "item", id: "reopen:0", label: "A", shortcut: ["mod", "shift", "T"] },
      { kind: "item", id: "reopen:1", label: "B", shortcut: undefined },
    ]);
  });

  it("shows each platform's keys for 下载内容 and 开发者工具", () => {
    const entries = buildAppMenuEntries({ t, os: "non-mac", zoomFactor: 1, recentlyClosed: [] });
    expect(findEntry(entries, "showDownloads")).toMatchObject({ shortcut: ["ctrl", "J"] });
    expect(findEntry(entries, "devTools")).toMatchObject({ shortcut: ["ctrl", "shift", "I"] });
  });

  it("turns a chosen row into the command it runs", () => {
    expect(appMenuChoice("savePage")).toEqual({ kind: "command", command: "savePage" });
    expect(appMenuChoice("reopen:3")).toEqual({ kind: "reopenClosed", closedIndex: 3 });
    expect(appMenuChoice("profile")).toBeNull();
  });
});
