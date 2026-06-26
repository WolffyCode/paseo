import { router } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "@/contexts/toast-context";
import { getHostRuntimeStore } from "@/runtime/host-runtime";
import { useSidebarPinsStore } from "@/stores/sidebar-pins-store";
import { confirmDialog } from "@/utils/confirm-dialog";
import { buildHostNewWorkspaceRoute } from "@/utils/host-routes";
import {
  hasDesktopOpenTargetsBridge,
  listDesktopOpenTargets,
  openDesktopTarget,
} from "@/workspace/desktop-open-targets";
import { deriveProjectActionAvailability } from "./project-action-availability";

export interface ProjectRowActionsInput {
  serverId: string;
  projectKey: string;
  projectName: string;
  /** Project working directory (basename shown as the row title); enables reveal / worktree. */
  workingDir: string | undefined;
}

export interface ProjectRowActions {
  isPinned: boolean;
  onTogglePin: () => void;
  /** Reveal-in-Finder is desktop-only (needs the file-manager open-target bridge) + a real dir. */
  canReveal: boolean;
  onReveal: () => void;
  /** Creating a worktree needs a working dir to scope the new workspace to. */
  canCreateWorktree: boolean;
  onCreateWorktree: () => void;
  isRenameOpen: boolean;
  onOpenRename: () => void;
  onCloseRename: () => void;
  onSubmitRename: (value: string) => Promise<void>;
  isRemoving: boolean;
  onRemove: () => void;
}

/**
 * Model for the project (目录) row's right-click menu — every action's state + handler lives here,
 * the row component only renders menu items and dispatches (UI/model separation; 反馈: 项目右键对照
 * Codex #40 — 置顶 / Finder / 创建永久工作树 / 重命名 / 归档 / 移除). Conversation/subagent rows do
 * NOT call this hook; it is project-only.
 */
export function useProjectRowActions(input: ProjectRowActionsInput): ProjectRowActions {
  const { serverId, projectKey, projectName, workingDir } = input;
  const { t } = useTranslation();
  const toast = useToast();

  const isPinned = useSidebarPinsStore((state) =>
    state.isPinned(serverId, { kind: "project", projectKey }),
  );
  const togglePin = useSidebarPinsStore((state) => state.togglePin);
  const onTogglePin = useCallback(() => {
    togglePin(serverId, { kind: "project", projectKey });
  }, [togglePin, serverId, projectKey]);

  const { canReveal, canCreateWorktree } = deriveProjectActionAvailability({
    workingDir,
    hasDesktopBridge: hasDesktopOpenTargetsBridge(),
  });
  const onReveal = useCallback(() => {
    if (!workingDir) return;
    void (async () => {
      const targets = await listDesktopOpenTargets();
      const fileManager = targets.find((target) => target.kind === "file-manager");
      if (!fileManager) return;
      await openDesktopTarget({ editorId: fileManager.id, path: workingDir, mode: "reveal" });
    })().catch((error) => {
      toast.error(error instanceof Error ? error.message : "Failed to reveal in Finder");
    });
  }, [workingDir, toast]);

  const onCreateWorktree = useCallback(() => {
    if (!workingDir) return;
    router.navigate(
      buildHostNewWorkspaceRoute(serverId, workingDir, {
        projectId: projectKey,
        displayName: projectName,
      }),
    );
  }, [serverId, workingDir, projectKey, projectName]);

  const [isRenameOpen, setRenameOpen] = useState(false);
  const onOpenRename = useCallback(() => setRenameOpen(true), []);
  const onCloseRename = useCallback(() => setRenameOpen(false), []);
  const onSubmitRename = useCallback(
    async (value: string) => {
      const client = getHostRuntimeStore().getClient(serverId);
      if (!client) {
        toast.error(t("sidebar.project.toasts.hostDisconnected"));
        return;
      }
      const trimmed = value.trim();
      await client.renameProject(projectKey, trimmed.length === 0 ? null : trimmed);
    },
    [serverId, projectKey, t, toast],
  );

  const [isRemoving, setIsRemoving] = useState(false);
  const onRemove = useCallback(() => {
    if (isRemoving) return;
    void (async () => {
      const confirmed = await confirmDialog({
        title: t("sidebar.project.confirmations.removeTitle"),
        message: t("sidebar.project.confirmations.removeMessage", { projectName }),
        confirmLabel: t("sidebar.project.confirmations.removeConfirm"),
        cancelLabel: t("sidebar.project.confirmations.cancel"),
        destructive: true,
      });
      if (!confirmed) return;
      const client = getHostRuntimeStore().getClient(serverId);
      if (!client) {
        toast.error(t("sidebar.project.toasts.hostDisconnected"));
        return;
      }
      setIsRemoving(true);
      void client
        .removeProject(projectKey)
        .catch((error) => {
          toast.error(
            error instanceof Error ? error.message : t("sidebar.project.toasts.removeFailed"),
          );
        })
        .finally(() => setIsRemoving(false));
    })();
  }, [isRemoving, serverId, projectKey, projectName, t, toast]);

  return useMemo(
    () => ({
      isPinned,
      onTogglePin,
      canReveal,
      onReveal,
      canCreateWorktree,
      onCreateWorktree,
      isRenameOpen,
      onOpenRename,
      onCloseRename,
      onSubmitRename,
      isRemoving,
      onRemove,
    }),
    [
      isPinned,
      onTogglePin,
      canReveal,
      onReveal,
      canCreateWorktree,
      onCreateWorktree,
      isRenameOpen,
      onOpenRename,
      onCloseRename,
      onSubmitRename,
      isRemoving,
      onRemove,
    ],
  );
}
