import { reaction } from "mobx";
import { observer } from "mobx-react-lite";
import { useCallback, useEffect, useRef } from "react";
import { FlatList, Pressable, StyleSheet, View } from "react-native";
import { useWebScrollViewScrollbar } from "@/components/use-web-scrollbar";
import { themeModel } from "../../theme/theme-model";
import type { FileTreeStore } from "../model/file-tree-store";
import { ensureRowHoverCss } from "../util/row-hover-css";
import type { TreeNodeView } from "../model/types";
import { TreeContextMenu } from "./tree-context-menu";
import { TreeNode } from "./tree-node";
import { TreeSearch } from "./tree-search";
import { EmptyState, ErrorState, LoadingState, OfflineState } from "./tree-states";
import { TreeToolbar } from "./tree-toolbar";

// The file tree's root container (observer): toolbar + (optional) search bar + body, switching the body
// on the composed panel state (ready/loading/empty/error/offline, sFT6) and overlaying the right-click
// menu.
// Pure composition over the store — it ensures the root on mount, owns only the local search-bar
// disclosure, and dispatches; all tree/search/menu logic is in the store + pure functions.
//
// The store reads features / draft / conversation root fresh on each use; the live runtime hook feeds
// `isOffline` as a React prop because that status is not MobX state. The card geometry (width 280 /
// min220 / max500, drag, toggle) is the shell's — this only fills the card body.

export const FileTreePanel = observer(function FileTreePanel({
  store,
  conversationRoot,
  isOffline,
}: {
  store: FileTreeStore;
  conversationRoot: string | null;
  isOffline: boolean;
}) {
  useEffect(() => {
    if (isOffline) {
      return;
    }
    void store.syncConversationRoot(conversationRoot);
  }, [store, conversationRoot, isOffline]);

  // Install/refresh the single hover paint path (CSS :hover, web-only) with the CURRENT theme's
  // hover token — this panel is an observer, so a scheme flip re-tints the rule. One call covers
  // tree rows and search-result rows alike (they share the same injected rule).
  ensureRowHoverCss(themeModel.tokens.ghostHover);

  // Toggling the search bar closed clears the query (the store returns to the plain tree); opening just
  // reveals the input (TreeSearch focuses it). Mirrors sFT4 "再点 = 收起搜索条、清空关键字".
  const onToggleSearch = useCallback(() => {
    store.toggleSearchPanel();
  }, [store]);

  const panelState = isOffline ? "offline" : store.panelState;
  const searchOpen = store.searchOpen;
  const searchActive = store.searchOpen && store.search.phase !== "idle";

  return (
    <View style={styles.card}>
      <TreeToolbar
        store={store}
        searchOpen={searchOpen}
        onToggleSearch={onToggleSearch}
        disabled={isOffline}
      />
      {searchOpen ? <TreeSearch store={store} /> : null}
      {searchActive ? null : <PanelBody store={store} panelState={panelState} />}
      <TreeContextMenu store={store} />
    </View>
  );
});

// The body region below the toolbar/search: the flat tree when ready, otherwise the matching sFT6 state.
const PanelBody = observer(function PanelBody({
  store,
  panelState,
}: {
  store: FileTreeStore;
  panelState: "loading" | "empty" | "error" | "offline" | "ready";
}) {
  switch (panelState) {
    case "offline":
      return <OfflineState store={store} />;
    case "error":
      return <ErrorState store={store} />;
    case "loading":
      return <LoadingState />;
    case "empty":
      return <EmptyState store={store} />;
    case "ready":
      return <TreeBody store={store} />;
  }
});

// The scrollable flat node list. A right-click on its empty area (not on a row) opens the blank-target
// menu (sFT8 A); row right-clicks are handled by the rows themselves.
const TreeBody = observer(function TreeBody({ store }: { store: FileTreeStore }) {
  const onBlankContextMenu = useCallback(
    (event: { nativeEvent?: { pageX?: number; pageY?: number } }) => {
      const point = event.nativeEvent;
      store.openContextMenu({ kind: "blank" }, { x: point?.pageX ?? 0, y: point?.pageY ?? 0 });
    },
    [store],
  );
  const renderItem = useCallback(
    ({ item }: { item: TreeNodeView }) => <TreeNode node={item} store={store} />,
    [store],
  );
  // Thin themed overlay scrollbar on web (the native web scrollbar is a fat gutter — gate-3).
  const listRef = useRef<FlatList<TreeNodeView>>(null);
  const scrollbar = useWebScrollViewScrollbar(listRef);

  // Scroll the selected row into view whenever an external reveal command locates it (M18, item 23①/②).
  // Only reveal linkage bumps revealTick, so manual row clicks (which also set selectedPath) never yank
  // the list; fireImmediately covers the reroot branch, where this list remounts after selection is set.
  useEffect(() => {
    return reaction(
      () => store.revealTick,
      () => scrollSelectedIntoView(store, listRef.current),
      { fireImmediately: true },
    );
  }, [store]);

  // A revealed row past the virtualization window isn't measured yet — approximate-scroll near it with
  // the list's measured average row height instead of throwing (RN FlatList's scrollToIndex contract).
  const onScrollToIndexFailed = useCallback(
    (info: { index: number; averageItemLength: number }) => {
      listRef.current?.scrollToOffset({
        offset: info.averageItemLength * info.index,
        animated: true,
      });
    },
    [],
  );
  return (
    <Pressable
      style={styles.bodyFill}
      // @ts-expect-error onContextMenu is web-only and absent from RN's Pressable types.
      onContextMenu={onBlankContextMenu}
    >
      {/* Virtualized like the legacy explorer (windowSize/maxToRenderPerBatch): a large directory
          renders only the visible rows, not every node + its SvgXml icon — the fix for slow expansion
          of big folders. visibleNodes is the store's flat projection, so the list virtualizes directly. */}
      <FlatList
        ref={listRef}
        data={store.visibleNodes}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        onScrollToIndexFailed={onScrollToIndexFailed}
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        onLayout={scrollbar.onLayout}
        onScroll={scrollbar.onScroll}
        onContentSizeChange={scrollbar.onContentSizeChange}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        initialNumToRender={40}
        maxToRenderPerBatch={40}
        windowSize={12}
        keyboardShouldPersistTaps="handled"
      />
      {scrollbar.overlay}
    </Pressable>
  );
});

// Stable key for a tree row: its root-relative path (unique across the visible set).
function keyExtractor(item: TreeNodeView): string {
  return item.path;
}

// Center the store's selected row in the list — the reveal linkage's scroll target (M18). A no-op when
// nothing is selected or the row isn't in the visible set yet (e.g. its ancestors aren't listed), so a
// missing row never throws. Module-level to keep the reveal effect's nesting flat.
function scrollSelectedIntoView(store: FileTreeStore, list: FlatList<TreeNodeView> | null): void {
  const index = store.visibleNodes.findIndex((node) => node.path === store.selectedPath);
  if (index >= 0) {
    list?.scrollToIndex({ index, viewPosition: 0.5, animated: true });
  }
}

const styles = StyleSheet.create({
  // No own border/margin: the file tree fills the shell's RegionFrame card flush (CodePilot-style,
  // borderless). The single divider under the toolbar/search is enough separation.
  card: { flex: 1, minHeight: 0, overflow: "hidden" },
  bodyFill: { flex: 1, minHeight: 0 },
  body: { flex: 1, minHeight: 0 },
  bodyContent: { padding: 4, paddingBottom: 8 },
});
