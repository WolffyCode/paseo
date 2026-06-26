import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import * as Clipboard from "expo-clipboard";
import { getIsElectron } from "@/constants/platform";
import { useToast } from "@/contexts/toast-context";
import { getDesktopHost } from "@/desktop/host";
import { getHostRuntimeStore } from "@/runtime/host-runtime";
import { useSessionStore } from "@/stores/session-store";
import { useSidebarPinsStore } from "@/stores/sidebar-pins-store";
import {
  hasDesktopOpenTargetsBridge,
  listDesktopOpenTargets,
  openDesktopTarget,
} from "@/workspace/desktop-open-targets";

export interface ConversationRowActionsInput {
  serverId: string;
  /** Root/child agent id of the conversation (always present — used for "复制会话 ID"). */
  agentId: string;
  /** Conversation's workspace; null for a subagent without its own workspace (pin/rename gated off). */
  workspaceId: string | null;
}

export interface ConversationRowActions {
  /** Pin/rename/reveal/open-window all need a workspace; false → those items hide. */
  hasWorkspace: boolean;
  isPinned: boolean;
  onTogglePin: () => void;
  isRenameOpen: boolean;
  onOpenRename: () => void;
  onCloseRename: () => void;
  onSubmitRename: (value: string) => Promise<void>;
  /** Reveal-in-Finder is desktop-only (file-manager bridge) + needs a real working dir. */
  canReveal: boolean;
  onReveal: () => void;
  onCopyConversationId: () => void;
  /** Open-in-new-window is Electron-only + needs a working dir. */
  canOpenInNewWindow: boolean;
  onOpenInNewWindow: () => void;
}

/**
 * Model for the conversation (对话) row's right-click menu — every action's state + handler lives
 * here so the row only renders + dispatches (UI/model separation; 反馈: 对话右键对照 Codex #45). The
 * placeholder items (复制工作目录 / 复制深度链接 / 派生到本地·新工作树 / 归档 / 标记为未读) are rendered
 * disabled by the menu and intentionally have no handler here — semantics are still TBD per 董事长.
 */
export function useConversationRowActions(
  input: ConversationRowActionsInput,
): ConversationRowActions {
  const { serverId, agentId, workspaceId } = input;
  const { t } = useTranslation();
  const toast = useToast();
  const hasWorkspace = workspaceId !== null && workspaceId.length > 0;

  // Working dir backs reveal / open-in-new-window; "" when the workspace has no resolved path.
  const workingDir = useSessionStore((state) =>
    workspaceId
      ? (state.sessions[serverId]?.workspaces.get(workspaceId)?.workspaceDirectory ?? "")
      : "",
  );

  const isPinned = useSidebarPinsStore((state) =>
    workspaceId ? state.isPinned(serverId, { kind: "workspace", workspaceId }) : false,
  );
  const togglePin = useSidebarPinsStore((state) => state.togglePin);
  const onTogglePin = useCallback(() => {
    if (!workspaceId) return;
    togglePin(serverId, { kind: "workspace", workspaceId });
  }, [togglePin, serverId, workspaceId]);

  const [isRenameOpen, setRenameOpen] = useState(false);
  const onOpenRename = useCallback(() => setRenameOpen(true), []);
  const onCloseRename = useCallback(() => setRenameOpen(false), []);
  const onSubmitRename = useCallback(
    async (value: string) => {
      if (!workspaceId) return;
      const client = getHostRuntimeStore().getClient(serverId);
      if (!client) {
        toast.error(t("sidebar.workspace.toasts.hostDisconnected"));
        return;
      }
      const trimmed = value.trim();
      await client.setWorkspaceTitle(workspaceId, trimmed.length === 0 ? null : trimmed);
    },
    [serverId, workspaceId, t, toast],
  );

  const canReveal = hasDesktopOpenTargetsBridge() && workingDir.length > 0;
  const onReveal = useCallback(() => {
    if (workingDir.length === 0) return;
    void (async () => {
      const targets = await listDesktopOpenTargets();
      const fileManager = targets.find((target) => target.kind === "file-manager");
      if (!fileManager) return;
      await openDesktopTarget({ editorId: fileManager.id, path: workingDir, mode: "reveal" });
    })().catch((error) => {
      toast.error(error instanceof Error ? error.message : "Failed to reveal in Finder");
    });
  }, [workingDir, toast]);

  // "复制会话 ID": the provider-native session id (what resumes the conversation), falling back to
  // the agent id when no provider session has been recorded yet.
  const onCopyConversationId = useCallback(() => {
    const agent = useSessionStore.getState().sessions[serverId]?.agents.get(agentId);
    const sessionId = agent?.runtimeInfo?.sessionId ?? agent?.persistence?.sessionId ?? agentId;
    void Clipboard.setStringAsync(sessionId);
    toast.copied(t("sidebar.conversation.actions.copyConversationId"));
  }, [serverId, agentId, toast, t]);

  const canOpenInNewWindow = getIsElectron() && workingDir.length > 0;
  const onOpenInNewWindow = useCallback(() => {
    if (workingDir.length === 0) return;
    void getDesktopHost()
      ?.window?.openNew?.({ pendingOpenProjectPath: workingDir })
      ?.catch((error) => {
        toast.error(
          error instanceof Error ? error.message : t("sidebar.project.actions.openNewWindowFailed"),
        );
      });
  }, [workingDir, toast, t]);

  return useMemo(
    () => ({
      hasWorkspace,
      isPinned,
      onTogglePin,
      isRenameOpen,
      onOpenRename,
      onCloseRename,
      onSubmitRename,
      canReveal,
      onReveal,
      onCopyConversationId,
      canOpenInNewWindow,
      onOpenInNewWindow,
    }),
    [
      hasWorkspace,
      isPinned,
      onTogglePin,
      isRenameOpen,
      onOpenRename,
      onCloseRename,
      onSubmitRename,
      canReveal,
      onReveal,
      onCopyConversationId,
      canOpenInNewWindow,
      onOpenInNewWindow,
    ],
  );
}
