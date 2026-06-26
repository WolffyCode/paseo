import { usePathname } from "expo-router";
import { Bot, ChevronRight, Folder, FolderPlus } from "lucide-react-native";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, type PressableStateCallbackType, ScrollView, Text, View } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { AgentStatusDot } from "@/components/agent-status-dot";
import { useIsCompactFormFactor } from "@/constants/layout";
import { isNative } from "@/constants/platform";
import type { SidebarProjectEntry } from "@/hooks/sidebar-workspaces-view-model";
import { useActiveWorkspaceSelection } from "@/stores/navigation-active-workspace-store";
import { useSessionStore } from "@/stores/session-store";
import { useSidebarCollapsedSectionsStore } from "@/stores/sidebar-collapsed-sections-store";
import type { Theme } from "@/styles/theme";
import { navigateToAgent } from "@/utils/navigate-to-agent";
import {
  buildConversationTree,
  type ConversationTreeProject,
  flattenConversationTreeRows,
} from "./select";
import type { ConversationTreeNode, ConversationTreeRow } from "./types";

// The render-depth cap (本轮 = 2: 对话 + subagent 一层). The data layer already fills the
// full recursion — un-capping deeper nesting later is a one-line change here, no data/selector
// edits (architecture §6 ①).
export const MAX_RENDER_DEPTH = 2;
const INDENT_PER_DEPTH = 14;
const ROW_BASE_PADDING = 8;
const TREE_ICON_SIZE = 16;
const SUBAGENT_ICON_SIZE = 14;
const CHEVRON_SIZE = 14;

const ThemedChevron = withUnistyles(ChevronRight);
const ThemedFolder = withUnistyles(Folder);
const ThemedFolderPlus = withUnistyles(FolderPlus);
const ThemedBot = withUnistyles(Bot);

const mutedIconColor = (theme: Theme) => ({ color: theme.colors.foregroundMuted });

type HoverState = PressableStateCallbackType & { hovered?: boolean };

const EMPTY_AGENTS: never[] = [];

interface ConversationTreeProps {
  serverId: string | null;
  /** Project grouping (置顶 first, then the rest), reused from the sidebar workspace list. */
  projects: SidebarProjectEntry[];
  onAddProject?: () => void;
  /** Called after navigating to a conversation (e.g. close the mobile drawer). */
  onNavigate?: () => void;
}

/**
 * Left-column conversation tree (replaces the old workspace list on desktop). Projects expand
 * into root conversations, which expand into their first layer of subagents; deeper nesting is
 * capped by MAX_RENDER_DEPTH (data is fully built, only the render is capped). Selection is
 * derived from the active workspace route; project collapse persists in the shared sidebar
 * store, conversation collapse is local UI state.
 */
