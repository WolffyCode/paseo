import { useCallback, type ReactNode } from "react";
import { Plus } from "lucide-react-native";
import { Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet } from "react-native-unistyles";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { SidebarGroupToggleRow } from "@/components/sidebar/sidebar-group-toggle-row";
import { useLimitedSidebarGroup } from "@/components/sidebar/use-limited-sidebar-group";
import type { SidebarWorkspacePlacement } from "@/hooks/use-sidebar-workspaces-list";
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
  const { visibleItems, expanded, canToggle, toggleExpanded } = useLimitedSidebarGroup(chats);
  const newChat = useCallback(() => {
    onBeforeNavigate?.();
    openNewConversation();
  }, [onBeforeNavigate, openNewConversation]);

  return (
    <View style={styles.section} testID="sidebar-conversations-section">
      <View style={styles.header}>
        <Text style={styles.title}>{t("sidebar.conversations.title")}</Text>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="xs"
              leftIcon={Plus}
              onPress={newChat}
              accessibilityLabel={t("newWorkspace.title")}
              testID="sidebar-new-chat"
            />
          </TooltipTrigger>
          <TooltipContent side="bottom" align="end">
            <Text style={styles.tooltip}>{t("newWorkspace.title")}</Text>
          </TooltipContent>
        </Tooltip>
      </View>
      <View testID="sidebar-conversations-list">
        {visibleItems.map((chat) => (
          <View key={chat.workspaceKey}>{renderChat(chat)}</View>
        ))}
      </View>
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
  );
}

const styles = StyleSheet.create((theme) => ({
  section: {
    marginTop: theme.spacing[3],
  },
  header: {
    minHeight: 36,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingLeft: theme.spacing[2],
    paddingRight: theme.spacing[1],
  },
  title: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
  },
  empty: {
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[2],
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  tooltip: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
  },
}));
