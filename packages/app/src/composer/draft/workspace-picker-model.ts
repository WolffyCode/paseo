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
