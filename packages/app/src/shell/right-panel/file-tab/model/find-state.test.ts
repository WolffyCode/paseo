import { describe, expect, it } from "vitest";
import { advanceFind, IDLE_FIND } from "./find-state";

// advanceFind is the file-tab find/replace state machine (mirroring file-tree's advanceSearch shape:
// event union → switch → new state). It owns the session content — query, replace-row expansion,
// case/word/regex toggles, and the editor-reported match counts. Matching/highlight/scroll are done by
// the editor; counts flow back in via setMatchCount.

describe("advanceFind · open modes", () => {
  // ⌘F (open) is find-only: it collapses the replace row. ⌘⌥F (openReplace) expands it. The two are the
  // symmetric find vs find+replace modes of the widget.
  it("open collapses replace; openReplace expands it", () => {
    const expanded = { ...IDLE_FIND, replaceExpanded: true };
    expect(advanceFind(expanded, { type: "open" }).replaceExpanded).toBe(false);
    expect(advanceFind(IDLE_FIND, { type: "openReplace" }).replaceExpanded).toBe(true);
  });
});

describe("advanceFind · query + counts", () => {
  // Setting a new query clears the stale counts until the editor re-reports (matches will differ).
  it("setQuery updates the query and clears counts", () => {
    const withCounts = { ...IDLE_FIND, current: 2, total: 5 };
    const next = advanceFind(withCounts, { type: "setQuery", query: "foo" });
    expect(next.query).toBe("foo");
    expect(next.current).toBe(0);
    expect(next.total).toBe(0);
  });

  // The editor reports the match count for the current query/options; the state reflects it verbatim.
  it("setMatchCount reflects the editor's reported counts", () => {
    const next = advanceFind(
      { ...IDLE_FIND, query: "foo" },
      { type: "setMatchCount", current: 3, total: 7 },
    );
    expect(next.current).toBe(3);
    expect(next.total).toBe(7);
  });
});

describe("advanceFind · option toggles", () => {
  // Each of the three options flips independently, and toggling clears counts (the match set changes).
  it("toggles matchCase / wholeWord / regex and clears counts", () => {
    let state = { ...IDLE_FIND, current: 1, total: 4 };
    state = advanceFind(state, { type: "toggleOption", option: "matchCase" });
    expect(state.matchCase).toBe(true);
    expect(state.total).toBe(0);
    state = advanceFind(state, { type: "toggleOption", option: "wholeWord" });
    expect(state.wholeWord).toBe(true);
    state = advanceFind(state, { type: "toggleOption", option: "regex" });
    expect(state.regex).toBe(true);
    state = advanceFind(state, { type: "toggleOption", option: "matchCase" });
    expect(state.matchCase).toBe(false);
  });
});

describe("advanceFind · close", () => {
  // Closing clears the transient session (query/counts/replace row) but keeps the option toggles sticky
  // (VSCode-like), so the next find keeps your case/word/regex preferences.
  it("clears query/counts/replace but keeps sticky options", () => {
    const active = {
      query: "foo",
      replaceExpanded: true,
      matchCase: true,
      wholeWord: false,
      regex: true,
      current: 2,
      total: 9,
    };
    const closed = advanceFind(active, { type: "close" });
    expect(closed.query).toBe("");
    expect(closed.replaceExpanded).toBe(false);
    expect(closed.current).toBe(0);
    expect(closed.total).toBe(0);
    expect(closed.matchCase).toBe(true);
    expect(closed.regex).toBe(true);
  });
});

describe("advanceFind · full session flow", () => {
  // The end-to-end flow the requirement describes: 查找 → 展开替换 → toggle options → 计数 → 关闭.
  it("drives find → expand replace → options → count → close", () => {
    let state = advanceFind(IDLE_FIND, { type: "open" });
    expect(state.replaceExpanded).toBe(false);
    state = advanceFind(state, { type: "setQuery", query: "todo" });
    state = advanceFind(state, { type: "openReplace" });
    expect(state.replaceExpanded).toBe(true);
    state = advanceFind(state, { type: "toggleOption", option: "regex" });
    state = advanceFind(state, { type: "setMatchCount", current: 1, total: 3 });
    expect(state.current).toBe(1);
    expect(state.total).toBe(3);
    state = advanceFind(state, { type: "close" });
    expect(state.query).toBe("");
    expect(state.regex).toBe(true);
  });
});
