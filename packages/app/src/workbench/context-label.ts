import type { TFunction } from "i18next";
import type { WorkspaceDescriptor } from "@/stores/session-store";

/** A chat's backing project is private plumbing, so the conversation names the context instead. */
export function workspaceContextLabel(
  workspace: WorkspaceDescriptor | null,
  t: TFunction,
): string | undefined {
  if (workspace?.purpose === "chat") return t("workbench.context.independentChat");
  return workspace?.projectDisplayName;
}
