import { observer } from "mobx-react-lite";
import {
  ChevronDown,
  ChevronRight,
  Folder,
  GitBranch,
  MoreHorizontal,
  PenLine,
} from "lucide-react-native";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";
import {
  type GestureResponderEvent,
  type NativeSyntheticEvent,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  type TextInputKeyPressEventData,
  View,
} from "react-native";
import { isNative, isWeb } from "@/constants/platform";
import { ClaudeIcon } from "@/components/icons/claude-icon";
import { CodexIcon } from "@/components/icons/codex-icon";
import { CopilotIcon } from "@/components/icons/copilot-icon";
import { OpenCodeIcon } from "@/components/icons/opencode-icon";
import { PiIcon } from "@/components/icons/pi-icon";
import { themeModel } from "../../theme/theme-model";
import type { ConversationTreeStore } from "../model/conversation-tree-store";
import type {
  ConversationAttentionKind,
  ConversationRunStatus,
  ConversationTreeNode,
  ConversationTreeProjectNode,
  ConversationTreeConversationNode,
  ConversationTreeRow as ConversationTreeRowModel,
  ConversationTreeSubagentNode,
  Editing,
} from "../model/types";
import { conversationStatusLabelText } from "../model/run-status";
import { formatRelative } from "../model/relative-time";
import { resolveProviderBadge, type ProviderIconKey } from "../model/provider-label";
import { resolveNodeWorkspace } from "./project-workspace";
import { ROW_HEIGHTS } from "./row-metrics";
import {
  CONVERSATION_ACTION_DATASET,
  CONVERSATION_BADGE_DATASET,
  CONVERSATION_ROW_DATASET,
  CONVERSATION_ROW_HOVER_DATASET,
} from "./row-hover-css";
import type { ConversationTreeMenuTarget } from "./tree-context-menu";
import { WorkspaceHoverCard } from "./workspace-hover-card";

const INDENT_PER_DEPTH = 14;
const MAX_VISUAL_DEPTH = 8;
const HOVER_CARD_OPEN_DELAY_MS = 350;
const WEB_INPUT_STYLE = (isWeb ? { outlineStyle: "none", userSelect: "text" } : null) as
  | object
  | null;

