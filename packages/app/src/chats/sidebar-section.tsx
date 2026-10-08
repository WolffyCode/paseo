import { useCallback, type ReactNode } from "react";
import { SquarePen } from "lucide-react-native";
import { Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet } from "react-native-unistyles";
import { SidebarSectionAction, SidebarSectionHeader } from "@/components/sidebar/section-header";
import { SidebarGroupToggleRow } from "@/components/sidebar/sidebar-group-toggle-row";
import { useLimitedSidebarGroup } from "@/components/sidebar/use-limited-sidebar-group";
import type { SidebarWorkspacePlacement } from "@/hooks/use-sidebar-workspaces-list";
import { useSidebarCollapsedSectionsStore } from "@/stores/sidebar-collapsed-sections-store";
import { useOpenNewConversation } from "@/hooks/use-new-conversation";

interface SidebarConversationsSectionProps {
  chats: SidebarWorkspacePlacement[];
  renderChat: (chat: SidebarWorkspacePlacement) => ReactNode;
  onBeforeNavigate?: () => void;
}

export function SidebarConversationsSection({
  chats,
  renderChat,
  onBeforeNavigate,
}: SidebarConversationsSectionProps) {
  const { t } = useTranslation();
  const openNewConversation = useOpenNewConversation();
  const collapsed = useSidebarCollapsedSectionsStore((state) => state.collapsedConversations);
  const onToggle = useSidebarCollapsedSectionsStore((state) => state.toggleConversationsCollapsed);
  const { visibleItems, expanded, canToggle, toggleExpanded } = useLimitedSidebarGroup(chats);
  const newChat = useCallback(() => {
    onBeforeNavigate?.();
    openNewConversation();
  }, [onBeforeNavigate, openNewConversation]);

  return (
    <View style={styles.section} testID="sidebar-conversations-section">
      <SidebarSectionHeader
        title={t("sidebar.conversations.title")}
        testID="sidebar-conversations-section-header"
        collapsed={collapsed}
        onToggle={onToggle}
      >
        <SidebarSectionAction
          icon={SquarePen}
          onPress={newChat}
          label={t("newWorkspace.title")}
          testID="sidebar-new-chat"
        />
      </SidebarSectionHeader>
      {collapsed ? null : (
        <View testID="sidebar-conversations-list">
          {visibleItems.map((chat) => (
            <View key={chat.workspaceKey}>{renderChat(chat)}</View>
          ))}
          {chats.length === 0 ? (
            <Text style={styles.empty}>{t("sidebar.conversations.empty")}</Text>
          ) : null}
          {canToggle ? (
            <SidebarGroupToggleRow
              expanded={expanded}
              onPress={toggleExpanded}
              testID="sidebar-conversations-show-more"
            />
          ) : null}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  section: {
    marginTop: theme.spacing[3],
  },
  empty: {
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[2],
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
}));
