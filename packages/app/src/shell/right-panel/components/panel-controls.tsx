import { observer } from "mobx-react-lite";
import { useCallback, useMemo } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { shellModel } from "../../model/shell-model";
import { themeModel } from "../../theme/theme-model";
import { IconMaximize, IconMinimize, IconPanelRight } from "./icons";

// The right panel's top-right controls (ui.html sRS1/sRS2 .rp-ctl): whole-panel maximize ⤢/⤡ and collapse.
// Shared by the launcher (its only top affordance) and the tab bar. Maximize geometry lives on ShellModel
// (the region-geometry owner), so this just dispatches toggleRightMaximized / closeRight and reads the
// resolved maximized flag — the WorkbenchModel never proxies shell geometry.

export const PanelControls = observer(function PanelControls() {
  const tk = themeModel.tokens;
  const maximized = shellModel.rightMaximized;
  const onMaximize = useCallback(() => shellModel.toggleRightMaximized(), []);
  const onCollapse = useCallback(() => shellModel.closeRight(), []);
  const maxBtn = useMemo(
    () => (maximized ? [styles.btn, { backgroundColor: tk.toggleActive }] : styles.btn),
    [maximized, tk.toggleActive],
  );
  const collapseBtn = useMemo(
    () => [styles.btn, { backgroundColor: tk.toggleActive }],
    [tk.toggleActive],
  );
  return (
    <View style={styles.ctl}>
      <Pressable style={maxBtn} onPress={onMaximize} accessibilityRole="button">
        {maximized ? (
          <IconMinimize size={14} color={tk.foreground} />
        ) : (
          <IconMaximize size={14} color={tk.foregroundMuted} />
        )}
      </Pressable>
      <Pressable style={collapseBtn} onPress={onCollapse} accessibilityRole="button">
        <IconPanelRight size={14} color={tk.foreground} />
      </Pressable>
    </View>
  );
});

const styles = StyleSheet.create({
  ctl: { flexDirection: "row", alignItems: "center", gap: 1, marginLeft: "auto", paddingLeft: 4 },
  btn: {
    width: 26,
    height: 26,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
});
