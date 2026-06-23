export function projectDisplayNameFromProjectId(projectId: string): string {
  const githubRemotePrefix = "remote:github.com/";
  if (projectId.startsWith(githubRemotePrefix)) {
    return projectId.slice(githubRemotePrefix.length) || projectId;
  }

  const segments = projectId.split(/[\\/]/).filter(Boolean);
  return segments[segments.length - 1] || projectId;
}

/** Last non-empty path segment of a working directory (handles `/` and `\`). */
function basenameFromWorkingDir(workingDir: string): string {
  const segments = workingDir.split(/[\\/]/).filter(Boolean);
  return segments[segments.length - 1] ?? "";
}

/**
 * Codex-style project-tree name. The default is the physical directory basename;
 * a user-set custom name overrides it. Falls back to the project-id label when the
 * working directory is empty.
 */
export function resolveProjectTreeName(input: {
  customName?: string | null;
  workingDir: string;
  projectId: string;
}): string {
  const trimmedCustom = input.customName?.trim() ?? "";
  if (trimmedCustom.length > 0) {
    return trimmedCustom;
  }
  const basename = basenameFromWorkingDir(input.workingDir).trim();
  if (basename.length > 0) {
    return basename;
  }
  return projectDisplayNameFromProjectId(input.projectId);
}

export function projectIconPlaceholderLabelFromDisplayName(displayName: string): string {
  const trimmedDisplayName = displayName.trim();
  if (!trimmedDisplayName) {
    return "";
  }

  const segments = trimmedDisplayName.split("/").filter(Boolean);
  return segments[segments.length - 1] || trimmedDisplayName;
}
