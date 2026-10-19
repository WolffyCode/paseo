import type { TFunction } from "i18next";
import type { Agent } from "@/stores/session-store";
import type { ConfirmDialogInput } from "@/utils/confirm-dialog";
import { resolveRowLabel } from "./track-presentation";

export interface ResolveArchiveSubagentDialogInput {
  title: Agent["title"] | null | undefined;
  status: Agent["status"] | null | undefined;
}

export function resolveArchiveSubagentDialog(
  t: TFunction,
  input: ResolveArchiveSubagentDialogInput,
): ConfirmDialogInput {
  const isRunning = input.status === "running";
  const subagentLabel = resolveRowLabel(input.title);

  return {
    title: isRunning
      ? t("subagents.archiveDialog.runningTitle")
      : t("subagents.archiveDialog.title"),
    message: resolveArchiveSubagentMessage(t, { isRunning, subagentLabel }),
    confirmLabel: t("subagents.archiveDialog.confirm"),
    cancelLabel: t("common.actions.cancel"),
    destructive: true,
  };
}

// The unnamed variants are whole sentences so each locale can place and inflect "this subagent".
function resolveArchiveSubagentMessage(
  t: TFunction,
  input: { isRunning: boolean; subagentLabel: string | null },
): string {
  const { isRunning, subagentLabel } = input;
  if (isRunning && subagentLabel) {
    return t("subagents.archiveDialog.runningMessage", { label: subagentLabel });
  }
  if (isRunning) {
    return t("subagents.archiveDialog.runningMessageUnnamed");
  }
  if (subagentLabel) {
    return t("subagents.archiveDialog.message", { label: subagentLabel });
  }
  return t("subagents.archiveDialog.messageUnnamed");
}

export interface ArchiveSubagentDeps {
  getSubagent: (subagentId: string) => ResolveArchiveSubagentDialogInput | undefined;
  confirm: (input: ConfirmDialogInput) => Promise<boolean>;
  archiveAgent: (input: { serverId: string; agentId: string }) => Promise<void>;
  reportError: (error: unknown) => void;
  t: TFunction;
}

export interface RequestArchiveSubagentInput {
  serverId: string;
  subagentId: string;
}

export async function requestArchiveSubagent(
  input: RequestArchiveSubagentInput,
  deps: ArchiveSubagentDeps,
): Promise<void> {
  const subagent = deps.getSubagent(input.subagentId);
  const confirmed = await deps.confirm(
    resolveArchiveSubagentDialog(deps.t, {
      title: subagent?.title,
      status: subagent?.status,
    }),
  );
  if (!confirmed) {
    return;
  }
  try {
    await deps.archiveAgent({ serverId: input.serverId, agentId: input.subagentId });
  } catch (error) {
    deps.reportError(error);
  }
}
