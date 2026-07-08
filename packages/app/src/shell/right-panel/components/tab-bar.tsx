import { observer } from "mobx-react-lite";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { isWeb } from "@/constants/platform";
import type { RightPanelController } from "../model/right-panel-controller";
import type { PanelTab, WorkbenchModel } from "../model/workbench-model";
import { themeModel } from "../../theme/theme-model";
import { IconFile, IconPlus, IconX } from "./icons";
import { NewTabMenu } from "./new-tab-menu";
import { PanelControls } from "./panel-controls";
import { TabContextMenu } from "./tab-context-menu";
import {
  ensureTabHoverCss,
  TAB_DIRTY_DATASET,
  TAB_HOVER_DATASET,
  TAB_X_DATASET,
} from "./tab-hover-css";

// The Codex-style tab strip (ui.html sRS2/sRS3) — icon+label pills (active = light-grey rounded pill, NOT
// a blue underline), a trailing "+", the top-right maximize/collapse controls, per-tab visible ✕ / dirty
// ● swap, and drag-reorder with a drop indicator. Pure view over WorkbenchModel: it renders live
// title/dot off tab.content and dispatches focus/close/reorder/openLauncherType. Hover is the web CSS
// :hover path (no JS pointer events). The new-tab dropdown + tab right-click are anchored floating menus.

// Convert a visual drop gap (0..N over the full order) into the rest-based drop index placeTabAtDropIndex
// wants (the moving tab is removed first, so a gap past the moving tab shifts left by one).
function toDropIndex(visualGap: number, movingIndex: number): number {
  return visualGap <= movingIndex ? visualGap : visualGap - 1;
}

type DragState = { id: string; gap: number } | null;

export const TabBar = observer(function TabBar({
  workbench,
  controller,
  isOffline,
}: {
  workbench: WorkbenchModel;
  controller: RightPanelController;
  isOffline: boolean;
}) {
  const tk = themeModel.tokens;
  ensureTabHoverCss(tk.accent);

  const barRef = useRef<View>(null);
  const newTabRef = useRef<View>(null);
  const [newTabAnchor, setNewTabAnchor] = useState<{ x: number; y: number } | null>(null);
  const [ctxMenu, setCtxMenu] = useState<{
    targetId: string;
    anchor: { x: number; y: number };
  } | null>(null);
  const [drag, setDrag] = useState<DragState>(null);
  const dragRef = useRef<DragState>(null);
  dragRef.current = drag;

  const tabs = workbench.tabs;
  const focusedId = workbench.focusedTabId;

  // The anchor point (x,y) of a viewport point relative to the tab bar, where the menus are positioned.
  const anchorFromViewport = useCallback((clientX: number, clientY: number) => {
    const bar = barRef.current as unknown as HTMLElement | null;
    const rect = bar?.getBoundingClientRect();
    return { x: clientX - (rect?.left ?? 0), y: clientY - (rect?.top ?? 0) };
  }, []);

  // Right-click delegation: one contextmenu listener on the bar resolves the target tab from data-tabid.
  useEffect(() => {
    if (!isWeb) {
      return;
    }
    const bar = barRef.current as unknown as HTMLElement | null;
    if (!bar) {
      return;
    }
    const onContextMenu = (event: MouseEvent): void => {
      const target = (event.target as HTMLElement | null)?.closest(
        "[data-tabid]",
      ) as HTMLElement | null;
      const id = target?.dataset.tabid;
      if (!id) {
        return;
      }
      event.preventDefault();
      setNewTabAnchor(null);
      setCtxMenu({ targetId: id, anchor: anchorFromViewport(event.clientX, event.clientY) });
    };
    bar.addEventListener("contextmenu", onContextMenu);
    return () => bar.removeEventListener("contextmenu", onContextMenu);
  }, [anchorFromViewport]);

  // Open the new-tab dropdown anchored just below the "+" button (disabled offline — nothing can open).
  const onOpenNewTab = useCallback(() => {
    if (isOffline) {
      return;
    }
    const node = newTabRef.current as unknown as HTMLElement | null;
    const rect = node?.getBoundingClientRect();
    setCtxMenu(null);
    setNewTabAnchor(anchorFromViewport(rect?.left ?? 0, (rect?.bottom ?? 0) + 4));
  }, [anchorFromViewport, isOffline]);

  const onDropTab = useCallback(() => {
    const current = dragRef.current;
    if (current) {
      const movingIndex = workbench.tabs.findIndex((tab) => tab.id === current.id);
      if (movingIndex !== -1) {
        workbench.reorderTab(current.id, toDropIndex(current.gap, movingIndex));
      }
    }
    setDrag(null);
  }, [workbench]);
  const onDragEnd = useCallback(() => setDrag(null), []);
  const onDragStart = useCallback((id: string, index: number) => setDrag({ id, gap: index }), []);
  const onDragOverGap = useCallback((gap: number) => {
    setDrag((prev) => (prev ? { ...prev, gap } : prev));
  }, []);
  const closeMenus = useCallback(() => {
    setNewTabAnchor(null);
    setCtxMenu(null);
  }, []);

  const barStyle = useMemo(
    () => [styles.bar, { borderColor: tk.border, backgroundColor: tk.surfaceCard }],
    [tk.border, tk.surfaceCard],
  );

  return (
    <View ref={barRef} style={barStyle}>
      {tabs.map((tab, index) => {
        const active = tab.id === focusedId;
        const prevActive = index > 0 && tabs[index - 1].id === focusedId;
        const showSep = index > 0 && !active && !prevActive;
        return (
          <TabSlot
            key={tab.id}
            tab={tab}
            index={index}
            active={active}
            showSep={showSep}
            dropLineBefore={drag != null && drag.gap === index}
            workbench={workbench}
            onDragStart={onDragStart}
            onDragOverGap={onDragOverGap}
            onDropTab={onDropTab}
            onDragEnd={onDragEnd}
          />
        );
      })}
      {drag != null && drag.gap === tabs.length ? <DropLine /> : null}
      <NewTabButton hostRef={newTabRef} onPress={onOpenNewTab} disabled={isOffline} />
      <PanelControls />
      <NewTabMenu controller={controller} anchor={newTabAnchor} onClose={closeMenus} />
      {ctxMenu ? (
        <TabContextMenu
          workbench={workbench}
          targetId={ctxMenu.targetId}
          anchor={ctxMenu.anchor}
          onClose={closeMenus}
        />
      ) : null}
    </View>
  );
});

