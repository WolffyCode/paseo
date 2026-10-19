import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "@/contexts/toast-context";
import { useSessionStore } from "@/stores/session-store";
import { confirmDialog } from "@/utils/confirm-dialog";
import { toErrorMessage } from "@/utils/error-messages";
import { navigateToAgent } from "@/utils/navigate-to-agent";
import { requestDetachSubagent, type ResolveDetachSubagentDialogInput } from "./detach-subagent";

export { resolveDetachSubagentDialog, requestDetachSubagent } from "./detach-subagent";
export type {
  DetachSubagentDeps,
  RequestDetachSubagentInput,
  ResolveDetachSubagentDialogInput,
} from "./detach-subagent";

export interface UseDetachSubagentInput {
  serverId: string;
}

export function useDetachSubagent(input: UseDetachSubagentInput): (subagentId: string) => void {
  const { serverId } = input;
  const toast = useToast();
  const { t } = useTranslation();

  return useCallback(
    (subagentId: string) => {
      void requestDetachSubagent(
        { serverId, subagentId },
        {
          getSubagent: (id): ResolveDetachSubagentDialogInput | undefined =>
            useSessionStore.getState().sessions[serverId]?.agents?.get(id),
          confirm: confirmDialog,
          detachAgent: async ({ serverId: targetServerId, agentId }) => {
            const client = useSessionStore.getState().sessions[targetServerId]?.client;
            if (!client) {
              throw new Error(t("workspaceSetup.errors.hostDisconnected"));
            }
            await client.detachAgent(agentId);
          },
          openDetachedAgent: ({ serverId: targetServerId, agentId }) => {
            navigateToAgent({ serverId: targetServerId, agentId });
          },
          reportError: (error) => {
            toast.error(toErrorMessage(error));
          },
          t,
        },
      );
    },
    [serverId, t, toast],
  );
}
