// Decide how the tree should locate a file the right-side file tab switched to, by the file's relation
// to the current tree root (requirement §3.2 / item 23 — three pinned branches). Pure + testable so the
// branch rule is verifiable without a store or rendering, mirroring resolve-root.ts's decision style:
//   • deeper descendant (under root, parent ≠ root) → "reveal"  keep root, expand ancestors + scroll + select
//   • direct child (its directory is exactly root)  → "select"  keep root & expansion, just select
//   • out of bounds (null root / not a descendant)  → "reroot"  re-root at the file's directory + select
// Comparison is normalized (separators unified, trailing separator dropped) and case-insensitive for
// windows-style hosts (drive-letter / UNC) while staying case-sensitive on posix — matching how each OS
// resolves path identity. Self-contained (no old-app import).

export type RevealAction = "reveal" | "select" | "reroot";

// Classify the target file against the current root into one of the three reveal branches.
export function resolveRevealAction(input: { targetAbsPath: string; currentRoot: string | null }): {
  action: RevealAction;
} {
  if (input.currentRoot === null) {
    return { action: "reroot" };
  }
  const rootKey = comparisonKey(input.currentRoot);
  if (!rootKey) {
    // A blank/degenerate root (e.g. filesystem "/" once the trailing separator is stripped) can't scope
    // a file — the only deterministic outcome is to re-root at the file's own directory.
    return { action: "reroot" };
  }
  const targetKey = comparisonKey(input.targetAbsPath);
  if (!targetKey.startsWith(`${rootKey}/`)) {
    // Not a descendant: out of bounds, a same-prefix sibling (".../project-2"), or the root itself.
    return { action: "reroot" };
  }
  const relative = targetKey.slice(rootKey.length + 1);
  return { action: relative.includes("/") ? "reveal" : "select" };
}

// A normalized key for structural path comparison: unify separators to "/", drop the trailing separator,
// and case-fold windows-style paths (drive-letter/UNC hosts compare case-insensitively; posix does not).
function comparisonKey(path: string): string {
  const unified = path.trim().replace(/\\/g, "/").replace(/\/+$/, "");
  return isWindowsStyle(path) ? unified.toLowerCase() : unified;
}

// Whether a path is a windows-style host path (drive letter "C:\"/"C:/" or UNC "\\server"), which are
// case-insensitive — posix paths are not, so only these fold case in comparisonKey.
function isWindowsStyle(path: string): boolean {
  const trimmed = path.trim();
  return /^[A-Za-z]:[\\/]/.test(trimmed) || trimmed.startsWith("\\\\");
}
