import { describe, expect, it } from "vitest";
import {
  entryKeys,
  extendTypedPrefix,
  nextSelectableIndex,
  prefixMatchIndex,
  type ChromeMenuEntry,
} from "./model";

const ENTRIES: ChromeMenuEntry[] = [
  { kind: "item", id: "newTab", label: "New tab" },
  { kind: "separator" },
  { kind: "item", id: "recent", label: "Recent tabs", isEnabled: false },
  { kind: "submenu", id: "history", label: "History", entries: [] },
  { kind: "title", label: "Share" },
  { kind: "item", id: "help", label: "Help" },
];

describe("menu keyboard movement", () => {
  it("steps over separators, headings and disabled rows, and stops at the ends", () => {
    expect(nextSelectableIndex(ENTRIES, null, 1)).toBe(0);
    expect(nextSelectableIndex(ENTRIES, null, -1)).toBe(5);
    expect(nextSelectableIndex(ENTRIES, 0, 1)).toBe(3);
    expect(nextSelectableIndex(ENTRIES, 3, 1)).toBe(5);
    expect(nextSelectableIndex(ENTRIES, 5, 1)).toBe(5);
    expect(nextSelectableIndex(ENTRIES, 0, -1)).toBe(0);
  });

  it("has nowhere to go in a menu with nothing to choose", () => {
    expect(nextSelectableIndex([{ kind: "separator" }], null, 1)).toBeNull();
  });

  it("jumps to the next row starting with a typed letter", () => {
    expect(prefixMatchIndex(ENTRIES, null, "h")).toBe(3);
    expect(prefixMatchIndex(ENTRIES, 3, "h")).toBe(5);
    expect(prefixMatchIndex(ENTRIES, 5, "h")).toBe(3);
    expect(prefixMatchIndex(ENTRIES, null, "r")).toBeNull();
  });

  it("spells one prefix from letters typed close together", () => {
    const first = extendTypedPrefix(null, "h", 1000);
    expect(extendTypedPrefix(first, "e", 1200).text).toBe("he");
    expect(extendTypedPrefix(first, "e", 3000).text).toBe("e");
    expect(prefixMatchIndex(ENTRIES, 5, "he")).toBe(5);
  });
});

describe("menu row keys", () => {
  it("keys rows without an id by the row before them", () => {
    expect(entryKeys(ENTRIES)).toEqual([
      "newTab",
      "separator:after:newTab",
      "recent",
      "history",
      "title:Share",
      "help",
    ]);
  });
});
