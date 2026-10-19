import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "@/contexts/toast-context";
import { useWorkspaceReadState } from "@/hooks/use-workspace-read-state";

export interface SidebarWorkspaceReadActions {
  onMarkAsRead: (() => void) | undefined;
  onMarkAsUnread: (() => void) | undefined;
}

/** The workspace menu's read-state items: present only when the action applies, toasting failures. */
export function useSidebarWorkspaceReadActions(input: {
  serverId: string;
  workspaceId: string;
}): SidebarWorkspaceReadActions {
  const { t } = useTranslation();
  const toast = useToast();
  const { hasClearableAttention, canMarkUnread, clearAttention, markUnread } =
    useWorkspaceReadState(input);

  const handleMarkAsRead = useCallback(() => {
    void clearAttention().catch((error) => {
      const message =
        error instanceof Error ? error.message : t("sidebar.workspace.toasts.markReadFailed");
      toast.error(message);
    });
  }, [clearAttention, t, toast]);

  const handleMarkAsUnread = useCallback(() => {
    void markUnread().catch((error) => {
      const message =
        error instanceof Error ? error.message : t("sidebar.workspace.toasts.markUnreadFailed");
      toast.error(message);
    });
  }, [markUnread, t, toast]);

  return {
    onMarkAsRead: hasClearableAttention ? handleMarkAsRead : undefined,
    onMarkAsUnread: canMarkUnread ? handleMarkAsUnread : undefined,
  };
}