// A tab pill plus the optional preceding separator and drop-indicator line.
const TabSlot = observer(function TabSlot({
  tab,
  index,
  active,
  showSep,
  dropLineBefore,
  workbench,
  onDragStart,
  onDragOverGap,
  onDropTab,
  onDragEnd,
}: {
  tab: PanelTab;
  index: number;
  active: boolean;
  showSep: boolean;
  dropLineBefore: boolean;
  workbench: WorkbenchModel;
  onDragStart: (id: string, index: number) => void;
  onDragOverGap: (gap: number) => void;
  onDropTab: () => void;
  onDragEnd: () => void;
}) {
  const tk = themeModel.tokens;
  const sepStyle = useMemo(() => [styles.sep, { backgroundColor: tk.border }], [tk.border]);
  return (
    <>
      {dropLineBefore ? <DropLine /> : null}
      {showSep ? <View style={sepStyle} /> : null}
      <TabPill
        tab={tab}
        index={index}
        active={active}
        workbench={workbench}
        onDragStart={onDragStart}
        onDragOverGap={onDragOverGap}
        onDropTab={onDropTab}
        onDragEnd={onDragEnd}
      />
    </>
  );
});

// One tab pill: icon + truncated title + the trailing dirty ● / ✕ slot. Active = filled pill + always-✕;
// inactive = data-rptab hover wash + ✕-on-hover. Click focuses the tab; the ✕ closes it (autosaving a
// dirty tab). HTML5 drag-reorder is wired on the host node (web).
const TabPill = observer(function TabPill({
  tab,
  index,
  active,
  workbench,
  onDragStart,
  onDragOverGap,
  onDropTab,
  onDragEnd,
}: {
  tab: PanelTab;
  index: number;
  active: boolean;
  workbench: WorkbenchModel;
  onDragStart: (id: string, index: number) => void;
  onDragOverGap: (gap: number) => void;
  onDropTab: () => void;
  onDragEnd: () => void;
}) {
  const tk = themeModel.tokens;
  const hostRef = useRef<View>(null);
  const dirty = tab.content.activityDot === "dirty";
  const title = tab.content.title;

  const onFocus = useCallback(() => workbench.focusTab(tab.id), [workbench, tab.id]);
  const onClose = useCallback(() => workbench.closeTab(tab.id), [workbench, tab.id]);

  // Latest-ref so the once-attached drag listeners read current index/handlers without re-subscribing.
  const latest = useRef({ index, onDragStart, onDragOverGap, onDropTab, onDragEnd, id: tab.id });
  latest.current = { index, onDragStart, onDragOverGap, onDropTab, onDragEnd, id: tab.id };
  useEffect(() => {
    if (!isWeb) {
      return;
    }
    const node = hostRef.current as unknown as HTMLElement | null;
    if (!node) {
      return;
    }
    node.setAttribute("draggable", "true");
    const start = (event: DragEvent): void => {
      event.dataTransfer?.setData("text/plain", latest.current.id);
      latest.current.onDragStart(latest.current.id, latest.current.index);
    };
    const over = (event: DragEvent): void => {
      event.preventDefault();
      const rect = node.getBoundingClientRect();
      const leftHalf = event.clientX < rect.left + rect.width / 2;
      latest.current.onDragOverGap(leftHalf ? latest.current.index : latest.current.index + 1);
    };
    const drop = (event: DragEvent): void => {
      event.preventDefault();
      latest.current.onDropTab();
    };
    const end = (): void => latest.current.onDragEnd();
    node.addEventListener("dragstart", start);
    node.addEventListener("dragover", over);
    node.addEventListener("drop", drop);
    node.addEventListener("dragend", end);
    return () => {
      node.removeEventListener("dragstart", start);
      node.removeEventListener("dragover", over);
      node.removeEventListener("drop", drop);
      node.removeEventListener("dragend", end);
    };
  }, []);

  const weight: "600" | "400" = active ? "600" : "400";
  const pillStyle = useMemo(
    () => (active ? [styles.tab, { backgroundColor: tk.toggleActive }] : styles.tab),
    [active, tk.toggleActive],
  );
  const titleStyle = useMemo(
    () => [
      styles.title,
      { color: active ? tk.foreground : tk.foregroundMuted, fontWeight: weight },
    ],
    [active, tk.foreground, tk.foregroundMuted, weight],
  );
  const iconColor = active ? tk.foreground : tk.foregroundMuted;
  const dirtyStyle = useMemo(
    () => [styles.dirty, { backgroundColor: tk.foregroundMuted }],
    [tk.foregroundMuted],
  );
  // data-tabid for the bar's right-click delegation; inactive tabs also opt into the CSS :hover swap.
  const tabData = useMemo<Record<string, string>>(
    () => (active ? { tabid: tab.id } : { tabid: tab.id, ...TAB_HOVER_DATASET }),
    [tab.id, active],
  );

  return (
    <View ref={hostRef} style={pillStyle} dataSet={tabData}>
      <Pressable style={styles.tabPress} onPress={onFocus} accessibilityRole="tab">
        <IconFile size={14} color={iconColor} />
        <Text style={titleStyle} numberOfLines={1}>
          {title}
        </Text>
      </Pressable>
      <View style={styles.trailing}>
        {dirty && !active ? <View style={dirtyStyle} dataSet={TAB_DIRTY_DATASET} /> : null}
        <Pressable
          style={active ? styles.closeActive : styles.close}
          dataSet={active ? undefined : TAB_X_DATASET}
          onPress={onClose}
          accessibilityRole="button"
        >
          <IconX size={12} color={active ? tk.foreground : tk.foregroundMuted} />
        </Pressable>
      </View>
    </View>
  );
});

