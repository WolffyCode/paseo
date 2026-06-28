import { observer } from "mobx-react-lite";
import { useCallback, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { isWeb } from "@/constants/platform";
import { i18nModel } from "../i18n/i18n-model";
import { shellModel } from "../model/shell-model";
import { CONTROL_RADIUS } from "../theme/shell-tokens";
import { themeModel } from "../theme/theme-model";
import { iconMuted, ShellSettings } from "./icons";

// The settings entry, pinned to the bottom of the conversation-page left rail — the one
// control the shell keeps inside the left card, and the only way into the settings page.
// One tap switches the body to the settings page. Hover is a faint sidebar-accent row wash
// (web only). `observer` so a scheme/locale flip repaints the wash + label.
export const SettingsEntry = observer(function SettingsEntry() {
  const [hovered, setHovered] = useState(false);
  const onIn = useCallback(() => setHovered(true), []);
  const onOut = useCallback(() => setHovered(false), []);
  const tk = themeModel.tokens;
  const label = i18nModel.t("shell.settings");
  const entryStyle = useMemo(
    () => [styles.entry, { backgroundColor: isWeb && hovered ? tk.rowHover : "transparent" }],
    [hovered, tk],
  );
  const labelStyle = useMemo(() => [styles.label, { color: tk.foreground }], [tk]);
  return (
    <View style={styles.foot}>
      <Pressable
        onPress={shellModel.openSettings}
        onHoverIn={onIn}
        onHoverOut={onOut}
        style={entryStyle}
        accessibilityRole="button"
        accessibilityLabel={label}
        testID="settings-entry"
      >
        <ShellSettings size={14} color={iconMuted(tk)} />
        <Text style={labelStyle}>{label}</Text>
      </Pressable>
    </View>
  );
});

const styles = StyleSheet.create({
  foot: { paddingHorizontal: 8, paddingBottom: 8 },
  entry: {
    height: 36,
    paddingHorizontal: 10,
    borderRadius: CONTROL_RADIUS,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  label: { fontSize: 13 },
});
