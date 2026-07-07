import { describe, expect, it } from "vitest";
import {
  advanceSearch,
  computeHighlightRanges,
  isSearchAvailable,
  searchErrorCopy,
} from "./search-state";
import type { SearchState } from "./types";

const idle: SearchState = { mode: "name", query: "", results: [], phase: "idle" };

describe("advanceSearch — state machine", () => {
  it("idle → searching when a non-empty query is entered", () => {
    expect(advanceSearch(idle, { type: "query-changed", query: "but" })).toEqual({
      mode: "name",
      query: "but",
      results: [],
      phase: "searching",
    });
  });

  it("searching → results when matches arrive", () => {
    const searching: SearchState = { mode: "name", query: "but", results: [], phase: "searching" };
    const matches = [{ path: "/work/Button.tsx", kind: "file" as const }];
    expect(advanceSearch(searching, { type: "results", matches })).toEqual({
      mode: "name",
      query: "but",
      results: matches,
      phase: "results",
    });
  });

  it("searching → empty when no matches arrive", () => {
    const searching: SearchState = { mode: "name", query: "zzz", results: [], phase: "searching" };
    expect(advanceSearch(searching, { type: "empty" })).toEqual({
      mode: "name",
      query: "zzz",
      results: [],
      phase: "empty",
    });
  });

  it("searching → error(failed) when a search run breaks (default kind)", () => {
    const searching: SearchState = { mode: "content", query: "x", results: [], phase: "searching" };
    expect(advanceSearch(searching, { type: "error" })).toEqual({
      mode: "content",
      query: "x",
      results: [],
      phase: "error",
      errorKind: "failed",
    });
  });

  it("searching → error(unsupported) when the host lacks the capability", () => {
    const searching: SearchState = { mode: "name", query: "x", results: [], phase: "searching" };
    expect(advanceSearch(searching, { type: "error", kind: "unsupported" })).toEqual({
      mode: "name",
      query: "x",
      results: [],
      phase: "error",
      errorKind: "unsupported",
    });
  });

  it("progress batches append while searching and flip the phase to results", () => {
    const searching: SearchState = { mode: "name", query: "a", results: [], phase: "searching" };
    const first = advanceSearch(searching, {
      type: "progress",
      matches: [{ path: "x/a1.ts", kind: "file" }],
    });
    expect(first.phase).toBe("results");
    expect(first.results.map((m) => m.path)).toEqual(["x/a1.ts"]);

    const second = advanceSearch(first, {
      type: "progress",
      matches: [{ path: "y/a2.ts", kind: "file" }],
    });
    expect(second.results.map((m) => m.path)).toEqual(["x/a1.ts", "y/a2.ts"]);
  });

  it("progress is ignored outside searching/results (a late frame cannot resurrect a cleared search)", () => {
    const idleState: SearchState = { mode: "name", query: "", results: [], phase: "idle" };
    expect(
      advanceSearch(idleState, { type: "progress", matches: [{ path: "a.ts", kind: "file" }] }),
    ).toBe(idleState);

    const error: SearchState = {
      mode: "content",
      query: "x",
      results: [],
      phase: "error",
      errorKind: "failed",
    };
    expect(
      advanceSearch(error, { type: "progress", matches: [{ path: "a.ts", kind: "file" }] }),
    ).toBe(error);
  });

  it("the final results event replaces accumulated progress previews with the complete set", () => {
    const partial: SearchState = {
      mode: "content",
      query: "x",
      results: [{ path: "a.ts", kind: "file" }],
      phase: "results",
    };
    const settled = advanceSearch(partial, {
      type: "results",
      matches: [
        { path: "a.ts", kind: "file" },
        { path: "b.ts", kind: "file" },
      ],
    });
    expect(settled.results.map((m) => m.path)).toEqual(["a.ts", "b.ts"]);
  });

  it("any phase → idle (cleared) when the query is emptied", () => {
    const results: SearchState = {
      mode: "name",
      query: "but",
      results: [{ path: "/work/Button.tsx", kind: "file" }],
      phase: "results",
    };
    expect(advanceSearch(results, { type: "query-changed", query: "" })).toEqual({
      mode: "name",
      query: "",
      results: [],
      phase: "idle",
    });
  });

  it("any phase → idle (cleared) on an explicit clear, preserving the mode", () => {
    const error: SearchState = { mode: "content", query: "x", results: [], phase: "error" };
    expect(advanceSearch(error, { type: "clear" })).toEqual({
      mode: "content",
      query: "",
      results: [],
      phase: "idle",
    });
  });

  it("switching mode re-enters searching when a query is present, idle when not", () => {
    const results: SearchState = {
      mode: "name",
      query: "but",
      results: [{ path: "/work/Button.tsx", kind: "file" }],
      phase: "results",
    };
    expect(advanceSearch(results, { type: "mode-changed", mode: "content" })).toEqual({
      mode: "content",
      query: "but",
      results: [],
      phase: "searching",
    });
    expect(advanceSearch(idle, { type: "mode-changed", mode: "content" })).toEqual({
      mode: "content",
      query: "",
      results: [],
      phase: "idle",
    });
  });
});

describe("computeHighlightRanges", () => {
  it("returns the range of a single case-insensitive match", () => {
    expect(computeHighlightRanges("Button.tsx", "but")).toEqual([{ start: 0, end: 3 }]);
  });

  it("returns every non-overlapping match range", () => {
    expect(computeHighlightRanges("abcabc", "bc")).toEqual([
      { start: 1, end: 3 },
      { start: 4, end: 6 },
    ]);
  });

  it("returns no ranges for a blank query or no match", () => {
    expect(computeHighlightRanges("Button.tsx", "")).toEqual([]);
    expect(computeHighlightRanges("Button.tsx", "zzz")).toEqual([]);
  });
});

describe("searchErrorCopy", () => {
  it("a failed run gets the retry copy regardless of mode", () => {
    expect(searchErrorCopy("name", "failed").title).toBe("搜索失败");
    expect(searchErrorCopy("content", "failed").title).toBe("搜索失败");
  });

  it("a missing capability gets the mode-specific upgrade prompt", () => {
    expect(searchErrorCopy("content", "unsupported")).toEqual({
      title: "内容搜索不可用",
      sub: "请升级主机以按内容搜索。",
    });
    expect(searchErrorCopy("name", "unsupported")).toEqual({
      title: "按名搜索不可用",
      sub: "请升级主机以按文件名搜索。",
    });
  });
});

describe("isSearchAvailable", () => {
  it("is true only when the fsSearch capability flag is present (gates BOTH search modes)", () => {
    expect(isSearchAvailable({ fsSearch: true })).toBe(true);
  });

  it("is false when fsSearch is false or absent", () => {
    expect(isSearchAvailable({ fsSearch: false })).toBe(false);
    expect(isSearchAvailable({})).toBe(false);
  });
});
