// Search pure functions (standards §8.5): the search state machine, highlight-range computation,
// and the search capability gate. All pure so the store can drive search by feeding events through
// advanceSearch and rendering the resulting phase. Both name and content mode search on the HOST
// (fs.search RPC) so results cover the whole tree root, not just already-listed layers.

import type { SearchErrorKind, SearchMatch, SearchState } from "./types";

/** Events that drive the search state machine. */
export type SearchEvent =
  | { type: "query-changed"; query: string }
  | { type: "mode-changed"; mode: "name" | "content" }
  | { type: "progress"; matches: ReadonlyArray<SearchMatch> }
  | { type: "results"; matches: ReadonlyArray<SearchMatch> }
  | { type: "empty" }
  | { type: "error"; kind?: SearchErrorKind }
  | { type: "clear" };

/** Advance search: query/mode changes (re)enter searching or reset to idle; outcomes settle phase. */
export function advanceSearch(current: SearchState, event: SearchEvent): SearchState {
  switch (event.type) {
    case "query-changed": {
      const query = event.query;
      if (!query.trim()) {
        return { mode: current.mode, query: "", results: [], phase: "idle" };
      }
      return { mode: current.mode, query, results: [], phase: "searching" };
    }
    case "mode-changed": {
      const phase = current.query.trim() ? "searching" : "idle";
      return { mode: event.mode, query: current.query, results: [], phase };
    }
    case "progress":
      // Streamed preview batches from a progressive host search: append while the scan runs.
      // Ignored outside searching/results so a late frame can't resurrect a cleared or errored
      // search. The final results/empty event replaces the accumulated set with the complete truth.
      if (current.phase !== "searching" && current.phase !== "results") {
        return current;
      }
      return {
        mode: current.mode,
        query: current.query,
        results: [...current.results, ...event.matches],
        phase: "results",
      };
    case "results":
      return { mode: current.mode, query: current.query, results: event.matches, phase: "results" };
    case "empty":
      return { mode: current.mode, query: current.query, results: [], phase: "empty" };
    case "error":
      // "unsupported" = the host lacks fsSearch (upgrade prompt); "failed" = the RPC ran and broke
      // (retry prompt). Defaulting to "failed" keeps plain error events meaning "this run failed".
      return {
        mode: current.mode,
        query: current.query,
        results: [],
        phase: "error",
        errorKind: event.kind ?? "failed",
      };
    case "clear":
      return { mode: current.mode, query: "", results: [], phase: "idle" };
  }
}

/** All non-overlapping case-insensitive match ranges of query within text, for highlight rendering. */
export function computeHighlightRanges(
  text: string,
  query: string,
): Array<{ start: number; end: number }> {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return [];
  }
  const haystack = text.toLowerCase();
  const ranges: Array<{ start: number; end: number }> = [];
  let from = 0;
  while (true) {
    const index = haystack.indexOf(needle, from);
    if (index === -1) {
      break;
    }
    ranges.push({ start: index, end: index + needle.length });
    from = index + needle.length;
  }
  return ranges;
}

/**
 * Search (name AND content mode) is available only when the host advertises the fsSearch
 * capability — both modes run on the host so they cover the whole tree root. No degraded
 * client-side fallback on old daemons (feature contract): the UI shows the upgrade prompt.
 */
export function isSearchAvailable(features: { fsSearch?: boolean }): boolean {
  return features.fsSearch === true;
}

/**
 * The title/subtitle copy for the search error state, by cause and mode: "unsupported" = the host
 * lacks fsSearch (upgrade prompt, per mode); "failed" = this run broke (retry prompt). Pure copy
 * decision, extracted from the view so the branch is unit-tested.
 */
export function searchErrorCopy(
  mode: "name" | "content",
  kind: SearchErrorKind,
): { title: string; sub: string } {
  if (kind === "failed") {
    return { title: "搜索失败", sub: "请重试，或换个关键字缩小范围。" };
  }
  if (mode === "content") {
    return { title: "内容搜索不可用", sub: "请升级主机以按内容搜索。" };
  }
  return { title: "按名搜索不可用", sub: "请升级主机以按文件名搜索。" };
}
