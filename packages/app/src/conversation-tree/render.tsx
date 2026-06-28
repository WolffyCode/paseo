import { usePathname } from "expo-router";
import {
  Archive,
  Bot,
  ChevronRight,
  Circle,
  Copy,
  ExternalLink,
  Folder,
  FolderOpen,
  FolderPlus,
  GitBranch,
  GitFork,
  Link2,
  MoreHorizontal,
  Pencil,
  Pin,
  SquarePen,
  Trash2,
} from "lucide-react-native";
import { useCallback, useMemo, useRef, useState } from "react";
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
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import type {
  SidebarProjectEntry,
  SidebarWorkspaceEntry,
} from "@/hooks/sidebar-workspaces-view-model";
import { WorkspaceHoverCard } from "@/components/workspace-hover-card";
import { createSidebarWorkspaceEntry } from "@/hooks/use-sidebar-workspaces-list";
import { useActiveWorkspaceSelection } from "@/stores/navigation-active-workspace-store";
import { useSessionStore } from "@/stores/session-store";
import { useSidebarCollapsedSectionsStore } from "@/stores/sidebar-collapsed-sections-store";
import { useSidebarPinsStore } from "@/stores/sidebar-pins-store";
import type { Theme } from "@/styles/theme";
import { navigateToAgent } from "@/utils/navigate-to-agent";
import { normalizeWorkspaceOpaqueId } from "@/utils/workspace-identity";
import { type ProjectRowActions, useProjectRowActions } from "./use-project-row-actions";
import {
  type ConversationRowActions,
  useConversationRowActions,
} from "./use-conversation-row-actions";
import {
  buildConversationTree,
  type ConversationTreeProject,
  flattenConversationTreeRows,
  partitionPinnedNodes,
} from "./select";
import type { ConversationTreeNode, ConversationTreeRow } from "./types";

// Render-depth cap. The data layer (select.ts) fills the full recursion; this only bounds how deep
// the tree renders. Set high so 主子孙 agents nest effectively without limit (阶段2: 对话下还有对话
// / agent 下有 subagent, 无限嵌套, 还含 paseo run 调起的其他 CLI 子 agent); the constant only guards
// against pathological recursion depth.
export const MAX_RENDER_DEPTH = 64;
const INDENT_PER_DEPTH = 14;
// Indentation stops growing past this depth so very deep subtrees stay within the sidebar width
// (the nesting still renders — only the left inset is clamped)。
const MAX_INDENT_DEPTH = 8;
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
const ThemedCircle = withUnistyles(Circle);
const ThemedCopy = withUnistyles(Copy);
const ThemedExternalLink = withUnistyles(ExternalLink);
const ThemedGitFork = withUnistyles(GitFork);
const ThemedLink2 = withUnistyles(Link2);

const mutedIconColor = (theme: Theme) => ({ color: theme.colors.foregroundMuted });