export function ConversationTree({
  serverId,
  projects,
  onAddProject,
  onNavigate,
}: ConversationTreeProps) {
  const { t } = useTranslation();
  const pathname = usePathname();
  const agents = useSessionStore((state) =>
    serverId ? state.sessions[serverId]?.agents : undefined,
  );
  const selection = useActiveWorkspaceSelection();
  const collapsedProjectKeys = useSidebarCollapsedSectionsStore(
    (state) => state.collapsedProjectKeys,
  );
  const toggleProjectCollapsed = useSidebarCollapsedSectionsStore(
    (state) => state.toggleProjectCollapsed,
  );
  const [collapsedConversationIds, setCollapsedConversationIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  // The projects "add" action is hover-revealed on the section header (web), always shown on
  // touch/compact where hover is unreachable (docs/hover.md plain-View pointer tracking).
  const isCompact = useIsCompactFormFactor();
  const [projectsHeaderHovered, setProjectsHeaderHovered] = useState(false);
  const showAddProject = projectsHeaderHovered || isNative || isCompact;
  const handleProjectsHeaderEnter = useCallback(() => setProjectsHeaderHovered(true), []);
  const handleProjectsHeaderLeave = useCallback(() => setProjectsHeaderHovered(false), []);
  const addProjectActionStyle = useMemo(
    () => [styles.sectionAction, { opacity: showAddProject ? 1 : 0 }],
    [showAddProject],
  );

  const treeProjects = useMemo<ConversationTreeProject[]>(
    () =>
      projects.map((project) => ({
        projectKey: project.projectKey,
        projectName: project.projectName,
        workspaceIds: project.workspaces.map((workspace) => workspace.workspaceId),
      })),
    [projects],
  );
  const agentList = useMemo(() => (agents ? Array.from(agents.values()) : EMPTY_AGENTS), [agents]);
  const tree = useMemo(
    () =>
      serverId
        ? buildConversationTree({ serverId, agents: agentList, projects: treeProjects })
        : [],
    [serverId, agentList, treeProjects],
  );

  const projectNodes = useMemo(() => tree.filter((node) => node.kind === "project"), [tree]);
  const looseNodes = useMemo(() => tree.filter((node) => node.kind === "conversation"), [tree]);
  const flattenOptions = useMemo(
    () => ({ collapsedProjectKeys, collapsedConversationIds, maxDepth: MAX_RENDER_DEPTH }),
    [collapsedProjectKeys, collapsedConversationIds],
  );
  const projectRows = useMemo(
    () => flattenConversationTreeRows(projectNodes, flattenOptions),
    [projectNodes, flattenOptions],
  );
  const looseRows = useMemo(
    () => flattenConversationTreeRows(looseNodes, flattenOptions),
    [looseNodes, flattenOptions],
  );

  const handleToggleConversation = useCallback((conversationId: string) => {
    setCollapsedConversationIds((previous) => {
      const next = new Set(previous);
      if (next.has(conversationId)) {
        next.delete(conversationId);
      } else {
        next.add(conversationId);
      }
      return next;
    });
  }, []);

  const handleSelectAgent = useCallback(
    (node: ConversationTreeNode) => {
      navigateToAgent({ serverId: node.serverId, agentId: node.id, currentPathname: pathname });
      onNavigate?.();
    },
    [pathname, onNavigate],
  );

  const renderRow = (row: ConversationTreeRow) => (
    <ConversationTreeRowView
      key={`${row.node.kind}:${row.node.id}`}
      row={row}
      selected={isRowSelected(row, selection, serverId)}
      onSelectAgent={handleSelectAgent}
      onToggleProject={toggleProjectCollapsed}
      onToggleConversation={handleToggleConversation}
    />
  );

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
      testID="conversation-tree"
    >
      <View
        style={styles.sectionHeader}
        onPointerEnter={handleProjectsHeaderEnter}
        onPointerLeave={handleProjectsHeaderLeave}
      >
        <Text style={styles.sectionTitle}>{t("sidebar.sections.projects")}</Text>
        {onAddProject ? (
          <Pressable
            style={addProjectActionStyle}
            pointerEvents={showAddProject ? "auto" : "none"}
            onPress={onAddProject}
            testID="conversation-tree-add-project"
            accessibilityRole="button"
          >
            <ThemedFolderPlus size={CHEVRON_SIZE} uniProps={mutedIconColor} />
          </Pressable>
        ) : null}
      </View>
      {projectRows.map(renderRow)}

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{t("sidebar.sections.conversations")}</Text>
      </View>
      {looseRows.length > 0 ? (
        looseRows.map(renderRow)
      ) : (
        <Text style={styles.emptyHint}>{t("sidebar.sections.noConversations")}</Text>
      )}
    </ScrollView>
  );
}

// A conversation/subagent row is selected when the active workspace route matches its workspace.
// Project nodes are never selected (they only collapse/expand).
function isRowSelected(
  row: ConversationTreeRow,
  selection: { serverId: string; workspaceId: string } | null,
  serverId: string | null,
): boolean {
  if (row.node.kind === "project" || !selection || !row.node.workspaceId) {
    return false;
  }
  return selection.serverId === serverId && selection.workspaceId === row.node.workspaceId;
}

