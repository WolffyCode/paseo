import { observer } from "mobx-react-lite";
import {
  Bot,
  ChevronDown,
  ChevronRight,
  Folder,
  MoreHorizontal,
  PenLine,
} from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { themeModel } from "../../theme/theme-model";
import type { ConversationTreeStore } from "../model/conversation-tree-store";
import type {
  ConversationStatusDot,
  ConversationTreeNode,
  ConversationTreeRow as ConversationTreeRowModel,
  Editing,
} from "../model/types";
import { resolveNodeWorkspace } from "./project-workspace";
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
const HOVER_CARD_CLOSE_DELAY_MS = 140;
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
}: {
  row: ConversationTreeRowModel;
  store: ConversationTreeStore;
  isOffline: boolean;
  isContextTarget: boolean;
  onOpenMenu: (target: ConversationTreeMenuTarget) => void;
}) {
  const { node } = row;
  const tk = themeModel.tokens;
  const rowRef = useRef<View | null>(null);
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [hoverCardOpen, setHoverCardOpen] = useState(false);
  const selected = store.isRowSelected(node);
  const inlineEditing = isEditingRow(node, store.editing);
  const highlighted = selected || isContextTarget;
  const workspace =
    node.kind === "conversation" ? resolveNodeWorkspace(node, store.workspaceDetails) : null;

  useEffect(() => {
    return () => {
      if (openTimer.current !== null) clearTimeout(openTimer.current);
      if (closeTimer.current !== null) clearTimeout(closeTimer.current);
    };
  }, []);

  const cancelHoverClose = useCallback(() => {
    if (closeTimer.current !== null) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);
  const openHoverCard = useCallback(() => {
    if (workspace === null || !isWeb) return;
    cancelHoverClose();
    if (openTimer.current !== null) clearTimeout(openTimer.current);
    openTimer.current = setTimeout(() => {
      setHoverCardOpen(true);
      openTimer.current = null;
    }, HOVER_CARD_OPEN_DELAY_MS);
  }, [cancelHoverClose, workspace]);
  const closeHoverCard = useCallback(() => {
    if (openTimer.current !== null) {
      clearTimeout(openTimer.current);
      openTimer.current = null;
    }
    if (closeTimer.current !== null) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => {
      setHoverCardOpen(false);
      closeTimer.current = null;
    }, HOVER_CARD_CLOSE_DELAY_MS);
  }, []);

  const rowStyle = useMemo(
    () => [
      styles.row,
      {
        paddingLeft: 8 + Math.min(row.depth, MAX_VISUAL_DEPTH) * INDENT_PER_DEPTH,
        backgroundColor: highlighted ? tk.toggleActive : "transparent",
      },
    ],
    [highlighted, row.depth, tk.toggleActive],
  );
  const titleStyle = useMemo(() => [styles.title, { color: tk.foreground }], [tk.foreground]);
  const badgeStyle = useMemo(
    () => [styles.badge, { color: tk.foregroundMuted, backgroundColor: tk.toggleActive }],
    [tk.foregroundMuted, tk.toggleActive],
  );
  const trailingActionStyle = useMemo(
    () => [styles.trailingAction, { opacity: isNative ? 1 : 0 }],
    [],
  );
  const rowAccessibilityState = useMemo(
    () => ({ selected, expanded: row.canExpand ? row.isExpanded : undefined }),
    [row.canExpand, row.isExpanded, selected],
  );
  const actionAccessibilityState = useMemo(
    () => ({ disabled: node.kind === "project" && isOffline }),
    [isOffline, node.kind],
  );

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
      <View onPointerEnter={openHoverCard} onPointerLeave={closeHoverCard}>
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
          <NodeIcon node={node} />
          {inlineEditing ? (
            <InlineRenameInput store={store} node={node} />
          ) : (
            <>
              {node.kind === "project" ? null : (
                <StatusDot status={node.statusDot} nodeId={node.id} />
              )}
              <Text numberOfLines={1} style={titleStyle}>
                {node.title}
              </Text>
              {node.kind === "project" || node.subagentCount === 0 ? null : (
                <Text
                  dataSet={CONVERSATION_BADGE_DATASET}
                  style={badgeStyle}
                  testID={`conv-tree-badge-${node.id}`}
                >
                  {node.subagentCount}
                </Text>
              )}
            </>
          )}
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
          onHoverIn={cancelHoverClose}
          onHoverOut={closeHoverCard}
        />
      )}
    </>
  );
});

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

function NodeIcon({ node }: { node: ConversationTreeNode }) {
  const tk = themeModel.tokens;
  const Icon = node.kind === "project" ? Folder : Bot;
  const size = node.kind === "subagent" ? 14 : 16;
  return (
    <View style={styles.icon}>
      <Icon size={size} color={tk.foregroundMuted} />
    </View>
  );
}

function StatusDot({ status, nodeId }: { status: ConversationStatusDot; nodeId: string }) {
  const tk = themeModel.tokens;
  const palette = STATUS_PALETTE[status](tk);
  const dataSet = useMemo(() => ({ status }), [status]);
  const dotStyle = useMemo(
    () => [styles.statusDot, { backgroundColor: palette.fill }, palette.ring],
    [palette.fill, palette.ring],
  );
  return <View dataSet={dataSet} style={dotStyle} testID={`conv-tree-status-${nodeId}`} />;
}

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

function isEditingRow(node: ConversationTreeNode, editing: Editing): boolean {
  if (editing === null || editing.targetId !== node.id) return false;
  return (
    (editing.kind === "project" && node.kind === "project") ||
    (editing.kind === "conversation" && node.kind !== "project")
  );
}

type ShellPalette = (typeof themeModel)["tokens"];
const STATUS_PALETTE: Record<
  ConversationStatusDot,
  (tokens: ShellPalette) => { fill: string; ring: object | null }
> = {
  running: (tokens) => ({
    fill: tokens.statusSuccess,
    ring: { shadowColor: tokens.statusSuccess, shadowOpacity: 0.4, shadowRadius: 3 },
  }),
  needsAttention: (tokens) => ({
    fill: tokens.statusWarning,
    ring: { shadowColor: tokens.statusWarning, shadowOpacity: 0.45, shadowRadius: 3 },
  }),
  idle: (tokens) => ({ fill: tokens.foregroundMuted, ring: null }),
  error: (tokens) => ({ fill: tokens.statusDanger, ring: null }),
  initializing: (tokens) => ({
    fill: tokens.accent,
    ring: { shadowColor: tokens.accent, shadowOpacity: 0.4, shadowRadius: 3 },
  }),
};

const styles = StyleSheet.create({
  row: {
    height: 30,
    paddingRight: 8,
    borderRadius: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    position: "relative",
  },
  chevron: { width: 14, height: 20, alignItems: "center", justifyContent: "center" },
  icon: { width: 16, height: 16, alignItems: "center", justifyContent: "center" },
  title: { flex: 1, minWidth: 0, fontSize: 13.5 },
  statusDot: { width: 7, height: 7, borderRadius: 9999, flexShrink: 0 },
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
