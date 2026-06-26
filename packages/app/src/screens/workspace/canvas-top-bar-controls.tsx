import { ChevronDown, LayoutGrid, List } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { Pressable, Text } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import type { Theme } from "@/styles/theme";

// Theme-reactive icon leaves (color via uniProps, not useUnistyles).
const ThemedLayoutGrid = withUnistyles(LayoutGrid);
const ThemedChevronDown = withUnistyles(ChevronDown);
const ThemedList = withUnistyles(List);

const mutedColor = (theme: Theme) => ({ color: theme.colors.foregroundMuted });

/**
 * "Open location" entry in the canvas top bar (反馈 ③). P1 renders the chrome only — app-grid icon
 * + label + caret, matching ui.html ct-pos — and is intentionally inert; P2 attaches the external-app
 * dropdown over open-target-planner. Kept as a real button (not a功能 control) so the empty-vs-in-use
 * top bar is driven purely by selectCanvasTopBarChrome.
 */
export function CanvasOpenLocationButton() {
  const { t } = useTranslation();
  const label = t("workspace.header.actions.openLocation");
  return (
    <Pressable
      testID="canvas-open-location"
      style={styles.openLocation}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <ThemedLayoutGrid size={14} uniProps={mutedColor} />
      <Text style={styles.openLocationLabel} numberOfLines={1}>
        {label}
      </Text>
      <ThemedChevronDown size={14} uniProps={mutedColor} />
    </Pressable>
  );
}

/**
 * "Environment" summary toggle (☰) in the canvas top bar (反馈 ①). P1 renders the chrome only; P2
 * opens the floating environment popover over git status/branch/PR. Inert until then.
 */
export function CanvasEnvInfoButton() {
  const { t } = useTranslation();
  const label = t("workspace.header.actions.environmentInfo");
  return (
    <Pressable
      testID="canvas-env-info"
      style={styles.iconButton}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <ThemedList size={16} uniProps={mutedColor} />
    </Pressable>
  );
}

const styles = StyleSheet.create((theme) => ({
  openLocation: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[1],
    borderRadius: theme.borderRadius.lg,
  },
  openLocationLabel: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.foregroundMuted,
  },
  iconButton: {
    padding: theme.spacing[2],
    borderRadius: theme.borderRadius.lg,
  },
}));
