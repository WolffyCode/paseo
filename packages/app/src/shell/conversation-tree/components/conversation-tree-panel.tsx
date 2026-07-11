import { observer } from "mobx-react-lite";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FlatList, StyleSheet, View, type ListRenderItemInfo } from "react-native";
import { themeModel } from "../../theme/theme-model";
import type {
  ConversationTreePanelState,
  ConversationTreeStore,
} from "../model/conversation-tree-store";
import type { ConversationTreeRow as ConversationTreeRowModel } from "../model/types";
import { ConversationTreeRow } from "./tree-row";
import {
  ConversationTreeEmptyHint,
  ConversationTreeErrorState,
  ConversationTreeLoadingState,
} from "./tree-states";
import { TreeToolbar } from "./tree-toolbar";
import { TreeSectionHeader, type ConversationTreeSectionId } from "./tree-section-header";
import { TreeContextMenu, type ConversationTreeMenuTarget } from "./tree-context-menu";
import { ensureConversationTreeHoverCss } from "./row-hover-css";

const ITEM_HEIGHT = 30;

type PanelState = ConversationTreePanelState | "offline";
type PanelItem =
  | {
      readonly kind: "section";
      readonly key: string;
      readonly section: ConversationTreeSectionId;
      readonly actionAlwaysVisible: boolean;
    }
  | { readonly kind: "row"; readonly key: string; readonly row: ConversationTreeRowModel }
  | {
      readonly kind: "empty";
      readonly key: string;
      readonly indented: boolean;
      readonly testID: string;
    };

/** Compose the toolbar, virtualized groups, panel states, and transient row menu. */
export const ConversationTreePanel = observer(function ConversationTreePanel({
  store,
  isOffline,
}: {
  store: ConversationTreeStore;
  isOffline: boolean;
}) {
  const tk = themeModel.tokens;
  const [menuTarget, setMenuTarget] = useState<ConversationTreeMenuTarget | null>(null);
  const panelState: PanelState = isOffline ? "offline" : store.panelState;
  const canRenderTree =
    panelState === "ready" || panelState === "empty" || panelState === "offline";
  const effectiveMenuTarget = canRenderTree ? menuTarget : null;
  ensureConversationTreeHoverCss(tk.tabHover, tk.toggleActive);

  const openMenu = useCallback((target: ConversationTreeMenuTarget) => setMenuTarget(target), []);
  const closeMenu = useCallback(() => setMenuTarget(null), []);

  return (
    <View style={styles.panel} testID="conv-tree-panel">
      <TreeToolbar store={store} disabled={isOffline} />
      <PanelBody
        store={store}
        panelState={panelState}
        isOffline={isOffline}
        contextTarget={effectiveMenuTarget?.node ?? null}
        onOpenMenu={openMenu}
      />
      <TreeContextMenu
        store={store}
        target={effectiveMenuTarget}
        isOffline={isOffline}
        onClose={closeMenu}
      />
    </View>
  );
});

const PanelBody = observer(function PanelBody({
  store,
  panelState,
  isOffline,
  contextTarget,
  onOpenMenu,
}: {
  store: ConversationTreeStore;
  panelState: PanelState;
  isOffline: boolean;
  contextTarget: ConversationTreeMenuTarget["node"] | null;
  onOpenMenu: (target: ConversationTreeMenuTarget) => void;
}) {
  if (panelState === "loading") {
    return <ConversationTreeLoadingState />;
  }
  if (panelState === "error") {
    return <ConversationTreeErrorState store={store} />;
  }
  return (
    <TreeList
      store={store}
      isOffline={isOffline}
      isEmpty={panelState === "empty"}
      contextTarget={contextTarget}
      onOpenMenu={onOpenMenu}
    />
  );
});

