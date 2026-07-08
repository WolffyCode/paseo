// The file-tab find/replace state machine (mirroring file-tree's advanceSearch: event union → switch →
// new state). It owns the find SESSION content only — query, replace-row expansion, the three option
// toggles, and the editor-reported match counts. Matching / highlighting / scrolling are done by the
// editor (CodeMirror search); the counts flow back in via setMatchCount. The find widget's open/closed
// visibility is a separate FileDocumentModel field, not part of this session state.

export interface FindSessionState {
  query: string;
  replaceExpanded: boolean;
  matchCase: boolean;
  wholeWord: boolean;
  regex: boolean;
  current: number; // 1-based index of the active match, 0 when none
  total: number; // total matches for the current query + options
}

// The empty session the machine starts and closes back to (options are sticky, cleared here as the
// fresh baseline).
export const IDLE_FIND: FindSessionState = {
  query: "",
  replaceExpanded: false,
  matchCase: false,
  wholeWord: false,
  regex: false,
  current: 0,
  total: 0,
};

// The events that drive the machine. open (⌘F) = find mode; openReplace (⌘⌥F) = replace mode; setQuery
// and toggleOption change what is matched; setMatchCount folds in the editor's result; close ends the
// session.
export type FindEvent =
  | { type: "open" }
  | { type: "openReplace" }
  | { type: "setQuery"; query: string }
  | { type: "setMatchCount"; current: number; total: number }
  | { type: "toggleOption"; option: "matchCase" | "wholeWord" | "regex" }
  | { type: "close" };

// Advance the find session. open/openReplace are the symmetric find vs find+replace modes; changing the
// query or an option clears the stale counts until the editor re-reports; close clears the transient
// session but keeps the option toggles sticky (VSCode-like).
export function advanceFind(state: FindSessionState, event: FindEvent): FindSessionState {
  switch (event.type) {
    case "open":
      return { ...state, replaceExpanded: false };
    case "openReplace":
      return { ...state, replaceExpanded: true };
    case "setQuery":
      return { ...state, query: event.query, current: 0, total: 0 };
    case "setMatchCount":
      return { ...state, current: event.current, total: event.total };
    case "toggleOption": {
      const next = { ...state, current: 0, total: 0 };
      next[event.option] = !state[event.option];
      return next;
    }
    case "close":
      return { ...state, query: "", replaceExpanded: false, current: 0, total: 0 };
  }
}
