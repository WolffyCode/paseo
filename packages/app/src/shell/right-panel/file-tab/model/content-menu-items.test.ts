import { describe, expect, it } from "vitest";
import { deriveContentMenu } from "./content-menu-items";

// deriveContentMenu is the content-area right-click menu, derived live by content surface (mirroring
// file-tree's deriveContextMenuItems: static ordered table → label + enabled). Three sets: code/text
// editor (9), markdown preview (5), image (4); markdown-in-edit reuses the 9-item editor set. NO
// directory-tree write ops (new/rename/delete/file cut-copy-paste) appear in any set.

const ids = (menu: ReturnType<typeof deriveContentMenu>) => menu.map((item) => item.id);

describe("deriveContentMenu · editor (code/text, md-edit)", () => {
  // Code and text share the 9-item editor menu, in the requirement's order.
  it("gives code and text the same 9-item editor menu", () => {
    const expected = [
      "cut",
      "copy",
      "paste",
      "select-all",
      "find",
      "replace",
      "copy-file-path",
      "locate-in-tree",
      "reveal-in-finder",
    ];
    expect(ids(deriveContentMenu({ kind: "code", mdView: "preview" }))).toEqual(expected);
    expect(ids(deriveContentMenu({ kind: "text", mdView: "preview" }))).toEqual(expected);
  });

  // Markdown in EDIT mode is a text editor, so it gets the 9-item editor menu (not the preview menu).
  it("gives markdown-in-edit the 9-item editor menu", () => {
    expect(deriveContentMenu({ kind: "markdown", mdView: "edit" })).toHaveLength(9);
    expect(ids(deriveContentMenu({ kind: "markdown", mdView: "edit" }))).toContain("find");
  });
});

describe("deriveContentMenu · markdown preview", () => {
  // Markdown preview is read-only rendered content: copy selection + file actions + switch-to-edit (5).
  it("gives markdown preview the 5-item menu", () => {
    expect(ids(deriveContentMenu({ kind: "markdown", mdView: "preview" }))).toEqual([
      "copy-selection",
      "copy-file-path",
      "locate-in-tree",
      "reveal-in-finder",
      "switch-to-edit",
    ]);
  });
});

describe("deriveContentMenu · image", () => {
  // Image viewing: copy image + file actions (4).
  it("gives image the 4-item menu", () => {
    expect(ids(deriveContentMenu({ kind: "image", mdView: "preview" }))).toEqual([
      "copy-image",
      "copy-file-path",
      "locate-in-tree",
      "reveal-in-finder",
    ]);
  });
});

describe("deriveContentMenu · binary read-only", () => {
  // Binary/unrecognized is the read-only fallback — no content actions, so no context menu (the three
  // sets are for editable/viewable content only; there is no fourth set).
  it("gives binary no menu", () => {
    expect(deriveContentMenu({ kind: "binary", mdView: "preview" })).toEqual([]);
  });
});

describe("deriveContentMenu · shape", () => {
  // Every item carries a non-empty label and is enabled (no capability gates on content items this
  // round — the panel is desktop-only, so reveal-in-finder is always available).
  it("labels every item and enables them", () => {
    for (const item of deriveContentMenu({ kind: "code", mdView: "preview" })) {
      expect(item.label.length).toBeGreaterThan(0);
      expect(item.enabled).toBe(true);
    }
  });
});