/** Render one flattened row and dispatch only named store transitions. */
export const ConversationTreeRow = observer(function ConversationTreeRow({
  row,
  store,
  isOffline,
  isContextTarget,
  onOpenMenu,
  nowMs,
}: {
  row: ConversationTreeRowModel;
  store: ConversationTreeStore;
  isOffline: boolean;
  isContextTarget: boolean;
  onOpenMenu: (target: ConversationTreeMenuTarget) => void;
  nowMs: number;
}) {
  const { node } = row;
  const tk = themeModel.tokens;
  const rowRef = useRef<View | null>(null);
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [hoverCardOpen, setHoverCardOpen] = useState(false);
  const selected = store.isRowSelected(node);
  const inlineEditing = isEditingRow(node, store.editing);
  const highlighted = selected || isContextTarget;
  const workspace =
    node.kind === "conversation" ? resolveNodeWorkspace(node, store.workspaceDetails) : null;

  useEffect(() => {
    return () => {
      if (openTimer.current !== null) clearTimeout(openTimer.current);
    };
  }, []);

  // Opening is a fixed grace delay off row hover. Closing is not this row's call —
  // once open, WorkspaceHoverCard tracks its own trigger→content safe zone and asks
  // to close via onRequestClose (see workspace-hover-card.tsx's useHoverSafeZone).
  const openHoverCard = useCallback(() => {
    if (workspace === null || !isWeb || hoverCardOpen) return;
    if (openTimer.current !== null) clearTimeout(openTimer.current);
    openTimer.current = setTimeout(() => {
      setHoverCardOpen(true);
      openTimer.current = null;
    }, HOVER_CARD_OPEN_DELAY_MS);
  }, [hoverCardOpen, workspace]);
  const cancelHoverCardOpen = useCallback(() => {
    if (openTimer.current !== null) {
      clearTimeout(openTimer.current);
      openTimer.current = null;
    }
  }, []);
  const closeHoverCard = useCallback(() => setHoverCardOpen(false), []);

  const rowStyle = useMemo(
    () => [
      styles.row,
      {
        alignItems: node.kind === "subagent" ? ("center" as const) : ("flex-start" as const),
        height: ROW_HEIGHTS[node.kind],
        paddingLeft: 8 + Math.min(row.depth, MAX_VISUAL_DEPTH) * INDENT_PER_DEPTH,
        paddingVertical: node.kind === "subagent" ? 0 : 6,
        backgroundColor: highlighted ? tk.toggleActive : "transparent",
      },
    ],
    [highlighted, node.kind, row.depth, tk.toggleActive],
  );
  const titleStyle = useMemo(() => [styles.title, { color: tk.foreground }], [tk.foreground]);
  const badgeStyle = useMemo(
    () => [styles.badge, { color: tk.foregroundMuted, backgroundColor: tk.toggleActive }],
    [tk.foregroundMuted, tk.toggleActive],
  );
  const trailingActionStyle = useMemo(
    () => [
      styles.trailingAction,
      { opacity: isNative ? 1 : 0, top: ROW_HEIGHTS[node.kind] / 2 - 11 },
    ],
    [node.kind],
  );
  const rowAccessibilityState = useMemo(
    () => ({ selected, expanded: row.canExpand ? row.isExpanded : undefined }),
    [row.canExpand, row.isExpanded, selected],
  );
  const actionAccessibilityState = useMemo(
    () => ({ disabled: node.kind === "project" && isOffline }),
    [isOffline, node.kind],
  );
  let rowContent: ReactNode;
  if (inlineEditing) {
    rowContent = (
      <>
        {node.kind === "project" ? <Folder size={14} color={tk.foregroundMuted} /> : null}
        <InlineRenameInput store={store} node={node} />
      </>
    );
  } else if (node.kind === "project") {
    rowContent = <ProjectRowContent node={node} titleStyle={titleStyle} />;
  } else if (node.kind === "conversation") {
    rowContent = <ConversationRowContent node={node} nowMs={nowMs} titleStyle={titleStyle} />;
  } else {
    rowContent = <SubagentRowContent node={node} badgeStyle={badgeStyle} />;
  }

  const activate = useCallback(() => {
    if (inlineEditing) return;
    if (node.kind === "project") {
      store.toggleProjectCollapse(node.id);
      return;
    }
    store.activateNode(node);
  }, [inlineEditing, node, store]);

  const toggleExpand = useCallback(
    (event: GestureResponderEvent) => {
      event.stopPropagation();
      if (node.kind === "project") {
        store.toggleProjectCollapse(node.id);
      } else {
        store.toggleExpand(node.id);
      }
    },
    [node, store],
  );

  const beginRename = useCallback(() => {
    if (isOffline || inlineEditing) return;
    if (node.kind === "project") {
      store.beginRename("project", node.id);
    } else if (node.kind === "conversation" && node.workspaceId !== null) {
      store.beginRename("conversation", node.id);
    }
  }, [inlineEditing, isOffline, node, store]);

  useEffect(() => {
    if (!isWeb) return;
    const element = rowRef.current as unknown as HTMLElement | null;
    if (element === null) return;
    const handleDoubleClick = (): void => beginRename();
    element.addEventListener("dblclick", handleDoubleClick);
    return () => element.removeEventListener("dblclick", handleDoubleClick);
  }, [beginRename]);

  const openMenuAtPoint = useCallback(
    (x: number, y: number) => {
      if (inlineEditing) return;
      setHoverCardOpen(false);
      onOpenMenu({ node, anchor: { x, y } });
    },
    [inlineEditing, node, onOpenMenu],
  );

  const onContextMenu = useCallback(
    (event: {
      nativeEvent?: { pageX?: number; pageY?: number; clientX?: number; clientY?: number };
      preventDefault?: () => void;
      stopPropagation?: () => void;
    }) => {
      event.preventDefault?.();
      event.stopPropagation?.();
      const native = event.nativeEvent;
      openMenuAtPoint(native?.pageX ?? native?.clientX ?? 0, native?.pageY ?? native?.clientY ?? 0);
    },
    [openMenuAtPoint],
  );

  const openMoreMenu = useCallback(
    (event: GestureResponderEvent) => {
      event.stopPropagation();
      openMenuAtPoint(event.nativeEvent.pageX, event.nativeEvent.pageY);
    },
    [openMenuAtPoint],
  );

  const openProjectConversation = useCallback(
    (event: GestureResponderEvent) => {
      event.stopPropagation();
      if (node.kind !== "project") return;
      const projectWorkspace = resolveNodeWorkspace(node, store.workspaceDetails);
      if (projectWorkspace === null) {
        store.openProjectPicker();
        return;
      }
      store.openProjectConversation({
        sourceDirectory: projectWorkspace.detail.directory,
        projectKey: node.id,
        projectName: node.title,
      });
    },
    [node, store],
  );

  return (
    <>
      {/* Hover lives on this plain View so nested Pressables (chevron, trailing
          action) never steal hover state from it — docs/hover.md Failure Mode 1. */}
      <View onPointerEnter={openHoverCard} onPointerLeave={cancelHoverCardOpen}>
        <Pressable
          ref={rowRef}
          accessibilityLabel={node.title}
          accessibilityState={rowAccessibilityState}
          dataSet={highlighted ? CONVERSATION_ROW_DATASET : CONVERSATION_ROW_HOVER_DATASET}
          onPress={activate}
          // @ts-expect-error onContextMenu is a guarded desktop-web interaction.
          onContextMenu={onContextMenu}
          style={rowStyle}
          testID={`conv-tree-row-${node.kind}-${node.id}`}
        >
          <TreeChevron row={row} onPress={toggleExpand} />
          {rowContent}
          {inlineEditing ? null : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={node.kind === "project" ? "在项目中发起新对话" : "更多操作"}
              accessibilityState={actionAccessibilityState}
              dataSet={CONVERSATION_ACTION_DATASET}
              disabled={node.kind === "project" && isOffline}
              onPress={node.kind === "project" ? openProjectConversation : openMoreMenu}
              style={trailingActionStyle}
              testID={
                node.kind === "project"
                  ? `conv-tree-project-new-${node.id}`
                  : `conv-tree-more-${node.id}`
              }
            >
              {node.kind === "project" ? (
                <PenLine size={13} color={tk.foregroundMuted} />
              ) : (
                <MoreHorizontal size={14} color={tk.foregroundMuted} />
              )}
            </Pressable>
          )}
        </Pressable>
      </View>
      {workspace === null || !hoverCardOpen ? null : (
        <WorkspaceHoverCard
          visible
          anchorRef={rowRef}
          workspaceId={workspace.workspaceId}
          title={node.title}
          detail={workspace.detail}
          onRequestClose={closeHoverCard}
        />
      )}
    </>
  );
});

