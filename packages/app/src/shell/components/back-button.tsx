import { observer } from "mobx-react-lite";
import { useCallback, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import { isWeb } from "@/constants/platform";
import { i18nModel } from "../i18n/i18n-model";
import { shellModel } from "../model/shell-model";
import { CONTROL_RADIUS } from "../theme/shell-tokens";
import { themeModel } from "../theme/theme-model";
import { ShellChevronLeft } from "./icons";

// The settings-page back control, top-left of the bar. The only exit from the settings
// page: one tap returns to the conversation page, which restores the prior layout for free
// (settings never mutated a conversation flag). Hover is a faint ghost wash; web-only.
// `observer` so a scheme/locale flip repaints the colors + label.
export const BackButton = observer(function BackButton() {
  const [hovered, setHovered] = useState(false);
  const onIn = useCallback(() => setHovered(true), []);
  const onOut = useCallback(() => setHovered(false), []);
  const isHot = isWeb && hovered;
  const tk = themeModel.tokens;
  const fg = isHot ? tk.foreground : tk.foregroundMuted;
  const label = i18nModel.t("shell.back");
  const s = useMemo(
    () => ({
      back: [styles.back, { backgroundColor: isHot ? tk.ghostHover : "transparent" }],
      label: [styles.label, { color: fg }],
    }),
    [isHot, tk, fg],
  );
  return (
    <Pressable
      onPress={shellModel.closeSettings}
      onHoverIn={onIn}
      onHoverOut={onOut}
      style={s.back}
      accessibilityRole="button"
      accessibilityLabel={label}
      testID="back-button"
    >
      <ShellChevronLeft size={14} color={fg} />
      <Text style={s.label}>{label}</Text>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  back: {
    height: 28,
    paddingLeft: 6,
    paddingRight: 10,
    borderRadius: CONTROL_RADIUS,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  label: { fontSize: 13 },
});
