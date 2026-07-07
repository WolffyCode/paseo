import { observer } from "mobx-react-lite";
import { useCallback, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
// Icon choices are deliberately literal (chairman gate-3 feedback: FolderSync/ChevronsDownUp read
// as abstract glyphs — ChevronsDownUp was even mistaken for a ✕ close button): FolderInput = "point
// the tree at a directory", CopyMinus = VS Code's collapse-all shape.
import { CopyMinus, FolderInput, FolderOpen, RefreshCw, Search } from "lucide-react-native";
import { isWeb } from "@/constants/platform";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { themeModel } from "../../theme/theme-model";
import type { FileTreeStore } from "../model/file-tree-store";
import { lastSegment } from "../util/tree-paths";
import { FT_FOLDER } from "./tokens";
import { useWebDomClick } from "./use-web-dom-click";

// The file-tree toolbar (observer): root name + four action buttons (search toggle / switch directory /
// collapse all / refresh). Pure view — each button dispatches a store action (or the panel-owned search
// toggle); disabled wholesale when the host is offline (sFT6). The root name shows the host root's last
// segment, the meaningful label for the current tree.

export const TreeToolbar = observer(function TreeToolbar({
  store,
  searchOpen,
  onToggleSearch,
  disabled,
}: {
  store: FileTreeStore;
  searchOpen: boolean;
  onToggleSearch: () => void;
  disabled: boolean;
}) {
  const tk = themeModel.tokens;
  const rootName = store.rootPath ? lastSegment(store.rootPath) : "";

  const barStyle = useMemo(() => [styles.bar, { borderBottomColor: tk.border }], [tk.border]);
  const rootNameStyle = useMemo(() => [styles.rootName, { color: tk.foreground }], [tk.foreground]);

  // Straight dispatchers — the button semantics (collapse-all keeps selection/search; refresh
  // relists root AND expanded layers) are the store's named actions, not view-side compositions
  // (review 2026-07-07 moved them there).
  const collapseAll = useCallback(() => store.collapseAll(), [store]);
  const pickDir = useCallback(() => void store.pickAndShowDirectory(), [store]);
  const refresh = useCallback(() => void store.refreshTree(), [store]);

  return (
    <View style={barStyle}>
      <View style={styles.root}>
        <FolderOpen size={14} color={FT_FOLDER} />
        <Text numberOfLines={1} style={rootNameStyle}>
          {rootName}
        </Text>
      </View>
      <ToolButton
        icon={Search}
        label="搜索"
        active={searchOpen}
        disabled={disabled}
        onPress={onToggleSearch}
        testID="file-tree-search-toggle"
      />
      <ToolButton
        icon={FolderInput}
        label="切换目录"
        disabled={disabled}
        onPress={pickDir}
        testID="file-tree-pick-directory"
      />
      <ToolButton
        icon={CopyMinus}
        label="折叠全部"
        disabled={disabled}
        onPress={collapseAll}
        testID="file-tree-collapse-all"
      />
      <ToolButton
        icon={RefreshCw}
        label="刷新"
        disabled={disabled}
        onPress={refresh}
        testID="file-tree-refresh"
      />
    </View>
  );
});

// One toolbar button: a 34×34 REAL press target (negative margins keep the layout at the old 26px
// footprint) wrapping the 26×26 visual chip — near-miss clicks land (the "search button needs two
// tries" report). The padding must be real: RN-web ignores `hitSlop` for mouse clicks (DOM hit
// testing stops at the element box), so slop-based sizing silently does nothing on web.
// Muted icon, hover wash, an "on" fill when active (search open). Greyed + non-interactive when
// disabled. A tooltip names the action (so an icon's purpose is never a guess). observer so a
// scheme flip repaints fill + icon color. Fires on the standard press release — the input-focus
// steal that used to cancel the release mid-press is fixed at the source (TreeSearch defers its
// autofocus a frame), so no press-in double-fire workaround is needed here.
const ToolButton = observer(function ToolButton({
  icon: Icon,
  label,
  active = false,
  disabled,
  onPress,
  testID,
}: {
  icon: typeof Search;
  label: string;
  active?: boolean;
  disabled: boolean;
  onPress: () => void;
  testID?: string;
}) {
  const tk = themeModel.tokens;
  const [hovered, setHovered] = useState(false);
  const onHoverIn = useCallback(() => setHovered(true), []);
  const onHoverOut = useCallback(() => setHovered(false), []);
  // Web fires through the raw DOM click hook (see use-web-dom-click.ts for WHY — RN-web's press
  // pipeline drops taps under rapid toggling); native keeps Pressable's onPress.
  const hostRef = useWebDomClick({ onPress, disabled });
  const onNativePress = useCallback(() => {
    if (!isWeb) {
      onPress();
    }
  }, [onPress]);
  // Active = accent-blue soft fill + accent icon, matching the top-bar toggles' "on" cue.
  const chipStyle = useMemo(() => {
    let backgroundColor = "transparent";
    if (active) {
      backgroundColor = tk.accentSoft;
    } else if (isWeb && hovered && !disabled) {
      backgroundColor = tk.ghostHover;
    }
    return [styles.chip, { backgroundColor }, disabled ? styles.btnDisabled : null];
  }, [active, hovered, disabled, tk]);
  const tooltipTextStyle = useMemo(
    () => [styles.tooltipText, { color: tk.foreground }],
    [tk.foreground],
  );
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Pressable
          ref={hostRef}
          onPress={onNativePress}
          disabled={disabled}
          onHoverIn={onHoverIn}
          onHoverOut={onHoverOut}
          accessibilityLabel={label}
          testID={testID}
          style={styles.btnHit}
        >
          <View style={chipStyle}>
            <Icon size={16} color={active ? tk.accent : tk.foregroundMuted} />
          </View>
        </Pressable>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        <Text style={tooltipTextStyle}>{label}</Text>
      </TooltipContent>
    </Tooltip>
  );
});

const styles = StyleSheet.create({
  bar: {
    height: 38,
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingHorizontal: 6,
    borderBottomWidth: 1,
  },
  root: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 4,
  },
  rootName: { flexShrink: 1, fontSize: 12, fontWeight: "600" },
  // The REAL press target: 34×34 with -4 margins so it occupies the old 26px layout footprint.
  btnHit: { width: 34, height: 34, margin: -4, alignItems: "center", justifyContent: "center" },
  // The visible 26×26 chip inside the larger target (hover/active fill lives here).
  chip: { width: 26, height: 26, borderRadius: 6, alignItems: "center", justifyContent: "center" },
  btnDisabled: { opacity: 0.5 },
  tooltipText: { fontSize: 11, lineHeight: 14 },
});
