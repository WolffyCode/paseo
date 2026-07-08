// Path normalization for the file tree, self-contained (standards §8): rewritten from the legacy
// explorer-paths/path helpers so the new directory carries no old import. Both the absolute-path
// predicate and the join logic live here; relative paths are computed against the current tree root.

/** True when the value is an absolute path (posix root, UNC share, or windows drive). */
export function isAbsolutePath(value: string): boolean {
  return value.startsWith("/") || value.startsWith("\\\\") || /^[A-Za-z]:[\\/]/.test(value);
}

/** Build an absolute path for a tree entry under the given root; absolute entries pass through. */
export function buildAbsoluteTreePath(input: { treeRoot: string; entryPath: string }): string {
  const normalizedRoot = input.treeRoot.trim().replace(/[\\/]+$/, "");
  const normalizedEntry = input.entryPath.trim();

  if (!normalizedRoot) {
    return normalizedEntry;
  }
  if (!normalizedEntry || normalizedEntry === ".") {
    return normalizedRoot;
  }
  if (isAbsolutePath(normalizedEntry)) {
    return normalizedEntry;
  }

  const separator = normalizedRoot.includes("\\") ? "\\" : "/";
  const segments = normalizedEntry.split(/[\\/]+/).filter(Boolean);
  if (segments.length === 0) {
    return normalizedRoot;
  }
  return `${normalizedRoot}${separator}${segments.join(separator)}`;
}

/** Express an absolute path relative to the tree root; paths outside the root pass through. */
export function relativeToTreeRoot(input: { treeRoot: string; absolutePath: string }): string {
  const normalizedRoot = input.treeRoot.trim().replace(/[\\/]+$/, "");
  const normalizedAbsolute = input.absolutePath.trim().replace(/[\\/]+$/, "");

  if (!normalizedRoot || normalizedAbsolute === normalizedRoot) {
    return ".";
  }

  const separator = normalizedRoot.includes("\\") ? "\\" : "/";
  const prefix = `${normalizedRoot}${separator}`;
  if (normalizedAbsolute.startsWith(prefix)) {
    return normalizedAbsolute.slice(prefix.length);
  }
  return input.absolutePath;
}

/** The directory containing a path: everything before its last segment, trailing separator removed
 *  (posix "/x" → "/"). Used by the reveal linkage to re-root at an out-of-bounds file's own directory. */
export function parentDirectory(path: string): string {
  const trimmed = path.trim().replace(/[\\/]+$/, "");
  const index = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
  if (index < 0) {
    return trimmed;
  }
  return index === 0 ? trimmed.slice(0, 1) : trimmed.slice(0, index);
}

/** The display name of a path: its last non-empty segment (either separator style). */
export function lastSegment(path: string): string {
  const parts = path.split(/[\\/]+/).filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

/** The display prefix before a path's last segment, separator included ("" at the top level). */
export function parentDirPrefix(path: string): string {
  const index = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return index <= 0 ? "" : path.slice(0, index + 1);
}