// The trailing "+" new-tab button.
function NewTabButton({
  hostRef,
  onPress,
  disabled,
}: {
  hostRef: React.RefObject<View | null>;
  onPress: () => void;
  disabled: boolean;
}) {
  const tk = themeModel.tokens;
  const style = useMemo(
    () => (disabled ? [styles.newtab, styles.newtabDisabled] : styles.newtab),
    [disabled],
  );
  return (
    <Pressable
      ref={hostRef}
      style={style}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
    >
      <IconPlus size={14} color={tk.foregroundMuted} />
    </Pressable>
  );
}

// The blue drop-indicator line shown at the active drop gap during a drag.
function DropLine() {
  const tk = themeModel.tokens;
  const style = useMemo(() => [styles.dropLine, { backgroundColor: tk.accent }], [tk.accent]);
  return <View style={style} />;
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    height: 42,
    paddingHorizontal: 6,
    gap: 2,
    borderBottomWidth: 1,
    position: "relative",
  },
  tab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 28,
    paddingLeft: 10,
    paddingRight: 6,
    borderRadius: 7,
    maxWidth: 160,
  },
  tabPress: { flexDirection: "row", alignItems: "center", gap: 6, minWidth: 0, flexShrink: 1 },
  title: { fontSize: 12.5, flexShrink: 1 },
  trailing: {
    width: 16,
    height: 16,
    marginLeft: 3,
    alignItems: "center",
    justifyContent: "center",
  },
  dirty: { position: "absolute", width: 8, height: 8, borderRadius: 4 },
  close: {
    position: "absolute",
    width: 16,
    height: 16,
    borderRadius: 4,
    alignItems: "center",
    justifyContent: "center",
    opacity: 0,
  },
  closeActive: {
    width: 16,
    height: 16,
    borderRadius: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  sep: { width: 1, height: 18, alignSelf: "center" },
  dropLine: { width: 2, height: 24, borderRadius: 2, alignSelf: "center", marginHorizontal: 1 },
  newtab: {
    width: 26,
    height: 26,
    borderRadius: 6,
    alignSelf: "center",
    marginLeft: 3,
    alignItems: "center",
    justifyContent: "center",
  },
  newtabDisabled: { opacity: 0.4 },
});