// Menu-item leading icons (module-level so they aren't re-created per row — react-perf).
const renameMenuIcon = <ThemedPencil size={16} uniProps={mutedIconColor} />;
const pinMenuIcon = <ThemedPin size={16} uniProps={mutedIconColor} />;
const revealMenuIcon = <ThemedFolderOpen size={16} uniProps={mutedIconColor} />;
const worktreeMenuIcon = <ThemedGitBranch size={16} uniProps={mutedIconColor} />;
const archiveMenuIcon = <ThemedArchive size={16} uniProps={mutedIconColor} />;
const removeMenuIcon = <ThemedTrash2 size={16} uniProps={mutedIconColor} />;
// Conversation-menu (Codex #45) leading icons.
const markUnreadMenuIcon = <ThemedCircle size={16} uniProps={mutedIconColor} />;
const copyMenuIcon = <ThemedCopy size={16} uniProps={mutedIconColor} />;
const deepLinkMenuIcon = <ThemedLink2 size={16} uniProps={mutedIconColor} />;
const forkLocalMenuIcon = <ThemedGitFork size={16} uniProps={mutedIconColor} />;
const openInNewWindowMenuIcon = <ThemedExternalLink size={16} uniProps={mutedIconColor} />;

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
  // Live workspace descriptors — the sidebar `projects` snapshot revalidates async, so a rename
  // (setWorkspaceTitle) wouldn't surface there for a while; the live store updates immediately
  // (same source the title bar uses). 反馈: 对话重命名保存后名称不变。
  const workspacesMap = useSessionStore((state) =>
    serverId ? state.sessions[serverId]?.workspaces : undefined,
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
  // workspaceId → 显示名(用户 rename 的 title 优先, 否则 name); 喂给树让顶层对话标题反映 rename。
  const workspaceDisplayById = useMemo(() => {
    const map = new Map<string, string>();
    // Base layer: the sidebar projects snapshot (covers every listed workspace).
    for (const project of projects) {
      for (const workspace of project.workspaces) {
        const display = workspace.title?.trim() || workspace.name;
        const key = normalizeWorkspaceOpaqueId(workspace.workspaceId);
        if (key && display.length > 0) map.set(key, display);
      }
    }
    // Override with the LIVE descriptor title so a rename reflects instantly (反馈: 保存不生效)。
    if (workspacesMap) {
      for (const [workspaceId, descriptor] of workspacesMap) {
        const display = descriptor.title?.trim() || descriptor.name;
        const key = normalizeWorkspaceOpaqueId(workspaceId);
        if (key && display && display.length > 0) map.set(key, display);
      }
    }
    return map;
  }, [projects, workspacesMap]);
  // workspaceId → 完整 workspace entry(供对话行 hover 右侧卡片显示标题/目录/分支/最后更改时间, 反馈 #48)。
  const workspaceEntryById = useMemo(() => {
    const map = new Map<string, SidebarWorkspaceEntry>();
    // Base: projects snapshot (covers workspaces not yet in the live descriptor map)。
    for (const project of projects) {
      for (const workspace of project.workspaces) {
        const key = normalizeWorkspaceOpaqueId(workspace.workspaceId);
        if (key) map.set(key, workspace);
      }
    }
    // Override with a LIVE entry built from the descriptor so the card shows fresh 标题/目录/分支/
    // 最后更改时间 —— the projects snapshot lags (same staleness as title; 反馈 #48)。
    if (workspacesMap && serverId) {
      for (const [workspaceId, descriptor] of workspacesMap) {
        const key = normalizeWorkspaceOpaqueId(workspaceId);
        if (key) {
          map.set(key, createSidebarWorkspaceEntry({ serverId, workspace: descriptor, agents }));
        }
      }
    }
    return map;
  }, [projects, workspacesMap, serverId, agents]);
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
        ? buildConversationTree({
            serverId,
            agents: agentList,
            projects: treeProjects,
            workspaceDisplayById,
          })
        : [],
    [serverId, agentList, treeProjects, workspaceDisplayById],
  );

  const projectNodes = useMemo(() => tree.filter((node) => node.kind === "project"), [tree]);
  const looseNodes = useMemo(() => tree.filter((node) => node.kind === "conversation"), [tree]);
  // 置顶分组(反馈 #12 + 对话右键置顶): 置顶项目整棵进「置顶」, 置顶对话(项目下或游离)提升进「置顶」,
  // 其余留「项目」/「对话」。读 pin store → 置顶状态变化时分组实时刷新。
  const pinnedTargets = useSidebarPinsStore((state) =>
    serverId ? state.pinnedByServerId[serverId] : undefined,
  );
  const { pinnedNodes, unpinnedProjectNodes, unpinnedLooseNodes } = useMemo(
    () => partitionPinnedNodes({ projectNodes, looseNodes, pinnedTargets }),
    [projectNodes, looseNodes, pinnedTargets],
  );
  const flattenOptions = useMemo(
    () => ({ collapsedProjectKeys, collapsedConversationIds, maxDepth: MAX_RENDER_DEPTH }),
    [collapsedProjectKeys, collapsedConversationIds],
  );
  const pinnedRows = useMemo(
    () => flattenConversationTreeRows(pinnedNodes, flattenOptions),
    [pinnedNodes, flattenOptions],
  );
  const projectRows = useMemo(
    () => flattenConversationTreeRows(unpinnedProjectNodes, flattenOptions),
    [unpinnedProjectNodes, flattenOptions],
  );
  const looseRows = useMemo(
    () => flattenConversationTreeRows(unpinnedLooseNodes, flattenOptions),
    [unpinnedLooseNodes, flattenOptions],
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
      navigateToAgent({
        serverId: node.serverId,
        agentId: node.id,
        currentPathname: pathname,
        // Subagents (observed mirrors + child conversations) open in the right tool
        // panel; the main pane stays the single root conversation, switched here in
        // the tree rather than via canvas tabs.
        surface: node.kind === "subagent" ? "right" : undefined,
      });
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
      workspaceEntry={
        row.node.kind === "project" || !row.node.workspaceId
          ? undefined
          : workspaceEntryById.get(row.node.workspaceId)
      }
    />
  );

  // 项目行展开但无对话 → 紧跟一行"暂无对话"(反馈: 目录下没对话应展示暂无对话, 对齐 Codex)。
  // 置顶组与项目组共用此渲染(两者都可能含项目节点)。
  const renderProjectRows = (rows: ConversationTreeRow[]) =>
    rows.flatMap((row) => {
      const rowElement = renderRow(row);
      if (row.node.kind === "project" && row.isExpanded && row.node.children.length === 0) {
        return [
          rowElement,
          <Text key={`empty-${row.node.id}`} style={styles.emptyHintProject}>
            {t("sidebar.sections.noConversations")}
          </Text>,
        ];
      }
      return rowElement;
    });

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
      testID="conversation-tree"
    >
      {/* 置顶组(反馈 #12): 仅在有置顶项时出现, 排在「项目」之上。 */}
      {pinnedRows.length > 0 ? (
        <>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{t("sidebar.sections.pinned")}</Text>
          </View>
          {renderProjectRows(pinnedRows)}
        </>
      ) : null}

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
      {renderProjectRows(projectRows)}

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
  workspaceEntry,
}: {
  row: ConversationTreeRow;
  selected: boolean;
  onSelectAgent: (node: ConversationTreeNode) => void;
  onToggleProject: (projectKey: string) => void;
  onToggleConversation: (conversationId: string) => void;
  onNewConversation: (projectKey: string) => void;
  projectWorkingDir?: string;
  /** Conversation rows only: full workspace entry backing the hover card (标题/目录/分支/最后更改时间)。 */
  workspaceEntry?: SidebarWorkspaceEntry;
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
    () => ({
      paddingLeft: ROW_BASE_PADDING + Math.min(depth, MAX_INDENT_DEPTH) * INDENT_PER_DEPTH,
    }),
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

  // 对话行右键菜单 + 双击重命名的全部 model(项目行也无条件调用但只在非项目行使用 —— hooks 规则)。
  const conversationActions = useConversationRowActions({
    serverId: node.serverId,
    agentId: node.id,
    workspaceId: node.workspaceId,
  });
  const lastTapRef = useRef(0);
  const handleRowPress = useCallback(() => {
    const now = Date.now();
    if (!isProject && node.workspaceId && now - lastTapRef.current < 300) {
      conversationActions.onOpenRename();
    } else {
      handlePress();
    }
    lastTapRef.current = now;
  }, [handlePress, isProject, node.workspaceId, conversationActions]);

  const rowBody = (
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
          <ConversationRowMenu node={node} actions={conversationActions} />
        )}
      </ContextMenu>
    </View>
  );

  // 对话行外层包一层 WorkspaceHoverCard —— web 桌面 hover 时右侧浮出标题/目录/分支/最后更改时间卡片
  // (反馈 #48); native/compact 上透传, 项目行或无 entry(如游离会话)时不包裹。
  if (!isProject && workspaceEntry) {
    return (
      <WorkspaceHoverCard
        workspace={workspaceEntry}
        prHint={workspaceEntry.prHint}
        isDragging={false}
      >
        {rowBody}
      </WorkspaceHoverCard>
    );
  }
  return rowBody;
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
      <ContextMenuContent side="bottom" align="start" minWidth={200}>
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
        description={t("renameModal.keepShort")}
        initialValue={node.title}
        placeholder={node.title}
        submitLabel={t("renameModal.save")}
        onClose={projectActions.onCloseRename}
        onSubmit={projectActions.onSubmitRename}
        testID={`conversation-tree-project-rename-modal-${node.id}`}
      />
    </>
  );
}

