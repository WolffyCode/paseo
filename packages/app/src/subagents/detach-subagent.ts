import type { TFunction } from "i18next";
import type { Agent } from "@/stores/session-store";
import type { ConfirmDialogInput } from "@/utils/confirm-dialog";
import { resolveRowLabel } from "./track-presentation";

export interface ResolveDetachSubagentDialogInput {
  title: Agent["title"] | null | undefined;
}

export function resolveDetachSubagentDialog(
  t: TFunction,
  input: ResolveDetachSubagentDialogInput,
): ConfirmDialogInput {
  const subagentLabel = resolveRowLabel(input.title);
  // The unnamed variant is a whole sentence so each locale can place and inflect "this subagent".
  const message = subagentLabel
    ? t("subagents.detachDialog.message", { label: subagentLabel })
    : t("subagents.detachDialog.messageUnnamed");

  return {
    title: t("subagents.detachDialog.title"),
    message,
    confirmLabel: t("subagents.detachDialog.confirm"),
    cancelLabel: t("common.actions.cancel"),
    destructive: false,
  };
}

export interface DetachSubagentDeps {
  getSubagent: (subagentId: string) => ResolveDetachSubagentDialogInput | undefined;
  confirm: (input: ConfirmDialogInput) => Promise<boolean>;
  detachAgent: (input: { serverId: string; agentId: string }) => Promise<void>;
  openDetachedAgent: (input: { serverId: string; agentId: string }) => void;
  reportError: (error: unknown) => void;
  t: TFunction;
}

export interface RequestDetachSubagentInput {
  serverId: string;
  subagentId: string;
}

export async function requestDetachSubagent(
  input: RequestDetachSubagentInput,
  deps: DetachSubagentDeps,
): Promise<void> {
  const subagent = deps.getSubagent(input.subagentId);
  const confirmed = await deps.confirm(
    resolveDetachSubagentDialog(deps.t, {
      title: subagent?.title,
    }),
  );
  if (!confirmed) {
    return;
  }
  try {
    await deps.detachAgent({ serverId: input.serverId, agentId: input.subagentId });
    deps.openDetachedAgent({ serverId: input.serverId, agentId: input.subagentId });
  } catch (error) {
    deps.reportError(error);
  }
}
