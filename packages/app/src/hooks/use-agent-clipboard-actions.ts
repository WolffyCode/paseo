import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { AgentStoragePaths } from "@getpaseo/client/internal/daemon-client";
import { useToast } from "@/contexts/toast-context";
import { useSessionStore, type Agent } from "@/stores/session-store";
import { copyToClipboard } from "@/utils/copy-to-clipboard";
import { buildProviderCommand } from "@/utils/provider-command-templates";

export interface AgentClipboardActions {
  copyAgentId: (agentId: string) => Promise<void>;
  /** The provider's own session id — the one its CLI resumes, not Paseo's agent id. */
  copySessionId: (agentId: string) => Promise<void>;
  copyResumeCommand: (agentId: string) => Promise<void>;
  /** The provider's own session file on the host, e.g. Claude's jsonl or Codex's rollout. */
  copySessionFilePath: (agentId: string) => Promise<void>;
  /** The file where Paseo's daemon keeps its own record of the agent. */
  copyAgentRecordPath: (agentId: string) => Promise<void>;
}

function resolveProviderSessionId(agent: Agent | null): string | null {
  return agent?.runtimeInfo?.sessionId ?? agent?.persistence?.sessionId ?? null;
}

/** Copies an agent's identifiers, toasting what was copied or why it could not be. */
export function useAgentClipboardActions(serverId: string): AgentClipboardActions {
  const { t } = useTranslation();
  const toast = useToast();
  const client = useSessionStore((state) => state.sessions[serverId]?.client ?? null);

  const copyWithToast = useCallback(
    async (text: string, copiedLabel: string) => {
      try {
        await copyToClipboard(text);
        toast.copied(copiedLabel);
      } catch {
        toast.error(t("workspace.tabs.toasts.copyFailed"));
      }
    },
    [t, toast],
  );

  // Read at press time rather than subscribed: the menu must not re-render on every agent update.
  const readAgent = useCallback(
    (agentId: string): Agent | null =>
      useSessionStore.getState().sessions[serverId]?.agents?.get(agentId) ?? null,
    [serverId],
  );

  const copyAgentId = useCallback(
    async (agentId: string) => {
      if (!agentId) return;
      await copyWithToast(agentId, t("workspace.tabs.toasts.agentIdCopiedLabel"));
    },
    [copyWithToast, t],
  );

  const copySessionId = useCallback(
    async (agentId: string) => {
      const sessionId = resolveProviderSessionId(readAgent(agentId));
      if (!sessionId) {
        toast.error(t("workspace.tabs.toasts.sessionIdUnavailable"));
        return;
      }
      await copyWithToast(sessionId, t("workspace.tabs.toasts.sessionIdCopiedLabel"));
    },
    [copyWithToast, readAgent, t, toast],
  );

  const copyResumeCommand = useCallback(
    async (agentId: string) => {
      const agent = readAgent(agentId);
      const sessionId = resolveProviderSessionId(agent);
      if (!agent || !sessionId) {
        toast.error(t("workspace.tabs.toasts.sessionIdUnavailable"));
        return;
      }
      const command = buildProviderCommand({ provider: agent.provider, id: "resume", sessionId });
      if (!command) {
        toast.error(t("workspace.tabs.toasts.resumeCommandUnavailable"));
        return;
      }
      await copyWithToast(command, t("workspace.tabs.toasts.resumeCommandCopiedLabel"));
    },
    [copyWithToast, readAgent, t, toast],
  );

  // Asked at press time: the paths live on the host and the provider's file can appear later.
  const fetchStoragePaths = useCallback(
    async (agentId: string): Promise<AgentStoragePaths | null> => {
      if (!client) {
        toast.error(t("workspace.terminal.hostDisconnected"));
        return null;
      }
      try {
        return await client.fetchAgentStoragePaths(agentId);
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : t("workspace.tabs.toasts.storagePathsFailed"),
        );
        return null;
      }
    },
    [client, t, toast],
  );

  const copySessionFilePath = useCallback(
    async (agentId: string) => {
      const paths = await fetchStoragePaths(agentId);
      if (!paths) return;
      if (!paths.providerSessionPath) {
        toast.error(t("workspace.tabs.toasts.sessionFileUnavailable"));
        return;
      }
      await copyWithToast(
        paths.providerSessionPath,
        t("workspace.tabs.toasts.sessionFilePathCopiedLabel"),
      );
    },
    [copyWithToast, fetchStoragePaths, t, toast],
  );

  const copyAgentRecordPath = useCallback(
    async (agentId: string) => {
      const paths = await fetchStoragePaths(agentId);
      if (!paths) return;
      if (!paths.recordPath) {
        toast.error(t("workspace.tabs.toasts.agentRecordUnavailable"));
        return;
      }
      await copyWithToast(paths.recordPath, t("workspace.tabs.toasts.agentRecordPathCopiedLabel"));
    },
    [copyWithToast, fetchStoragePaths, t, toast],
  );

  return useMemo(
    () => ({
      copyAgentId,
      copySessionId,
      copyResumeCommand,
      copySessionFilePath,
      copyAgentRecordPath,
    }),
    [copyAgentId, copyAgentRecordPath, copyResumeCommand, copySessionFilePath, copySessionId],
  );
}