// 对话(会话)行右键菜单 —— 对照 Codex #45。功能项: 置顶 / 重命名 / 在 Finder 显示 / 复制会话 ID /
// 在新窗口打开; 占位项(disabled, 语义或能力待定, 董事长指示先占位): 归档 / 标记为未读 / 复制工作目录 /
// 复制深度链接 / 派生到本地 / 派生到新工作树。全部 state/handler 来自 useConversationRowActions。
function ConversationRowMenu({
  node,
  actions,
}: {
  node: ConversationTreeNode;
  actions: ConversationRowActions;
}) {
  const { t } = useTranslation();
  return (
    <>
      <ContextMenuContent side="bottom" align="start" minWidth={220}>
        {actions.hasWorkspace ? (
          <ContextMenuItem
            onSelect={actions.onTogglePin}
            leading={pinMenuIcon}
            testID={`conversation-tree-menu-pin-${node.id}`}
          >
            {actions.isPinned
              ? t("sidebar.conversation.actions.unpin")
              : t("sidebar.conversation.actions.pin")}
          </ContextMenuItem>
        ) : null}
        {actions.hasWorkspace ? (
          <ContextMenuItem
            onSelect={actions.onOpenRename}
            leading={renameMenuIcon}
            testID={`conversation-tree-menu-rename-${node.id}`}
          >
            {t("sidebar.conversation.actions.rename")}
          </ContextMenuItem>
        ) : null}
        {/* 归档对话: 大功能(归档记录 + 按会话 id 恢复最新会话内容)单独一轮, 先占位。 */}
        <ContextMenuItem
          disabled
          leading={archiveMenuIcon}
          testID={`conversation-tree-menu-archive-${node.id}`}
        >
          {t("sidebar.conversation.actions.archive")}
        </ContextMenuItem>
        {/* 标记为未读: 现仅有 clearWorkspaceAttention(标记已读), 无 raise-attention 能力, 先占位。 */}
        <ContextMenuItem
          disabled
          leading={markUnreadMenuIcon}
          testID={`conversation-tree-menu-mark-unread-${node.id}`}
        >
          {t("sidebar.conversation.actions.markUnread")}
        </ContextMenuItem>
        <ContextMenuSeparator />
        {actions.canReveal ? (
          <ContextMenuItem
            onSelect={actions.onReveal}
            leading={revealMenuIcon}
            testID={`conversation-tree-menu-reveal-${node.id}`}
          >
            {t("sidebar.conversation.actions.revealInFinder")}
          </ContextMenuItem>
        ) : null}
        {/* 复制工作目录: 语义待定(董事长), 先占位。 */}
        <ContextMenuItem
          disabled
          leading={copyMenuIcon}
          testID={`conversation-tree-menu-copy-dir-${node.id}`}
        >
          {t("sidebar.conversation.actions.copyWorkingDir")}
        </ContextMenuItem>
        <ContextMenuItem
          onSelect={actions.onCopyConversationId}
          leading={copyMenuIcon}
          testID={`conversation-tree-menu-copy-id-${node.id}`}
        >
          {t("sidebar.conversation.actions.copyConversationId")}
        </ContextMenuItem>
        {/* 复制深度链接: 语义待定(董事长), 先占位。 */}
        <ContextMenuItem
          disabled
          leading={deepLinkMenuIcon}
          testID={`conversation-tree-menu-copy-deep-link-${node.id}`}
        >
          {t("sidebar.conversation.actions.copyDeepLink")}
        </ContextMenuItem>
        <ContextMenuSeparator />
        {/* 派生到本地 / 派生到新工作树: 语义待定(董事长), 先占位。 */}
        <ContextMenuItem
          disabled
          leading={forkLocalMenuIcon}
          testID={`conversation-tree-menu-fork-local-${node.id}`}
        >
          {t("sidebar.conversation.actions.forkToLocal")}
        </ContextMenuItem>
        <ContextMenuItem
          disabled
          leading={worktreeMenuIcon}
          testID={`conversation-tree-menu-fork-worktree-${node.id}`}
        >
          {t("sidebar.conversation.actions.forkToWorktree")}
        </ContextMenuItem>
        {actions.canOpenInNewWindow ? (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem
              onSelect={actions.onOpenInNewWindow}
              leading={openInNewWindowMenuIcon}
              testID={`conversation-tree-menu-open-new-window-${node.id}`}
            >
              {t("sidebar.conversation.actions.openInNewWindow")}
            </ContextMenuItem>
          </>
        ) : null}
      </ContextMenuContent>
      {node.workspaceId ? (
        <AdaptiveRenameModal
          visible={actions.isRenameOpen}
          title={t("sidebar.conversation.actions.rename")}
          description={t("renameModal.keepShort")}
          initialValue={node.title}
          placeholder={node.title}
          submitLabel={t("renameModal.save")}
          onClose={actions.onCloseRename}
          onSubmit={actions.onSubmitRename}
          testID={`conversation-rename-modal-${node.id}`}
        />
      ) : null}
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
    // 相邻行(选中对话 + hover 项目)的背景之间留 1px 间隔(反馈)。
    marginBottom: 1,
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
