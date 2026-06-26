import { usePathname } from "expo-router";
import {
  Archive,
  Bot,
  ChevronRight,
  Folder,
  FolderOpen,
  FolderPlus,
  GitBranch,
  MoreHorizontal,
  Pencil,
  Pin,
  SquarePen,
  Trash2,
} from "lucide-react-native";
import { useCallback, useMemo, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, Text, View } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { useIsCompactFormFactor } from "@/constants/layout";
import { isNative } from "@/constants/platform";
import { AdaptiveRenameModal } from "@/components/rename-modal";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { getHostRuntimeStore } from "@/runtime/host-runtime";
import { useToast } from "@/contexts/toast-context";
import type { SidebarProjectEntry } from "@/hooks/sidebar-workspaces-view-model";
import { useActiveWorkspaceSelection } from "@/stores/navigation-active-workspace-store";
import { useSessionStore } from "@/stores/session-store";
import { useSidebarCollapsedSectionsStore } from "@/stores/sidebar-collapsed-sections-store";
import type { Theme } from "@/styles/theme";
import { navigateToAgent } from "@/utils/navigate-to-agent";
import { type ProjectRowActions, useProjectRowActions } from "./use-project-row-actions";
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
const ThemedSquarePen = withUnistyles(SquarePen);
const ThemedMoreHorizontal = withUnistyles(MoreHorizontal);
const ThemedPencil = withUnistyles(Pencil);
const ThemedPin = withUnistyles(Pin);
const ThemedFolderOpen = withUnistyles(FolderOpen);
const ThemedGitBranch = withUnistyles(GitBranch);
const ThemedArchive = withUnistyles(Archive);
const ThemedTrash2 = withUnistyles(Trash2);

const mutedIconColor = (theme: Theme) => ({ color: theme.colors.foregroundMuted });

// Menu-item leading icons (module-level so they aren't re-created per row — react-perf).
const renameMenuIcon = <ThemedPencil size={16} uniProps={mutedIconColor} />;
const pinMenuIcon = <ThemedPin size={16} uniProps={mutedIconColor} />;
const revealMenuIcon = <ThemedFolderOpen size={16} uniProps={mutedIconColor} />;
const worktreeMenuIcon = <ThemedGitBranch size={16} uniProps={mutedIconColor} />;
const archiveMenuIcon = <ThemedArchive size={16} uniProps={mutedIconColor} />;
const removeMenuIcon = <ThemedTrash2 size={16} uniProps={mutedIconColor} />;

const EMPTY_AGENTS: never[] = [];

