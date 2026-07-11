/** Normalize an optional protocol workspace id into the tree's nullable identity axis. */
export function normalizeWorkspaceId(value: string | null | undefined): string | null {
  const normalized = value?.trim() ?? "";
  return normalized.length > 0 ? normalized : null;
}
