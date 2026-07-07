import { describe, expect, it, test } from "vitest";
import { deriveContextMenuItems, newEntryParentDir } from "./context-menu-items";

// All capabilities present, so visibility tests aren't muddied by disable rules.
const allOn = {
  hasClipboard: true,
  isElectron: true,
  hasActiveDraft: true,
  fsWriteAvailable: true,
};

function ids(target: { kind: "blank" | "dir" | "file"; path?: string }) {
  return deriveContextMenuItems({ target, ...allOn }).map((item) => item.id);
}

describe("deriveContextMenuItems — visible item sets per sFT8", () => {
  it("blank menu (A) lists new-file/new-folder/paste/reveal/find/copy-path/copy-relative", () => {
    expect(ids({ kind: "blank" })).toEqual([
      "new-file",
      "new-folder",
      "paste",
      "reveal-in-finder",
      "find-in-files",
      "copy-path",
      "copy-relative-path",
    ]);
  });

  it("directory menu (B) lists new/paste/cut/copy/rename/reveal/copy-paths/add-to-chat/delete (no find)", () => {
    expect(ids({ kind: "dir", path: "/work/src" })).toEqual([
      "new-file",
      "new-folder",
      "paste",
      "cut",
      "copy",
      "rename",
      "reveal-in-finder",
      "copy-path",
      "copy-relative-path",
      "add-to-chat",
      "delete",
    ]);
  });

  it("file menu (C) lists new-file/cut/copy/rename/reveal/find/copy-paths/add-to-chat/delete (no new-folder, no paste)", () => {
    expect(ids({ kind: "file", path: "/work/a.ts" })).toEqual([
      "new-file",
      "cut",
      "copy",
      "rename",
      "reveal-in-finder",
      "find-in-files",
      "copy-path",
      "copy-relative-path",
      "add-to-chat",
      "delete",
    ]);
  });

  it("strict differences hold: find-in-files only in blank+file, paste only in blank+dir, cut/copy/rename/add-to-chat only in dir+file", () => {
    expect(ids({ kind: "blank" })).toContain("find-in-files");
    expect(ids({ kind: "file", path: "/f" })).toContain("find-in-files");
    expect(ids({ kind: "dir", path: "/d" })).not.toContain("find-in-files");

    expect(ids({ kind: "blank" })).toContain("paste");
    expect(ids({ kind: "dir", path: "/d" })).toContain("paste");
    expect(ids({ kind: "file", path: "/f" })).not.toContain("paste");

    for (const id of ["cut", "copy", "rename", "add-to-chat", "delete"] as const) {
      expect(ids({ kind: "dir", path: "/d" })).toContain(id);
      expect(ids({ kind: "file", path: "/f" })).toContain(id);
      expect(ids({ kind: "blank" })).not.toContain(id);
    }
  });

  it("places delete last (after add-to-chat) in both the dir and file menus", () => {
    for (const target of [
      { kind: "dir" as const, path: "/d" },
      { kind: "file" as const, path: "/f" },
    ]) {
      const list = ids(target);
      expect(list[list.length - 1]).toBe("delete");
      expect(list.indexOf("delete")).toBeGreaterThan(list.indexOf("add-to-chat"));
    }
  });

  it("the blank menu never includes delete", () => {
    expect(ids({ kind: "blank" })).not.toContain("delete");
  });

  it("marks delete destructive in the dir and file menus", () => {
    for (const target of [
      { kind: "dir" as const, path: "/d" },
      { kind: "file" as const, path: "/f" },
    ]) {
      const del = deriveContextMenuItems({ target, ...allOn }).find((item) => item.id === "delete");
      expect(del?.destructive).toBe(true);
    }
  });
});

describe("deriveContextMenuItems — conditional enabling", () => {
  function enabledMap(input: Parameters<typeof deriveContextMenuItems>[0]) {
    return new Map(deriveContextMenuItems(input).map((item) => [item.id, item.enabled]));
  }

  it("disables paste when the clipboard is empty", () => {
    const map = enabledMap({ target: { kind: "dir", path: "/d" }, ...allOn, hasClipboard: false });
    expect(map.get("paste")).toBe(false);
    expect(map.get("cut")).toBe(true);
  });

  it("disables reveal-in-finder when not running in Electron", () => {
    const map = enabledMap({ target: { kind: "file", path: "/f" }, ...allOn, isElectron: false });
    expect(map.get("reveal-in-finder")).toBe(false);
    expect(map.get("copy-path")).toBe(true);
  });

  it("disables add-to-chat when there is no active draft", () => {
    const map = enabledMap({
      target: { kind: "file", path: "/f" },
      ...allOn,
      hasActiveDraft: false,
    });
    expect(map.get("add-to-chat")).toBe(false);
  });

  it("disables every write operation when fsWrite is unavailable", () => {
    const map = enabledMap({
      target: { kind: "dir", path: "/d" },
      ...allOn,
      fsWriteAvailable: false,
    });
    expect(map.get("new-file")).toBe(false);
    expect(map.get("new-folder")).toBe(false);
    expect(map.get("paste")).toBe(false);
    expect(map.get("cut")).toBe(false);
    expect(map.get("copy")).toBe(false);
    expect(map.get("rename")).toBe(false);
    expect(map.get("delete")).toBe(false);
    expect(map.get("copy-path")).toBe(true);
    expect(map.get("copy-relative-path")).toBe(true);
  });

  it("enables delete (a write op) when fsWrite is available", () => {
    const map = enabledMap({ target: { kind: "file", path: "/f" }, ...allOn });
    expect(map.get("delete")).toBe(true);
  });

  it("keeps non-write items enabled independent of fsWrite (copy-path, find-in-files)", () => {
    const map = enabledMap({ target: { kind: "blank" }, ...allOn, fsWriteAvailable: false });
    expect(map.get("find-in-files")).toBe(true);
    expect(map.get("copy-path")).toBe(true);
    expect(map.get("copy-relative-path")).toBe(true);
  });
});

describe("newEntryParentDir", () => {
  test("a directory target hosts the new entry itself", () => {
    expect(newEntryParentDir({ kind: "dir", path: "src/components" })).toBe("src/components");
  });

  test("the blank area lands at the root", () => {
    expect(newEntryParentDir({ kind: "blank" })).toBe(".");
  });

  test("a file target redirects to its parent directory", () => {
    expect(newEntryParentDir({ kind: "file", path: "src/components/button.tsx" })).toBe(
      "src/components",
    );
  });

  test("a file directly under the root collapses to '.'", () => {
    expect(newEntryParentDir({ kind: "file", path: "readme.md" })).toBe(".");
  });
});
