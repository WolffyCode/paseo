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

/**
 * Recover the *raw* user-set custom name from the server's resolved `projectDisplayName`.
 *
 * The daemon resolves `projectDisplayName = customName ?? autoSlug(projectId)` (workspace-registry
 * `resolveProjectDisplayName`). The client only receives that resolved value, so on its own it can't
 * tell a real rename from the auto github "Org/repo" slug. We recover it: when the display name equals
 * the slug derived from the project id, the user never renamed it → return null so callers fall back
 * to the local directory basename (反馈: 目录名默认用本地物理目录名, 不是 github slug)。A genuine
 * rename (display name ≠ slug) is returned as-is so it still wins over the basename.
 */
export function rawProjectCustomName(
  projectDisplayName: string | null | undefined,
  projectId: string,
): string | null {
  const trimmed = projectDisplayName?.trim() ?? "";
  if (trimmed.length === 0) {
    return null;
  }
  return trimmed === projectDisplayNameFromProjectId(projectId) ? null : trimmed;
}

export function projectIconPlaceholderLabelFromDisplayName(displayName: string): string {
  const trimmedDisplayName = displayName.trim();
  if (!trimmedDisplayName) {
    return "";
  }

  const segments = trimmedDisplayName.split("/").filter(Boolean);
  return segments[segments.length - 1] || trimmedDisplayName;
}
