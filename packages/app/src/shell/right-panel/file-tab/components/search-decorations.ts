import type { SearchQuery } from "@codemirror/search";
import type { EditorState } from "@codemirror/state";

// The pure match-collection behind the file tab's search-match highlighter. CodeMirror's own search
// highlighter only paints matches while ITS built-in search panel is open (it early-returns on
// `!panel`); the file tab drives find with its own FindWidget and never opens that panel, so matches
// were never decorated. This module lets the surface run a panel-independent highlighter, and keeps the
// match logic testable without a live EditorView / DOM (the ViewPlugin that consumes it is pure glue).

// One highlighted match: its document offsets + whether it is the "current" hit (the one on the
// selection), which the surface renders with the amber `-selected` class vs. soft-blue for the rest.
export interface SearchMatch {
  from: number;
  to: number;
  selected: boolean;
}

// Collect every match of `query` within [from, to) of `state`, flagging the one that coincides with the
// current selection. Empty for an invalid query (blank search / bad regex) — which is also the "find
// closed" path, since the surface sets the query to "" when find is not open.
export function collectSearchMatches(
  query: SearchQuery,
  state: EditorState,
  from: number,
  to: number,
): SearchMatch[] {
  if (!query.valid) {
    return [];
  }
  const matches: SearchMatch[] = [];
  const cursor = query.getCursor(state, from, to);
  for (let next = cursor.next(); !next.done; next = cursor.next()) {
    const match = next.value;
    const selected = state.selection.ranges.some(
      (range) => range.from === match.from && range.to === match.to,
    );
    matches.push({ from: match.from, to: match.to, selected });
  }
  return matches;
}
