// The focus-existing vs fill-placeholder vs append decision for an open request — the single place tab
// identity/dedup is computed. A file is identified by PATH ONLY (sameFilePath): an existing file focuses
// first; otherwise a real file fills an empty file-tab slot before appending. A single-instance kind
// (review) dedups by kind; every other multi kind always appends.

import { sameFilePath } from "./file-location";
import type { TabKind } from "./tab-content";
import { TAB_KIND_POLICY } from "./tab-kind-policy";

export type TabInstancingResult =
  | { action: "focus"; id: string }
  | { action: "fill"; index: number }
  | { action: "append" };

// Resolve where an open request lands: focus a matching identity, fill an empty file placeholder, or
// append. `request.path` is already normalized by the caller; line numbers are absent by design.
export function resolveTabInstancing(
  existing: ReadonlyArray<{ id: string; kind: TabKind; path: string }>,
  request: { kind: TabKind; path: string },
): TabInstancingResult {
  if (request.kind === "file") {
    const match = existing.find(
      (tab) => tab.kind === "file" && sameFilePath(tab.path, request.path),
    );
    if (match) {
      return { action: "focus", id: match.id };
    }
    if (request.path) {
      const emptyIndex = existing.findIndex((tab) => tab.kind === "file" && !tab.path);
      if (emptyIndex !== -1) {
        return { action: "fill", index: emptyIndex };
      }
    }
    return { action: "append" };
  }
  if (TAB_KIND_POLICY[request.kind].instancing === "single") {
    const match = existing.find((tab) => tab.kind === request.kind);
    return match ? { action: "focus", id: match.id } : { action: "append" };
  }
  return { action: "append" };
}