const TreeList = observer(function TreeList({
  store,
  isOffline,
  isEmpty,
  contextTarget,
  onOpenMenu,
}: {
  store: ConversationTreeStore;
  isOffline: boolean;
  isEmpty: boolean;
  contextTarget: ConversationTreeMenuTarget["node"] | null;
  onOpenMenu: (target: ConversationTreeMenuTarget) => void;
}) {
  const listRef = useRef<FlatList<PanelItem> | null>(null);
  const items = buildPanelItems(store);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const revealId = store.activeNodeId ?? store.focusedRootId;
  const openProjectPicker = useCallback(() => store.openProjectPicker(), [store]);
  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<PanelItem>) => {
      switch (item.kind) {
        case "section":
          return (
            <TreeSectionHeader
              section={item.section}
              showAction={item.section === "projects"}
              actionAlwaysVisible={item.actionAlwaysVisible}
              actionDisabled={isOffline}
              onAction={openProjectPicker}
            />
          );
        case "empty":
          return <ConversationTreeEmptyHint indented={item.indented} testID={item.testID} />;
        case "row":
          return (
            <ConversationTreeRow
              row={item.row}
              store={store}
              isOffline={isOffline}
              isContextTarget={
                contextTarget?.kind === item.row.node.kind && contextTarget.id === item.row.node.id
              }
              onOpenMenu={onOpenMenu}
            />
          );
      }
    },
    [contextTarget, isOffline, onOpenMenu, openProjectPicker, store],
  );

  useEffect(() => {
    if (revealId === null) return;
    const index = itemsRef.current.findIndex(
      (item) => item.kind === "row" && item.row.node.id === revealId,
    );
    if (index < 0) return;
    const frame = requestAnimationFrame(() => {
      listRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.5 });
    });
    return () => cancelAnimationFrame(frame);
  }, [revealId]);

  const containerStyle = useMemo(
    () => [styles.listContainer, isOffline ? styles.frozen : null],
    [isOffline],
  );
  const stateTestID = treeStateTestId(isEmpty, isOffline);
  const handleScrollToIndexFailed = useCallback(
    (info: { averageItemLength: number; index: number }) => {
      listRef.current?.scrollToOffset({ offset: info.averageItemLength * info.index });
    },
    [],
  );
  return (
    <View style={containerStyle} testID={stateTestID}>
      <FlatList
        ref={listRef}
        contentContainerStyle={styles.listContent}
        data={items}
        getItemLayout={getItemLayout}
        keyExtractor={keyExtractor}
        keyboardShouldPersistTaps="handled"
        onScrollToIndexFailed={handleScrollToIndexFailed}
        renderItem={renderItem}
        showsVerticalScrollIndicator
        testID="conv-tree-list"
      />
    </View>
  );
});

function buildPanelItems(store: ConversationTreeStore): PanelItem[] {
  const rootSection = new Map<string, ConversationTreeSectionId>();
  for (const node of store.partitionedNodes.pinned) {
    rootSection.set(nodeKey(node.kind, node.id), "pinned");
  }
  for (const node of store.partitionedNodes.projects) {
    rootSection.set(nodeKey(node.kind, node.id), "projects");
  }
  for (const node of store.partitionedNodes.loose) {
    rootSection.set(nodeKey(node.kind, node.id), "conversations");
  }

  const groups: Record<ConversationTreeSectionId, ConversationTreeRowModel[]> = {
    pinned: [],
    projects: [],
    conversations: [],
  };
  let section: ConversationTreeSectionId = "conversations";
  for (const row of store.visibleRows) {
    if (row.depth === 0) {
      section = rootSection.get(nodeKey(row.node.kind, row.node.id)) ?? "conversations";
    }
    groups[section].push(row);
  }

  const items: PanelItem[] = [];
  appendSection(items, "pinned", groups.pinned, false);
  appendSection(items, "projects", groups.projects, groups.projects.length === 0);
  appendSection(items, "conversations", groups.conversations, false);
  return items;
}

function appendSection(
  items: PanelItem[],
  section: ConversationTreeSectionId,
  rows: readonly ConversationTreeRowModel[],
  actionAlwaysVisible: boolean,
): void {
  if (section === "pinned" && rows.length === 0) return;
  items.push({ kind: "section", key: `section:${section}`, section, actionAlwaysVisible });
  for (const row of rows) {
    items.push({
      kind: "row",
      key: `${section}:row:${nodeKey(row.node.kind, row.node.id)}`,
      row,
    });
    if (row.node.kind === "project" && row.isExpanded && row.node.children.length === 0) {
      items.push({
        kind: "empty",
        key: `${section}:empty:${row.node.id}`,
        indented: true,
        testID: `conv-tree-empty-project-${row.node.id}`,
      });
    }
  }
  if (section === "conversations" && rows.length === 0) {
    items.push({
      kind: "empty",
      key: "conversations:empty",
      indented: false,
      testID: "conv-tree-empty-conversations",
    });
  }
}

function nodeKey(kind: string, id: string): string {
  return `${kind}:${id}`;
}

function keyExtractor(item: PanelItem): string {
  return item.key;
}

function treeStateTestId(isEmpty: boolean, isOffline: boolean): string | undefined {
  if (isEmpty) return "conv-tree-empty";
  if (isOffline) return "conv-tree-offline-tree";
  return undefined;
}

function getItemLayout(_data: ArrayLike<PanelItem> | null | undefined, index: number) {
  return { length: ITEM_HEIGHT, offset: ITEM_HEIGHT * index, index };
}

const styles = StyleSheet.create({
  panel: { flex: 1, minWidth: 0, minHeight: 0, paddingTop: 2 },
  listContainer: { flex: 1, minHeight: 0 },
  frozen: { opacity: 0.5 },
  listContent: { paddingHorizontal: 8, paddingBottom: 8 },
});
