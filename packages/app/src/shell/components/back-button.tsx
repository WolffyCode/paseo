import { useCallback, useState } from "react";
import { Pressable, Text } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { isWeb } from "@/constants/platform";
import { useShellActions } from "../api/use-shell";
import { CONTROL_RADIUS, SHELL_COLORS } from "../theme/shell-tokens";
import { iconForeground, iconMuted, ThemedChevronLeft } from "./icons";

// The settings-page back control, top-left of the bar (← 返回). The only exit from the
// settings page: one tap returns to the conversation page, which restores the prior
// layout for free (settings never mutated a conversation flag). Hover is a faint ghost
// wash; web-only, since native has no pointer hover.

export function BackButton() {
  const { closeSettings } = useShellActions();
  const [hovered, setHovered] = useState(false);
  const onIn = useCallback(() => setHovered(true), []);
  const onOut = useCallback(() => setHovered(false), []);
  const isHot = isWeb && hovered;
  styles.useVariants({ hovered: isHot });
  return (
    <Pressable
      onPress={closeSettings}
      onHoverIn={onIn}
      onHoverOut={onOut}
      style={styles.back}
      accessibilityRole="button"
      accessibilityLabel="返回"
    >
      <ThemedChevronLeft size={14} uniProps={isHot ? iconForeground : iconMuted} />
      <Text style={styles.label}>返回</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create((theme) => ({
  back: {
    height: 28,
    paddingLeft: 6,
    paddingRight: 10,
    borderRadius: CONTROL_RADIUS,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    variants: {
      hovered: {
        true: { backgroundColor: SHELL_COLORS[theme.colorScheme].ghostHover },
        false: { backgroundColor: "transparent" },
      },
    },
  },
  label: {
    fontSize: 13,
    variants: {
      hovered: {
        true: { color: SHELL_COLORS[theme.colorScheme].foreground },
        false: { color: SHELL_COLORS[theme.colorScheme].foregroundMuted },
      },
    },
  },
}));
