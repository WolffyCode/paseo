import { type ComponentType, useCallback, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { isWeb } from "@/constants/platform";
import type { ShellActions, TopBarModel } from "../api/use-shell";
import type { ToggleModel } from "../selectors/regions";
import {
  SHELL_COLORS,
  TOGGLE_RADIUS,
  TOGGLE_SIZE,
  TOP_BAR_HEIGHT,
  TRAFFIC_LIGHT_INSET,
} from "../theme/shell-tokens";
import { BackButton } from "./back-button";
import {
  iconForeground,
  iconMuted,
  ThemedFolderTree,
  ThemedPanelLeft,
  ThemedPanelRight,
} from "./icons";
import { ShellTitlebarDragRegion } from "./titlebar-drag-region";

// The single window-wide top bar (h40, transparent over the backdrop). It carries only
// shell chrome: the traffic-light safe area, the region toggles, the settings back
// button, and a static center slot reserved for the deferred conversation context. No
// title/project/branch/menu — those are deferred content. It renders the derived
// TopBarModel and dispatches the matching shell action; it owns no layout state.

type ThemedIcon = ComponentType<{ size?: number; uniProps?: typeof iconMuted }>;

interface TopBarProps {
  model: TopBarModel;
  actions: ShellActions;
}

export function TopBar({ model, actions }: TopBarProps) {
  // The shared left toggle drives the conversation rail or the settings nav depending on
  // the page; showBack is true exactly on the settings page, so it is the page tell.
  const onToggleLeft = model.showBack ? actions.toggleSettingsLeft : actions.toggleLeft;
  return (
    <View style={styles.bar}>
      <ShellTitlebarDragRegion />
      <View style={styles.inset} />
      <TopBarToggle icon={ThemedPanelLeft} toggle={model.left} onPress={onToggleLeft} />
      {model.showBack ? <BackButton /> : null}
      <View style={styles.spacer} />
      <View style={styles.slot}>
        <Text style={styles.slotText} numberOfLines={1}>
          {model.showBack ? "设置 · 占位" : "标题 / 上下文 · 占位"}
        </Text>
      </View>
      <View style={styles.spacer} />
      <View style={styles.rightGroup}>
        {model.fileTree ? (
          <TopBarToggle
            icon={ThemedFolderTree}
            toggle={model.fileTree}
            onPress={actions.toggleFileTree}
          />
        ) : null}
        {model.right ? (
          <TopBarToggle
            icon={ThemedPanelRight}
            toggle={model.right}
            onPress={actions.toggleRight}
          />
        ) : null}
      </View>
    </View>
  );
}

// One 28x28 region toggle. The active fill (very light gray) is the primary open-state
// signal; hover is a faint wash on web only. Disabled (no workspace) is non-interactive
// and muted.
function TopBarToggle({
  icon: Icon,
  toggle,
  onPress,
}: {
  icon: ThemedIcon;
  toggle: ToggleModel;
  onPress: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const onIn = useCallback(() => setHovered(true), []);
  const onOut = useCallback(() => setHovered(false), []);
  const accessibilityState = useMemo(
    () => ({ expanded: toggle.active, disabled: !toggle.enabled }),
    [toggle.active, toggle.enabled],
  );
  styles.useVariants({ toggle: toggleVariant(toggle, hovered) });
  return (
    <Pressable
      disabled={!toggle.enabled}
      onPress={onPress}
      onHoverIn={onIn}
      onHoverOut={onOut}
      style={styles.toggle}
      accessibilityRole="button"
      accessibilityState={accessibilityState}
    >
      <Icon size={16} uniProps={toggle.active ? iconForeground : iconMuted} />
    </Pressable>
  );
}

// Resolve a toggle's visual state. Active wins (open panel); hover is web-only and only
// when enabled; otherwise the implicit resting default.
function toggleVariant(toggle: ToggleModel, hovered: boolean): "active" | "hovered" | undefined {
  if (toggle.active) {
    return "active";
  }
  if (isWeb && hovered && toggle.enabled) {
    return "hovered";
  }
  return undefined;
}

const styles = StyleSheet.create((theme) => ({
  bar: {
    position: "relative",
    height: TOP_BAR_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 2,
  },
  inset: {
    width: TRAFFIC_LIGHT_INSET,
  },
  spacer: {
    flex: 1,
  },
  rightGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  slot: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: SHELL_COLORS[theme.colorScheme].border,
    borderRadius: 9999,
    paddingVertical: 3,
    paddingHorizontal: 14,
  },
  slotText: {
    fontSize: 12,
    fontWeight: "500",
    color: SHELL_COLORS[theme.colorScheme].foregroundMuted,
  },
  toggle: {
    width: TOGGLE_SIZE,
    height: TOGGLE_SIZE,
    borderRadius: TOGGLE_RADIUS,
    alignItems: "center",
    justifyContent: "center",
    variants: {
      toggle: {
        active: { backgroundColor: SHELL_COLORS[theme.colorScheme].toggleActive },
        hovered: { backgroundColor: SHELL_COLORS[theme.colorScheme].toggleHover },
        default: { backgroundColor: "transparent" },
      },
    },
  },
}));