// One tree row. Projects toggle collapse on press; conversations/subagents navigate on press and
// toggle their subagent collapse via the chevron. Per-row useCallback/useMemo keep style/handler
// props stable (react-perf).
function ConversationTreeRowView({
  row,
  selected,
  onSelectAgent,
  onToggleProject,
  onToggleConversation,
}: {
  row: ConversationTreeRow;
  selected: boolean;
  onSelectAgent: (node: ConversationTreeNode) => void;
  onToggleProject: (projectKey: string) => void;
  onToggleConversation: (conversationId: string) => void;
}) {
  const { node, depth, canExpand, isExpanded } = row;
  const isProject = node.kind === "project";

  const indentStyle = useMemo(
    () => ({ paddingLeft: ROW_BASE_PADDING + depth * INDENT_PER_DEPTH }),
    [depth],
  );
  const rowStyle = useCallback(
    ({ hovered }: HoverState) => [
      styles.row,
      indentStyle,
      selected && styles.rowSelected,
      hovered && !selected && styles.rowHovered,
    ],
    [indentStyle, selected],
  );

  const handlePress = useCallback(() => {
    if (isProject) {
      onToggleProject(node.id);
    } else {
      onSelectAgent(node);
    }
  }, [isProject, node, onToggleProject, onSelectAgent]);

  const handleChevron = useCallback(() => {
    if (isProject) {
      onToggleProject(node.id);
    } else {
      onToggleConversation(node.id);
    }
  }, [isProject, node.id, onToggleProject, onToggleConversation]);

  return (
    <Pressable
      style={rowStyle}
      onPress={handlePress}
      testID={`conversation-tree-row-${node.id}`}
      accessibilityRole="button"
      accessibilityState={isProject ? undefined : SELECTED_STATE_FALSE}
    >
      {isProject ? (
        <ThemedFolder size={TREE_ICON_SIZE} uniProps={mutedIconColor} />
      ) : (
        <>
          {node.kind === "subagent" ? (
            <ThemedBot size={SUBAGENT_ICON_SIZE} uniProps={mutedIconColor} />
          ) : null}
          <AgentStatusDot
            status={node.status}
            requiresAttention={node.requiresAttention}
            showInactive
          />
        </>
      )}

      <Text style={selected ? styles.rowNameSelected : styles.rowName} numberOfLines={1}>
        {node.title.length > 0 ? node.title : node.id}
      </Text>

      {!isProject && node.subagentCount > 0 ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{node.subagentCount}</Text>
        </View>
      ) : null}

      {/* Expand/collapse chevron now sits after the name (反馈: 放目录名后边); the flex
          name pushes it to the row's trailing edge. */}
      {canExpand ? (
        <Pressable
          onPress={handleChevron}
          style={styles.chevronButton}
          testID={`conversation-tree-chevron-${node.id}`}
          accessibilityRole="button"
        >
          <ThemedChevron
            size={CHEVRON_SIZE}
            uniProps={mutedIconColor}
            style={isExpanded ? styles.chevronExpanded : styles.chevronCollapsed}
          />
        </Pressable>
      ) : null}
    </Pressable>
  );
}

const SELECTED_STATE_FALSE = { selected: false } as const;

const styles = StyleSheet.create((theme) => ({
  scroll: {
    flex: 1,
    minHeight: 0,
  },
  scrollContent: {
    paddingHorizontal: theme.spacing[2],
    paddingBottom: theme.spacing[2],
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1.5],
    // Align the section label's left edge with the row content below (rows sit at
    // ROW_BASE_PADDING = spacing[2]); spacing[1] read as偏左 against the rows.
    paddingLeft: theme.spacing[2],
    paddingRight: theme.spacing[1],
    paddingTop: 9,
    paddingBottom: 5,
  },
  sectionTitle: {
    flex: 1,
    fontSize: 12,
    fontWeight: "500",
    color: theme.colors.foregroundMuted,
  },
  sectionAction: {
    padding: 2,
    borderRadius: theme.borderRadius.sm,
  },
  emptyHint: {
    paddingVertical: 10,
    paddingHorizontal: 10,
    fontSize: 12,
    color: theme.colors.foregroundMuted,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingRight: 8,
    paddingVertical: 6,
    minHeight: 30,
    borderRadius: theme.borderRadius.md,
  },
  rowHovered: {
    backgroundColor: theme.colors.surfaceSidebarHover,
  },
  rowSelected: {
    backgroundColor: theme.colors.surface2,
  },
  chevronButton: {
    width: 14,
    height: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  chevronCollapsed: {
    transform: [{ rotate: "0deg" }],
  },
  chevronExpanded: {
    transform: [{ rotate: "90deg" }],
  },
  rowName: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    color: theme.colors.foregroundMuted,
  },
  rowNameSelected: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    color: theme.colors.foreground,
  },
  badge: {
    flex: 0,
    paddingHorizontal: 6,
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.surface3,
  },
  badgeText: {
    fontSize: 10,
    lineHeight: 16,
    color: theme.colors.foregroundMuted,
  },
}));
