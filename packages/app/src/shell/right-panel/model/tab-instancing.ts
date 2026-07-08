// The focus-existing vs append decision for an open request — the single place tab identity/dedup is
// computed. A file is identified by PATH ONLY (sameFilePath): opening an already-open file focuses its
// tab, so line numbers (a scroll target the caller applies after) never split one file into two tabs.
// A single-instance kind (review) dedups by kind; every other multi kind always appends.

import { sameFilePath } from "./file-location";
import type { TabKind } from "./tab-content";
import { TAB_KIND_POLICY } from "./tab-kind-policy";

export type TabInstancingResult = { action: "focus"; id: string } | { action: "append" };

// Resolve where an open request lands: focus a matching existing tab, or append a new one. `existing`
// is the current tab identities; `request` is the kind + path being opened (path already normalized by
// the caller). Line numbers are intentionally absent — identity is the path.
export function resolveTabInstancing(
  existing: ReadonlyArray<{ id: string; kind: TabKind; path: string }>,
  request: { kind: TabKind; path: string },
): TabInstancingResult {
  if (request.kind === "file") {
    const match = existing.find(
      (tab) => tab.kind === "file" && sameFilePath(tab.path, request.path),
    );
    return match ? { action: "focus", id: match.id } : { action: "append" };
  }
  if (TAB_KIND_POLICY[request.kind].instancing === "single") {
    const match = existing.find((tab) => tab.kind === request.kind);
    return match ? { action: "focus", id: match.id } : { action: "append" };
  }
  return { action: "append" };
}
