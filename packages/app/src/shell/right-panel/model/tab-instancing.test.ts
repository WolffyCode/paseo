import { describe, expect, it } from "vitest";
import type { TabKind } from "./tab-content";
import { resolveTabInstancing } from "./tab-instancing";

// resolveTabInstancing decides focus-existing vs append for an open request. It is the single place
// dedup/single-instance identity is computed. Identity for a file is its PATH ONLY (via sameFilePath) —
// line numbers never enter here, so "open a file at another line" still focuses the one existing tab.

interface Existing {
  id: string;
  kind: TabKind;
  path: string;
}

describe("resolveTabInstancing · file", () => {
  // A file already open is focused, never re-opened — one file, one tab (verify item 17).
  it("focuses the existing tab when the same path is open", () => {
    const existing: Existing[] = [{ id: "t1", kind: "file", path: "src/a.ts" }];
    expect(resolveTabInstancing(existing, { kind: "file", path: "src/a.ts" })).toEqual({
      action: "focus",
      id: "t1",
    });
  });

  // Identity is path-only: a request that differs from the open tab only by spelling (case / slash)
  // still resolves to the same file, so a "jump to another line" reuses the tab (line ignored here).
  it("focuses across case/slash spellings of the same path (line-agnostic identity)", () => {
    const existing: Existing[] = [{ id: "t1", kind: "file", path: "src/App.ts" }];
    expect(resolveTabInstancing(existing, { kind: "file", path: "src\\app.ts" })).toEqual({
      action: "focus",
      id: "t1",
    });
  });

  // A different file has no match and appends a fresh tab.
  it("appends when the path is not open", () => {
    const existing: Existing[] = [{ id: "t1", kind: "file", path: "src/a.ts" }];
    expect(resolveTabInstancing(existing, { kind: "file", path: "src/b.ts" })).toEqual({
      action: "append",
    });
  });

  // Empty workbench: the first open always appends.
  it("appends into an empty tab set", () => {
    expect(resolveTabInstancing([], { kind: "file", path: "src/a.ts" })).toEqual({
      action: "append",
    });
  });

  // The empty "choose a file" tab (path "") is itself a file identity: a second empty open focuses the one
  // empty tab rather than stacking duplicates (defect 1 — at most one empty file tab).
  it("focuses the existing empty 'choose a file' tab (empty path dedups)", () => {
    const existing: Existing[] = [{ id: "empty", kind: "file", path: "" }];
    expect(resolveTabInstancing(existing, { kind: "file", path: "" })).toEqual({
      action: "focus",
      id: "empty",
    });
  });

  // A real file fills the existing empty placeholder's slot instead of appending and leaving the
  // "选择一个文件" tab behind (requirement §3.2). The policy returns the slot; Workbench replaces content.
  it("fills the empty file-tab slot when opening a file that is not already open", () => {
    const existing: Existing[] = [
      { id: "a", kind: "file", path: "src/a.ts" },
      { id: "empty", kind: "file", path: "" },
    ];

    expect(resolveTabInstancing(existing, { kind: "file", path: "src/b.ts" })).toEqual({
      action: "fill",
      index: 1,
    });
  });

  // Existing-file dedup wins over placeholder filling: opening a.ts must focus its current tab, never fill
  // the empty slot with a duplicate a.ts and regress one-file-one-tab identity (verify item 17 / defect 7).
  it("focuses an existing file before considering an empty placeholder", () => {
    const existing: Existing[] = [
      { id: "empty", kind: "file", path: "" },
      { id: "a", kind: "file", path: "src/a.ts" },
    ];

    expect(resolveTabInstancing(existing, { kind: "file", path: "src/a.ts" })).toEqual({
      action: "focus",
      id: "a",
    });
  });
});

describe("resolveTabInstancing · single-instance (review)", () => {
  // review is single-instance: a second open focuses the one existing review tab, ignoring its path.
  it("focuses the existing review tab regardless of path", () => {
    const existing: Existing[] = [{ id: "r1", kind: "review", path: "whatever" }];
    expect(resolveTabInstancing(existing, { kind: "review", path: "other" })).toEqual({
      action: "focus",
      id: "r1",
    });
  });

  // With no review tab open yet, the first open appends.
  it("appends the first review tab", () => {
    const existing: Existing[] = [{ id: "t1", kind: "file", path: "src/a.ts" }];
    expect(resolveTabInstancing(existing, { kind: "review", path: "x" })).toEqual({
      action: "append",
    });
  });
});

describe("resolveTabInstancing · multi-instance", () => {
  it("deduplicates a conversation by its agent or draft identity", () => {
    const existing: Existing[] = [{ id: "c1", kind: "conversation", path: "a" }];
    expect(resolveTabInstancing(existing, { kind: "conversation", path: "a" })).toEqual({
      action: "focus",
      id: "c1",
    });
  });

  it("always appends browser and terminal instances", () => {
    const existing: Existing[] = [{ id: "c1", kind: "conversation", path: "a" }];
    expect(resolveTabInstancing(existing, { kind: "terminal", path: "b" })).toEqual({
      action: "append",
    });
  });
});