interface ConversationTreeProps {
  serverId: string | null;
  /** Project grouping (置顶 first, then the rest), reused from the sidebar workspace list. */
  projects: SidebarProjectEntry[];
  onAddProject?: () => void;
  /** Hover action on a project row: start a new conversation scoped to that project. */
  onNewConversation?: (project: SidebarProjectEntry) => void;
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
  onNewConversation,
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
  // Map projectKey → full entry so a project row's new-conversation hover action can resolve the
  // working dir for routing (the lightweight tree node only carries keys).
  const projectByKey = useMemo(
    () => new Map(projects.map((project) => [project.projectKey, project])),
    [projects],
  );
  const handleNewConversationForProject = useCallback(
    (projectKey: string) => {
      const project = projectByKey.get(projectKey);
      if (project) onNewConversation?.(project);
    },
    [projectByKey, onNewConversation],
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
      onNewConversation={handleNewConversationForProject}
      projectWorkingDir={
        row.node.kind === "project" ? projectByKey.get(row.node.id)?.iconWorkingDir : undefined
      }
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
      {projectRows.flatMap((row) => {
        const rowElement = renderRow(row);
        // 项目展开但没有对话 → 紧跟一行"暂无对话"(反馈: 目录下没对话应展示暂无对话, 对齐 Codex)。
        if (row.node.kind === "project" && row.isExpanded && row.node.children.length === 0) {
          return [
            rowElement,
            <Text key={`empty-${row.node.id}`} style={styles.emptyHintProject}>
              {t("sidebar.sections.noConversations")}
            </Text>,
          ];
        }
        return rowElement;
      })}

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
  onNewConversation,
  projectWorkingDir,
}: {
  row: ConversationTreeRow;
  selected: boolean;
  onSelectAgent: (node: ConversationTreeNode) => void;
  onToggleProject: (projectKey: string) => void;
  onToggleConversation: (conversationId: string) => void;
  onNewConversation: (projectKey: string) => void;
  projectWorkingDir?: string;
}) {
  const { node, depth, canExpand, isExpanded } = row;
  const isProject = node.kind === "project";

  // 项目行右键菜单的全部操作 model(对话行也会调用但不使用结果 —— hook 必须无条件调用)。
  const projectActions = useProjectRowActions({
    serverId: node.serverId,
    projectKey: node.id,
    projectName: node.title.length > 0 ? node.title : node.id,
    workingDir: projectWorkingDir,
  });

  // Row hover drives the trailing action (more / new-conversation); right-click & long-press open
  // the same menu, also openable from the more button (反馈8/12/14).
  const [rowHovered, setRowHovered] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const handleHoverIn = useCallback(() => setRowHovered(true), []);
  const handleHoverOut = useCallback(() => setRowHovered(false), []);
  const openMenu = useCallback(() => setMenuOpen(true), []);
  const showRowActions = rowHovered || isNative;

  const indentStyle = useMemo(
    () => ({ paddingLeft: ROW_BASE_PADDING + depth * INDENT_PER_DEPTH }),
    [depth],
  );
  const rowStyle = useMemo(
    () => [
      styles.row,
      indentStyle,
      selected && styles.rowSelected,
      rowHovered && !selected && styles.rowHovered,
    ],
    [indentStyle, selected, rowHovered],
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

  const handleNewConversation = useCallback(() => {
    onNewConversation(node.id);
  }, [onNewConversation, node.id]);

  // Conversation rows support double-tap-to-rename (反馈13); the title persists via
  // setWorkspaceTitle. Project rows have no workspace, so the modal stays inert for them.
  const { t } = useTranslation();
  const toast = useToast();
  const [isRenameOpen, setIsRenameOpen] = useState(false);
  const renameMutation = useMutation({
    mutationFn: async (title: string) => {
      if (!node.workspaceId) return;
      const client = getHostRuntimeStore().getClient(node.serverId);
      if (!client) throw new Error(t("sidebar.workspace.toasts.hostDisconnected"));
      await client.setWorkspaceTitle(node.workspaceId, title.length === 0 ? null : title);
    },
  });
  const lastTapRef = useRef(0);
  const handleRowPress = useCallback(() => {
    const now = Date.now();
    if (!isProject && node.workspaceId && now - lastTapRef.current < 300) {
      setIsRenameOpen(true);
    } else {
      handlePress();
    }
    lastTapRef.current = now;
  }, [handlePress, isProject, node.workspaceId]);
  const handleSubmitRename = useCallback(
    async (value: string) => {
      try {
        await renameMutation.mutateAsync(value.trim());
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Rename failed");
      }
    },
    [renameMutation, toast],
  );
  const handleCloseRename = useCallback(() => setIsRenameOpen(false), []);
  const openRename = useCallback(() => setIsRenameOpen(true), []);

  return (
    // Hover 靶: plain View + onPointerEnter/Leave —— 内部 action(Pressable) 不再抢占 hover, 鼠标移到
    // 按钮上行 hover 不丢失 (docs/hover.md Failure Mode 1; 反馈: 悬浮到按钮时行的悬浮效果没了)。
    <View
      style={styles.rowHoverTracker}
      onPointerEnter={handleHoverIn}
      onPointerLeave={handleHoverOut}
    >
      <ContextMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <ContextMenuTrigger
          onPress={handleRowPress}
          style={rowStyle}
          enabledOnMobile
          testID={`conversation-tree-row-${node.id}`}
          accessibilityRole="button"
          accessibilityState={isProject ? undefined : SELECTED_STATE_FALSE}
        >
          {/* 展开/收起 chevron 前置(反馈: 放前边, 对齐 Codex); 不可展开的行用等宽占位保持图标左对齐。*/}
          {canExpand ? (
            <Pressable
              onPress={handleChevron}
              style={styles.chevronButton}
              testID={`conversation-tree-chevron-${node.id}`}
              accessibilityRole="button"
              hitSlop={4}
            >
              <ThemedChevron
                size={CHEVRON_SIZE}
                uniProps={mutedIconColor}
                style={isExpanded ? styles.chevronExpanded : styles.chevronCollapsed}
              />
            </Pressable>
          ) : (
            <View style={styles.chevronSpacer} />
          )}

          {/* 对话/subagent → 小机器人; 项目→文件夹。状态图标先删(反馈: 达不到想要的效果)。*/}
          {isProject ? (
            <ThemedFolder size={TREE_ICON_SIZE} uniProps={mutedIconColor} />
          ) : (
            <ThemedBot
              size={node.kind === "subagent" ? SUBAGENT_ICON_SIZE : TREE_ICON_SIZE}
              uniProps={mutedIconColor}
            />
          )}

          <Text style={selected ? styles.rowNameSelected : styles.rowName} numberOfLines={1}>
            {node.title.length > 0 ? node.title : node.id}
          </Text>

          {/* Trailing hover action: project → new conversation (反馈7); conversation → "more" that
            opens the same menu as right-click / long-press (反馈14). */}
          {isProject && showRowActions ? (
            <Pressable
              onPress={handleNewConversation}
              style={styles.rowAction}
              testID={`conversation-tree-new-conversation-${node.id}`}
              accessibilityRole="button"
              hitSlop={6}
            >
              <ThemedSquarePen size={CHEVRON_SIZE} uniProps={mutedIconColor} />
            </Pressable>
          ) : null}
          {!isProject && showRowActions ? (
            <Pressable
              onPress={openMenu}
              style={styles.rowAction}
              testID={`conversation-tree-more-${node.id}`}
              accessibilityRole="button"
              hitSlop={6}
            >
              <ThemedMoreHorizontal size={CHEVRON_SIZE} uniProps={mutedIconColor} />
            </Pressable>
          ) : null}

          {!isProject && node.subagentCount > 0 ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{node.subagentCount}</Text>
            </View>
          ) : null}
        </ContextMenuTrigger>

        {isProject ? (
          <ProjectRowMenu node={node} projectActions={projectActions} />
        ) : (
          <>
            <ContextMenuContent side="bottom" align="end" minWidth={200}>
              {node.workspaceId ? (
                <ContextMenuItem
                  onSelect={openRename}
                  leading={renameMenuIcon}
                  testID={`conversation-tree-menu-rename-${node.id}`}
                >
                  {t("sidebar.workspace.rename.title")}
                </ContextMenuItem>
              ) : null}
            </ContextMenuContent>
            {node.workspaceId ? (
              <AdaptiveRenameModal
                visible={isRenameOpen}
                title={t("sidebar.workspace.rename.title")}
                initialValue={node.title}
                placeholder={node.title}
                submitLabel={t("sidebar.workspace.rename.submit")}
                onClose={handleCloseRename}
                onSubmit={handleSubmitRename}
                testID={`conversation-rename-modal-${node.id}`}
              />
            ) : null}
          </>
        )}
      </ContextMenu>
    </View>
  );
}

