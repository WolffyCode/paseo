import { i18n } from "@/i18n/i18next";
import { normalizeWorkspacePath } from "@/utils/workspace-identity";

export function resolveWorkspaceDirectory(input: {
  workspaceDirectory: string | null | undefined;
}): string | null {
  return normalizeWorkspacePath(input.workspaceDirectory);
}

export function requireWorkspaceDirectory(input: {
  workspaceId?: string;
  workspaceDirectory: string | null | undefined;
}): string {
  const workspaceDirectory = resolveWorkspaceDirectory({
    workspaceDirectory: input.workspaceDirectory,
  });
  if (!workspaceDirectory) {
    throw new Error(
      input.workspaceId
        ? i18n.t("workspace.directory.missingFor", { workspaceId: input.workspaceId })
        : i18n.t("workspace.directory.missing"),
    );
  }
  return workspaceDirectory;
}
