import { useCallback, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { isWeb } from "@/constants/platform";
import { useShellActions } from "../api/use-shell";
import { CONTROL_RADIUS, SHELL_COLORS } from "../theme/shell-tokens";
import { iconMuted, ThemedSettings } from "./icons";

// The settings entry, pinned to the bottom of the conversation-page left rail — the one
// control the shell keeps inside the left card, and the only way into the settings page.
// One tap switches the body to the settings page. Hover is a faint sidebar-accent row
// wash (web only). This is the conversation page's counterpart to the back button.

export function SettingsEntry() {
  const { openSettings } = useShellActions();
  const [hovered, setHovered] = useState(false);
  const onIn = useCallback(() => setHovered(true), []);
  const onOut = useCallback(() => setHovered(false), []);
  styles.useVariants({ hovered: isWeb && hovered });
  return (
    <View style={styles.foot}>
      <Pressable
        onPress={openSettings}
        onHoverIn={onIn}
        onHoverOut={onOut}
        style={styles.entry}
        accessibilityRole="button"
        accessibilityLabel="设置"
      >
        <ThemedSettings size={14} uniProps={iconMuted} />
        <Text style={styles.label}>设置</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  foot: {
    paddingHorizontal: 8,
    paddingBottom: 8,
  },
  entry: {
    height: 36,
    paddingHorizontal: 10,
    borderRadius: CONTROL_RADIUS,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    variants: {
      hovered: {
        true: { backgroundColor: SHELL_COLORS[theme.colorScheme].rowHover },
        false: { backgroundColor: "transparent" },
      },
    },
  },
  label: {
    fontSize: 13,
    color: SHELL_COLORS[theme.colorScheme].foreground,
  },
}));
