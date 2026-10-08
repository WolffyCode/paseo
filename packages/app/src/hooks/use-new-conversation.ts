import { useCallback } from "react";
import { router } from "expo-router";
import { useKeyboardActionHandler } from "@/hooks/use-keyboard-action-handler";
import type { KeyboardActionId } from "@/keyboard/keyboard-action-dispatcher";
import { useHosts } from "@/runtime/host-runtime";
import {
  useActiveWorkspaceSelection,
  useLastWorkspaceSelection,
} from "@/stores/navigation-active-workspace-store";
import { generateDraftId } from "@/stores/draft-keys";
import { buildNewWorkspaceRoute } from "@/utils/host-routes";

const NEW_CONVERSATION_ACTIONS: readonly KeyboardActionId[] = ["workspace.new"];

export function useOpenNewConversation() {
  const hosts = useHosts();
  const active = useActiveWorkspaceSelection();
  const last = useLastWorkspaceSelection();
  const preferredServerId = active?.serverId ?? last?.serverId;
  const serverId = hosts.find((host) => host.serverId === preferredServerId)?.serverId;
  return useCallback(() => {
    if (hosts.length === 0) return false;
    router.navigate(buildNewWorkspaceRoute({ serverId, draftId: generateDraftId() }));
    return true;
  }, [hosts.length, serverId]);
}

export function useGlobalNewConversationAction() {
  const open = useOpenNewConversation();
  const hosts = useHosts();
  useKeyboardActionHandler({
    handlerId: "conversation-new-global",
    actions: NEW_CONVERSATION_ACTIONS,
    enabled: hosts.length > 0,
    priority: 0,
    handle: open,
  });
}
