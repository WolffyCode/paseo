import type { ReactElement } from "react";
import { Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet } from "react-native-unistyles";
import { WorkspaceStatusIndicator } from "@/components/sidebar/sidebar-workspace-row-content";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { WORKSPACE_TAB_ROW_HEIGHT } from "@/constants/layout";
import {
  WorkspaceTabPresentationResolver,
  type WorkspaceTabPresentation,
} from "@/screens/workspace/workspace-tab-presentation";
import type { WorkspaceTabDescriptor } from "@/screens/workspace/workspace-tabs-types";
import { useWorkspace } from "@/stores/session-store-hooks";
import { ConversationActionsMenu, type ConversationAgentActions } from "./conversation-menu";

const TITLE_TOOLTIP_DELAY_MS = 400;
const TITLE_TOOLTIP_MAX_WIDTH = 560;

interface WorkbenchConversationHeaderProps {
  serverId: string;
  workspaceId: string;
  paneId: string;
  tab: WorkspaceTabDescriptor | null;
  agentActions: ConversationAgentActions;
}

/**
 * Column 2's header names the conversation it holds. The titlebar already says which host,
 * project and branch it runs in, so this row carries only what belongs to the conversation.
 */
export function WorkbenchConversationHeader({
  serverId,
  workspaceId,
  paneId,
  tab,
  agentActions,
}: WorkbenchConversationHeaderProps): ReactElement {
  if (!tab) {
    return <View style={styles.header} testID="workbench-conversation-header" />;
  }
  return (
    <WorkspaceTabPresentationResolver
      tab={tab}
      serverId={serverId}
      workspaceId={workspaceId}
      paneId={paneId}
    >
      {(presentation) => (
        <ConversationHeaderContent
          serverId={serverId}
          workspaceId={workspaceId}
          tab={tab}
          presentation={presentation}
          agentActions={agentActions}
        />
      )}
    </WorkspaceTabPresentationResolver>
  );
}

function ConversationHeaderContent({
  serverId,
  workspaceId,
  tab,
  presentation,
  agentActions,
}: {
  serverId: string;
  workspaceId: string;
  tab: WorkspaceTabDescriptor;
  presentation: WorkspaceTabPresentation;
  agentActions: ConversationAgentActions;
}): ReactElement {
  const { t } = useTranslation();
  const workspace = useWorkspace(serverId, workspaceId);
  const isTitleLoading = presentation.titleState === "loading";
  const title = isTitleLoading ? t("workspace.tabs.loadingAgentTitle") : presentation.label;
  const statusBucket = presentation.statusBucket;

  return (
    <View style={styles.header} testID="workbench-conversation-header">
      {/* The status hangs in the left gutter so the title keeps the message text's edge. */}
      {statusBucket && workspace ? (
        <View style={styles.statusSlot}>
          <WorkspaceStatusIndicator
            bucket={statusBucket}
            workspaceKind={workspace.workspaceKind}
            reserveIdleSpace={false}
          />
        </View>
      ) : null}
      <Tooltip delayDuration={TITLE_TOOLTIP_DELAY_MS}>
        <TooltipTrigger style={styles.titleTrigger}>
          <Text
            numberOfLines={1}
            style={isTitleLoading ? styles.titleLoading : styles.title}
            testID="workbench-conversation-title"
          >
            {title}
          </Text>
        </TooltipTrigger>
        <TooltipContent side="bottom" align="start" offset={8} maxWidth={TITLE_TOOLTIP_MAX_WIDTH}>
          <Text style={styles.tooltipText}>{presentation.tooltip || title}</Text>
        </TooltipContent>
      </Tooltip>
      {tab.target.kind === "agent" ? (
        <ConversationActionsMenu
          serverId={serverId}
          workspaceId={workspaceId}
          tab={tab}
          agentId={tab.target.agentId}
          agentActions={agentActions}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  header: {
    height: WORKSPACE_TAB_ROW_HEIGHT,
    // Same rule as column 3's tab row, so the two dividers run on one line.
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    // The stream's 16px viewport padding plus its 8px item inset: the title starts where the
    // message text does.
    paddingLeft: theme.spacing[6],
    paddingRight: theme.spacing[2],
  },
  statusSlot: {
    position: "absolute",
    left: theme.spacing[1],
    top: 0,
    bottom: 0,
    justifyContent: "center",
  },
  titleTrigger: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.normal,
    color: theme.colors.foreground,
  },
  titleLoading: {
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.normal,
    color: theme.colors.foregroundMuted,
  },
  tooltipText: {
    fontSize: theme.fontSize.base,
    color: theme.colors.foreground,
  },
}));
