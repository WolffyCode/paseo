import { observer } from "mobx-react-lite";
import { useCallback, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { isWeb } from "@/constants/platform";
import { i18nModel } from "../i18n/i18n-model";
import { shellModel } from "../model/shell-model";
import type { ToggleModel } from "../selectors/regions";
import {
  TOGGLE_RADIUS,
  TOGGLE_SIZE,
  TOP_BAR_HEIGHT,
  TRAFFIC_LIGHT_INSET,
} from "../theme/shell-tokens";
import { themeModel } from "../theme/theme-model";
import { BackButton } from "./back-button";
import {
  iconMuted,
  type ShellIcon,
  ShellFolderTree,
  ShellPanelLeft,
  ShellPanelRight,
} from "./icons";
import { ShellTitlebarDragRegion } from "./titlebar-drag-region";

// The single window-wide top bar (h40, transparent over the backdrop). It carries only
// shell chrome: the traffic-light safe area, the region toggles, the settings back button,
// and a static center slot reserved for the deferred conversation context. It reads the
// derived topBar model off shellModel and dispatches the matching action; it owns no layout
// state. `observer` so a state/scheme/locale change repaints it.
export const TopBar = observer(function TopBar() {
  const bar = shellModel.topBar;
  const tk = themeModel.tokens;
  // The shared left toggle drives the conversation rail or the settings nav depending on
  // the page; showBack is true exactly on the settings page, so it is the page tell.
  const onToggleLeft = bar.showBack ? shellModel.toggleSettingsLeft : shellModel.toggleLeft;
  const slot = bar.showBack
    ? i18nModel.t("shell.topBar.settingsSlot")
    : i18nModel.t("shell.topBar.conversationSlot");
  const s = useMemo(
    () => ({
      slot: [styles.slot, { borderColor: tk.border }],
      slotText: [styles.slotText, { color: tk.foregroundMuted }],
    }),
    [tk],
  );
  return (
    <View style={styles.bar} testID="top-bar">
      <ShellTitlebarDragRegion />
      <View style={styles.inset} />
      <TopBarToggle
        icon={ShellPanelLeft}
        toggle={bar.left}
        onPress={onToggleLeft}
        label="侧栏"
        testID="top-bar-toggle-left"
      />
      {bar.showBack ? <BackButton /> : null}
      <View style={styles.spacer} />
      <View style={s.slot}>
        <Text style={s.slotText} numberOfLines={1}>
          {slot}
        </Text>
      </View>
      <View style={styles.spacer} />
      <View style={styles.rightGroup}>
        {bar.fileTree ? (
          <TopBarToggle
            icon={ShellFolderTree}
            toggle={bar.fileTree}
            onPress={shellModel.toggleFileTree}
            label="目录树"
            testID="top-bar-toggle-file-tree"
          />
        ) : null}
        {bar.right ? (
          <TopBarToggle
            icon={ShellPanelRight}
            toggle={bar.right}
            onPress={shellModel.toggleRight}
            label="右侧栏"
            testID="top-bar-toggle-right"
          />
        ) : null}
      </View>
    </View>
  );
});

// One region toggle: a 36×36 REAL press target (negative margins keep the layout at the visual
// 28px footprint) wrapping the 28×28 chip, so near-miss clicks still land. The padding must be
// real: RN-web ignores `hitSlop` for mouse clicks (DOM hit testing stops at the element box).
// The active fill (very light gray) is the primary open-state signal; hover is a faint wash on
// web only. Disabled (no workspace) is non-interactive. `observer` so a scheme flip repaints the
// fill + icon color. Labeled + testID'd so the toggles are reachable by assistive tech and UI
// automation (they are icon-only).
const TopBarToggle = observer(function TopBarToggle({
  icon: Icon,
  toggle,
  onPress,
  label,
  testID,
}: {
  icon: ShellIcon;
  toggle: ToggleModel;
  onPress: () => void;
  label: string;
  testID: string;
}) {
  const [hovered, setHovered] = useState(false);
  const onIn = useCallback(() => setHovered(true), []);
  const onOut = useCallback(() => setHovered(false), []);
  const accessibilityState = useMemo(
    () => ({ expanded: toggle.active, disabled: !toggle.enabled }),
    [toggle.active, toggle.enabled],
  );
  const tk = themeModel.tokens;
  // Active = accent-blue soft fill + accent icon — unmistakably "on" (the old light-gray fill
  // read as nothing at a glance; chairman gate-3 feedback).
  const chipStyle = useMemo(() => {
    let backgroundColor = "transparent";
    if (toggle.active) {
      backgroundColor = tk.accentSoft;
    } else if (isWeb && hovered && toggle.enabled) {
      backgroundColor = tk.toggleHover;
    }
    return [styles.toggle, { backgroundColor }];
  }, [toggle.active, toggle.enabled, hovered, tk]);
  const iconColor = toggle.active ? tk.accent : iconMuted(tk);
  return (
    <Pressable
      disabled={!toggle.enabled}
      onPress={onPress}
      onHoverIn={onIn}
      onHoverOut={onOut}
      style={styles.toggleHit}
      accessibilityRole="button"
      accessibilityState={accessibilityState}
      accessibilityLabel={label}
      testID={testID}
    >
      <View style={chipStyle}>
        <Icon size={16} color={iconColor} />
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  bar: {
    position: "relative",
    height: TOP_BAR_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 2,
  },
  inset: { width: TRAFFIC_LIGHT_INSET },
  spacer: { flex: 1 },
  rightGroup: { flexDirection: "row", alignItems: "center", gap: 4 },
  slot: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderRadius: 9999,
    paddingVertical: 3,
    paddingHorizontal: 14,
  },
  slotText: { fontSize: 12, fontWeight: "500" },
  // The REAL press target: TOGGLE_SIZE+8 with -4 margins so layout keeps the visual footprint.
  toggleHit: {
    width: TOGGLE_SIZE + 8,
    height: TOGGLE_SIZE + 8,
    margin: -4,
    alignItems: "center",
    justifyContent: "center",
  },
  toggle: {
    width: TOGGLE_SIZE,
    height: TOGGLE_SIZE,
    borderRadius: TOGGLE_RADIUS,
    alignItems: "center",
    justifyContent: "center",
  },
});