// 项目(目录)行右键菜单 —— 对照 Codex #40(置顶/Finder/创建永久工作树/重命名/归档/移除)。提取成独立
// 组件让 ConversationTreeRowView 不超 complexity 上限; 全部 state/handler 来自 useProjectRowActions。
function ProjectRowMenu({
  node,
  projectActions,
}: {
  node: ConversationTreeNode;
  projectActions: ProjectRowActions;
}) {
  const { t } = useTranslation();
  return (
    <>
      <ContextMenuContent side="bottom" align="end" minWidth={200}>
        <ContextMenuItem
          onSelect={projectActions.onTogglePin}
          leading={pinMenuIcon}
          testID={`conversation-tree-menu-pin-${node.id}`}
        >
          {projectActions.isPinned
            ? t("sidebar.project.actions.unpin")
            : t("sidebar.project.actions.pin")}
        </ContextMenuItem>
        {projectActions.canReveal ? (
          <ContextMenuItem
            onSelect={projectActions.onReveal}
            leading={revealMenuIcon}
            testID={`conversation-tree-menu-reveal-${node.id}`}
          >
            {t("sidebar.project.actions.revealInFinder")}
          </ContextMenuItem>
        ) : null}
        {projectActions.canCreateWorktree ? (
          <ContextMenuItem
            onSelect={projectActions.onCreateWorktree}
            leading={worktreeMenuIcon}
            testID={`conversation-tree-menu-worktree-${node.id}`}
          >
            {t("sidebar.project.actions.createWorktree")}
          </ContextMenuItem>
        ) : null}
        <ContextMenuItem
          onSelect={projectActions.onOpenRename}
          leading={renameMenuIcon}
          testID={`conversation-tree-menu-rename-project-${node.id}`}
        >
          {t("sidebar.project.actions.renameProject")}
        </ContextMenuItem>
        {/* "归档对话" 项目级语义待定, 暂以 disabled 呈现(对照 Codex #40 的灰态)。 */}
        <ContextMenuItem
          disabled
          leading={archiveMenuIcon}
          testID={`conversation-tree-menu-archive-${node.id}`}
        >
          {t("sidebar.project.actions.archive")}
        </ContextMenuItem>
        <ContextMenuItem
          onSelect={projectActions.onRemove}
          leading={removeMenuIcon}
          destructive
          status={projectActions.isRemoving ? "pending" : "idle"}
          pendingLabel={t("sidebar.project.actions.removing")}
          testID={`conversation-tree-menu-remove-${node.id}`}
        >
          {t("sidebar.project.actions.remove")}
        </ContextMenuItem>
      </ContextMenuContent>
      <AdaptiveRenameModal
        visible={projectActions.isRenameOpen}
        title={t("sidebar.project.actions.renameProject")}
        initialValue={node.title}
        placeholder={node.title}
        onClose={projectActions.onCloseRename}
        onSubmit={projectActions.onSubmitRename}
        testID={`conversation-tree-project-rename-modal-${node.id}`}
      />
    </>
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
    // "项目"/"对话" 标题加大(反馈: 这两个字体太小了)。
    fontSize: 13,
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
    fontSize: 13,
    color: theme.colors.foregroundMuted,
  },
  // 项目展开后无对话的"暂无对话"提示, 缩进到项目下一层(反馈)。
  emptyHintProject: {
    paddingLeft: ROW_BASE_PADDING + INDENT_PER_DEPTH + 22,
    paddingVertical: 6,
    fontSize: 13,
    color: theme.colors.foregroundMuted,
  },
  // Hover 靶容器(plain View): 只负责 onPointerEnter/Leave 检测, 不参与布局(docs/hover.md canonical)。
  rowHoverTracker: {
    position: "relative",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingRight: 8,
    paddingVertical: 6,
    // 行 pitch 归一化(pitch/字高)≈ Codex 2.2; 30 这档就对齐 Codex, 不再加大。
    minHeight: 30,
    borderRadius: theme.borderRadius.md,
    // 行尾 action 绝对定位的锚点(反馈: hover 不变宽)。
    position: "relative",
  },
  rowHovered: {
    backgroundColor: theme.colors.surfaceSidebarHover,
  },
  rowSelected: {
    // 选中背景与 hover 一致(反馈: 单击选中, 背景跟悬浮背景色一致)。
    backgroundColor: theme.colors.surfaceSidebarHover,
  },
  chevronButton: {
    width: 14,
    height: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  // 不可展开行的 chevron 占位,等宽 chevronButton,保持主图标与可展开行左对齐(反馈: chevron 前置)。
  chevronSpacer: {
    width: 14,
    height: 14,
  },
  rowAction: {
    // 绝对定位, 不占行内布局: hover 出现/消失不改变行宽(反馈: 悬浮变宽); 落在行 hover 区内 →
    // 移上去 hover 不丢失, 可点(反馈: 新增对话图标一悬浮就没、选不中)。
    position: "absolute",
    right: 8,
    top: 0,
    bottom: 0,
    width: 22,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.borderRadius.sm,
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
    // 界面默认正文 14(反馈: 默认界面字体 14px); 之前硬编码 13 偏小且不统一。
    fontSize: theme.fontSize.sm,
    // 默认深色, 对齐 Codex(反馈: 字体颜色对照 codex); 选中态靠底色区分。
    color: theme.colors.foreground,
  },
  rowNameSelected: {
    flex: 1,
    minWidth: 0,
    fontSize: theme.fontSize.sm,
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
