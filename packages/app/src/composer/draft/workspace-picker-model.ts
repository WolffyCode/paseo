/** Derive the compact project label shown beside a selected host directory. */
export function draftWorkspaceDirectoryName(path: string): string {
  const trimmed = path.trim();
  const parts = trimmed.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? trimmed;
}

/** Use the operating-system picker only when the selected host is local and Electron can return an absolute path. */
export function shouldUseNativeDirectoryPicker(input: {
  readonly isLocalDaemon: boolean;
  readonly isElectron: boolean;
}): boolean {
  return input.isLocalDaemon && input.isElectron;
}

/** Keep the filesystem browser path root-relative and stable across host path separators. */
export function normalizeFilesystemBrowserPath(path: string): string {
  const normalized = path
    .trim()
    .replace(/\\/g, "/")
    .replace(/\/{2,}/g, "/");
  return normalized.replace(/^\.\//, "") || ".";
}

/** Return the parent path for the filesystem browser, or null when already at its root. */
export function resolveFilesystemParent(path: string): string | null {
  const normalized = normalizeFilesystemBrowserPath(path);
  if (normalized === ".") return null;
  const separator = normalized.lastIndexOf("/");
  return separator < 0 ? "." : normalized.slice(0, separator) || ".";
}
