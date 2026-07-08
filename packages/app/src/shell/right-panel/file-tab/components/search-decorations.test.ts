import { SearchQuery } from "@codemirror/search";
import { EditorSelection, EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import { collectSearchMatches } from "./search-decorations";

// collectSearchMatches is the pure core of the file tab's search-match highlighter: given a SearchQuery
// and an EditorState, it lists every match in a range and flags the one on the current selection (the
// "current" match rendered amber). It exists as a pure seam because the built-in CodeMirror highlighter
// only decorates when its own search panel is open — the file tab drives find with its own widget, so it
// needs its own panel-independent highlighter, and this is the part that must be tested without a DOM.

// Build a state whose selection covers [anchor,head) so a match at that range reads as "selected".
function stateWith(doc: string, selection?: { anchor: number; head: number }): EditorState {
  return EditorState.create({
    doc,
    selection: selection ? EditorSelection.single(selection.anchor, selection.head) : undefined,
  });
}

describe("collectSearchMatches", () => {
  // An invalid (blank) query is the "find closed / nothing typed" path — no highlight decorations.
  it("returns no matches for an invalid (empty) query", () => {
    const state = stateWith("vendor vendor");
    const query = new SearchQuery({ search: "" });
    expect(collectSearchMatches(query, state, 0, state.doc.length)).toEqual([]);
  });

  // Every occurrence in range becomes a match at its exact document offsets — this is what lands
  // .cm-searchMatch on the DOM for each hit.
  it("collects every occurrence with its document offsets", () => {
    const state = stateWith("vendor + vendor + vendor");
    const query = new SearchQuery({ search: "vendor" });
    const matches = collectSearchMatches(query, state, 0, state.doc.length);
    expect(matches.map((m) => [m.from, m.to])).toEqual([
      [0, 6],
      [9, 15],
      [18, 24],
    ]);
  });

  // The match coinciding with the current selection is the "current" one (amber emphasis); the rest are
  // not selected (soft-blue). This is the crux of "当前命中额外强调".
  it("flags only the match on the current selection as selected", () => {
    const state = stateWith("vendor + vendor + vendor", { anchor: 9, head: 15 });
    const query = new SearchQuery({ search: "vendor" });
    const matches = collectSearchMatches(query, state, 0, state.doc.length);
    expect(matches.map((m) => m.selected)).toEqual([false, true, false]);
  });

  // Case sensitivity flows through from the query options so the highlight tracks the find toggles.
  it("honors the case-sensitive option", () => {
    const state = stateWith("Vendor vendor");
    const insensitive = new SearchQuery({ search: "vendor" });
    const sensitive = new SearchQuery({ search: "vendor", caseSensitive: true });
    expect(collectSearchMatches(insensitive, state, 0, state.doc.length)).toHaveLength(2);
    expect(collectSearchMatches(sensitive, state, 0, state.doc.length)).toEqual([
      { from: 7, to: 13, selected: false },
    ]);
  });

  // Only matches inside the requested [from,to) window are returned — the highlighter feeds it visible
  // ranges, so a huge document decorates only what is on screen.
  it("restricts matches to the requested range", () => {
    const state = stateWith("vendor + vendor + vendor");
    const query = new SearchQuery({ search: "vendor" });
    expect(collectSearchMatches(query, state, 8, state.doc.length)).toEqual([
      { from: 9, to: 15, selected: false },
      { from: 18, to: 24, selected: false },
    ]);
  });
});