/** Render the expand/collapse arrow, or a same-width blank spacer when the row can't expand. */
function TreeChevron({
  row,
  onPress,
}: {
  row: ConversationTreeRowModel;
  onPress: (event: GestureResponderEvent) => void;
}) {
  const tk = themeModel.tokens;
  if (!row.canExpand) {
    return <View style={styles.chevron} />;
  }
  const Icon = row.isExpanded ? ChevronDown : ChevronRight;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={row.isExpanded ? "收起" : "展开"}
      onPress={onPress}
      style={styles.chevron}
      testID={`conv-tree-chevron-${row.node.id}`}
    >
      <Icon size={13} color={tk.foregroundMuted} />
    </Pressable>
  );
}

/** Render a project row's folder title and main-checkout branch metadata as one interaction unit. */
function ProjectRowContent({
  node,
  titleStyle,
}: {
  node: ConversationTreeProjectNode;
  titleStyle: object;
}) {
  const tk = themeModel.tokens;
  const branchStyle = useMemo(
    () => [styles.metaText, { color: tk.foregroundMuted }],
    [tk.foregroundMuted],
  );
  const addedStyle = useMemo(
    () => [styles.diffText, { color: tk.statusSuccess }],
    [tk.statusSuccess],
  );
  const removedStyle = useMemo(
    () => [styles.diffText, { color: tk.statusDanger }],
    [tk.statusDanger],
  );
  const hasDiff =
    node.branch !== null &&
    node.diffStat !== null &&
    (node.diffStat.added !== 0 || node.diffStat.removed !== 0);
  return (
    <View style={styles.twoLineBody}>
      <View style={styles.firstLine}>
        <Folder size={14} color={tk.foregroundMuted} />
        <Text numberOfLines={1} style={titleStyle}>
          {node.title}
        </Text>
      </View>
      <View style={styles.metaLine}>
        <GitBranch size={12} color={tk.foregroundMuted} />
        <Text numberOfLines={1} style={branchStyle}>
          {node.branch ?? "暂无分支"}
        </Text>
        {hasDiff ? (
          <View style={styles.diffStat}>
            <Text style={addedStyle}>+{node.diffStat?.added}</Text>
            <Text style={removedStyle}>-{node.diffStat?.removed}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

/** Render a root conversation's title, recent activity, status label, and provider label. */
function ConversationRowContent({
  node,
  nowMs,
  titleStyle,
}: {
  node: ConversationTreeConversationNode;
  nowMs: number;
  titleStyle: object;
}) {
  const tk = themeModel.tokens;
  const timeStyle = useMemo(
    () => [styles.relativeTime, { color: tk.foregroundMuted }],
    [tk.foregroundMuted],
  );
  return (
    <View style={styles.twoLineBody}>
      <View style={styles.firstLine}>
        <Text numberOfLines={1} style={titleStyle}>
          {node.title}
        </Text>
        <Text numberOfLines={1} style={timeStyle} testID={`conv-tree-time-${node.id}`}>
          {formatRelative(node.updatedAt, nowMs)}
        </Text>
      </View>
      <View style={styles.tagLine}>
        <RunStatusTag
          nodeId={node.id}
          runStatus={node.runStatus}
          attentionKind={node.attentionKind}
        />
        <ProviderTag providerId={node.providerId} />
      </View>
    </View>
  );
}

/** Render a dense subagent row with its small status dot and descendant count. */
function SubagentRowContent({
  node,
  badgeStyle,
}: {
  node: ConversationTreeSubagentNode;
  badgeStyle: object;
}) {
  return (
    <View style={styles.singleLineBody}>
      <RunStatusDot runStatus={node.runStatus} nodeId={node.id} size={6} />
      <Text numberOfLines={1} style={styles.subagentTitle}>
        {node.title}
      </Text>
      {node.subagentCount === 0 ? null : (
        <Text
          dataSet={CONVERSATION_BADGE_DATASET}
          style={badgeStyle}
          testID={`conv-tree-badge-${node.id}`}
        >
          {node.subagentCount}
        </Text>
      )}
    </View>
  );
}

/** Render the provider-independent status label with the run-state color and breathing marker. */
function RunStatusTag({
  nodeId,
  runStatus,
  attentionKind,
}: {
  nodeId: string;
  runStatus: ConversationRunStatus;
  attentionKind: ConversationAttentionKind;
}) {
  const tk = themeModel.tokens;
  const palette = RUN_STATUS_PALETTE[runStatus](tk);
  const tagStyle = useMemo(
    () => [styles.statusTag, { backgroundColor: palette.background }],
    [palette.background],
  );
  const textStyle = useMemo(
    () => [styles.statusTagText, { color: palette.foreground }],
    [palette.foreground],
  );
  return (
    <View style={tagStyle} testID={`conv-tree-status-tag-${nodeId}`}>
      <RunStatusDot runStatus={runStatus} nodeId={`${nodeId}-tag`} size={5} />
      <Text numberOfLines={1} style={textStyle}>
        {conversationStatusLabelText(runStatus, attentionKind)}
      </Text>
    </View>
  );
}

/** Render one provider badge using the protocol catalog and the tree's shared icon components. */
function ProviderTag({ providerId }: { providerId: string }) {
  const tk = themeModel.tokens;
  const badge = resolveProviderBadge(providerId);
  const Icon = badge.icon === null ? null : PROVIDER_ICONS[badge.icon];
  const tagStyle = useMemo(
    () => [styles.providerTag, { backgroundColor: tk.toggleActive }],
    [tk.toggleActive],
  );
  const textStyle = useMemo(
    () => [styles.providerTagText, { color: tk.foregroundMuted }],
    [tk.foregroundMuted],
  );
  return (
    <View style={tagStyle} testID={`conv-tree-provider-${providerId}`}>
      {Icon === null ? null : <Icon size={10} color={tk.foregroundMuted} />}
      <Text numberOfLines={1} style={textStyle}>
        {badge.label}
      </Text>
    </View>
  );
}

/** Render a status dot with no halo; CSS applies the desktop breathing animation to active states. */
function RunStatusDot({
  runStatus,
  nodeId,
  size,
}: {
  runStatus: ConversationRunStatus;
  nodeId: string;
  size: number;
}) {
  const tk = themeModel.tokens;
  const palette = RUN_STATUS_PALETTE[runStatus](tk);
  const dataSet = useMemo(() => ({ status: runStatus }), [runStatus]);
  const dotStyle = useMemo(
    () => [styles.runStatus, { width: size, height: size, backgroundColor: palette.foreground }],
    [palette.foreground, size],
  );
  return <View dataSet={dataSet} style={dotStyle} testID={`conv-tree-status-${nodeId}`} />;
}

/** Render the focused rename textbox and dispatch the store's commit/cancel on submit/Escape. */
const InlineRenameInput = observer(function InlineRenameInput({
  store,
  node,
}: {
  store: ConversationTreeStore;
  node: ConversationTreeNode;
}) {
  const inputRef = useRef<TextInput | null>(null);
  const tk = themeModel.tokens;
  const editing = store.editing;
  const draftName = editing?.draftName ?? "";
  const hasError = editing?.error !== null;

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.setSelection?.(0, draftName.length);
    // Focus belongs to the editor's mount, not each observable draft update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const change = useCallback((value: string) => store.setDraftName(value), [store]);
  const submit = useCallback(() => void store.commitRename(), [store]);
  const blur = useCallback(() => {
    if (store.editing !== null) void store.commitRename();
  }, [store]);
  const keyPress = useCallback(
    (event: NativeSyntheticEvent<TextInputKeyPressEventData>) => {
      const native = event.nativeEvent as TextInputKeyPressEventData & {
        metaKey?: boolean;
        ctrlKey?: boolean;
      };
      if (native.metaKey || native.ctrlKey) return;
      if (native.key === "Escape") store.cancelRename();
    },
    [store],
  );
  const inputStyle = useMemo(
    () => [
      styles.renameInput,
      {
        color: tk.foreground,
        backgroundColor: tk.surfaceCard,
        borderColor: hasError ? tk.statusDanger : tk.accent,
        shadowColor: hasError ? tk.statusDanger : tk.accent,
      },
      WEB_INPUT_STYLE,
    ],
    [hasError, tk.accent, tk.foreground, tk.statusDanger, tk.surfaceCard],
  );
  return (
    <TextInput
      ref={inputRef}
      autoCapitalize="none"
      autoCorrect={false}
      blurOnSubmit={false}
      editable={!store.isCommittingRename}
      onBlur={blur}
      onChangeText={change}
      onKeyPress={keyPress}
      onSubmitEditing={submit}
      placeholder="请输入名称"
      placeholderTextColor={tk.foregroundMuted}
      selectTextOnFocus
      spellCheck={false}
      style={inputStyle}
      testID={`conv-tree-rename-input-${node.id}`}
      value={draftName}
    />
  );
});

/** Check whether this node is the one the store's inline-rename state currently targets. */
function isEditingRow(node: ConversationTreeNode, editing: Editing): boolean {
  if (editing === null || editing.targetId !== node.id) return false;
  return (
    (editing.kind === "project" && node.kind === "project") ||
    (editing.kind === "conversation" && node.kind !== "project")
  );
}

type ShellPalette = (typeof themeModel)["tokens"];
const RUN_STATUS_PALETTE: Record<
  ConversationRunStatus,
  (tokens: ShellPalette) => { foreground: string; background: string }
> = {
  running: (tokens) => ({ foreground: tokens.statusSuccess, background: tokens.statusSuccessSoft }),
  needsAttention: (tokens) => ({
    foreground: tokens.statusWarning,
    background: tokens.statusWarningSoft,
  }),
  idle: (tokens) => ({ foreground: tokens.foregroundMuted, background: tokens.toggleActive }),
  error: (tokens) => ({ foreground: tokens.statusDanger, background: tokens.statusDangerSoft }),
  initializing: (tokens) => ({ foreground: tokens.accent, background: tokens.accentSoft }),
};

const PROVIDER_ICONS: Record<ProviderIconKey, ComponentType<{ size?: number; color?: string }>> = {
  claude: ClaudeIcon,
  codex: CodexIcon,
  copilot: CopilotIcon,
  opencode: OpenCodeIcon,
  pi: PiIcon,
};

const styles = StyleSheet.create({
  row: {
    paddingRight: 8,
    borderRadius: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    position: "relative",
  },
  chevron: { width: 14, height: 20, alignItems: "center", justifyContent: "center" },
  title: { flex: 1, minWidth: 0, fontSize: 13.5, lineHeight: 18 },
  twoLineBody: { flex: 1, minWidth: 0, height: 36, gap: 2 },
  firstLine: { height: 18, flexDirection: "row", alignItems: "center", minWidth: 0, gap: 6 },
  metaLine: { height: 16, flexDirection: "row", alignItems: "center", minWidth: 0, gap: 5 },
  tagLine: { height: 16, flexDirection: "row", alignItems: "center", minWidth: 0, gap: 5 },
  singleLineBody: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 6 },
  subagentTitle: { flex: 1, minWidth: 0, fontSize: 13.5 },
  metaText: { flex: 1, minWidth: 0, fontSize: 11 },
  relativeTime: { flexShrink: 0, fontSize: 10, lineHeight: 15, fontVariant: ["tabular-nums"] },
  diffStat: { flexShrink: 0, flexDirection: "row", gap: 5 },
  diffText: { fontFamily: "monospace", fontSize: 11 },
  statusTag: {
    height: 16,
    paddingHorizontal: 6,
    borderRadius: 9999,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flexShrink: 0,
  },
  statusTagText: { fontSize: 10, fontWeight: "500", lineHeight: 16 },
  providerTag: {
    height: 16,
    maxWidth: 96,
    paddingHorizontal: 6,
    borderRadius: 9999,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flexShrink: 1,
  },
  providerTagText: { flexShrink: 1, fontSize: 10, fontWeight: "500", lineHeight: 16 },
  runStatus: { borderRadius: 9999, flexShrink: 0 },
  badge: {
    flexShrink: 0,
    minWidth: 18,
    height: 16,
    borderRadius: 9999,
    paddingHorizontal: 5,
    fontSize: 10,
    lineHeight: 16,
    textAlign: "center",
    fontVariant: ["tabular-nums"],
  },
  trailingAction: {
    position: "absolute",
    right: 6,
    top: 4,
    width: 22,
    height: 22,
    borderRadius: 5,
    alignItems: "center",
    justifyContent: "center",
  },
  renameInput: {
    flex: 1,
    minWidth: 0,
    height: 22,
    borderWidth: 1,
    borderRadius: 5,
    paddingHorizontal: 6,
    paddingVertical: 0,
    fontSize: 13,
    shadowOpacity: 0.22,
    shadowRadius: 3,
  },
});
