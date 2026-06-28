import { observer } from "mobx-react-lite";
import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { i18nModel } from "../i18n/i18n-model";
import { themeModel } from "../theme/theme-model";
import {
  iconMuted,
  ShellFolderTree,
  type ShellIcon,
  ShellMessageSquare,
  ShellPanelLeft,
  ShellPanelRight,
  ShellSettings,
  ShellSliders,
} from "./icons";

// The shell's one empty-container body. Every region this milestone renders this: a real
// card geometry filled with a dashed outline + the region's name + which module owns its
// future content. It draws NO real content — that belongs to the deferred content
// milestones. The icon is the variant's fixed structural tell; the copy comes from the
// I18nModel ("shell.zone.<variant>.*"). `observer` so a scheme/locale flip repaints both.

export type ZoneVariant =
  | "left"
  | "center"
  | "right"
  | "fileTree"
  | "settingsNav"
  | "settingsContent";

// Each zone's structural icon (fixed by ui.html, not business data — stays in code).
const ZONE_ICON: Record<ZoneVariant, ShellIcon> = {
  left: ShellPanelLeft,
  center: ShellMessageSquare,
  right: ShellPanelRight,
  fileTree: ShellFolderTree,
  settingsNav: ShellSliders,
  settingsContent: ShellSettings,
};

export const RegionPlaceholder = observer(function RegionPlaceholder({
  variant,
}: {
  variant: ZoneVariant;
}) {
  const tk = themeModel.tokens;
  const Icon = ZONE_ICON[variant];
  const s = useMemo(
    () => ({
      zone: [styles.zone, { borderColor: tk.border }],
      iconBox: [styles.iconBox, { backgroundColor: tk.toggleActive }],
      title: [styles.title, { color: tk.foreground }],
      subtitle: [styles.subtitle, { color: tk.foregroundMuted }],
      tag: [styles.tag, { color: tk.foregroundMuted, borderColor: tk.border }],
    }),
    [tk],
  );
  return (
    <View style={s.zone} testID="region-placeholder">
      <View style={s.iconBox}>
        <Icon size={20} color={iconMuted(tk)} />
      </View>
      <Text style={s.title}>{i18nModel.t(`shell.zone.${variant}.title`)}</Text>
      <Text style={s.subtitle}>{i18nModel.t(`shell.zone.${variant}.subtitle`)}</Text>
      <Text style={s.tag}>{i18nModel.t(`shell.zone.${variant}.tag`)}</Text>
    </View>
  );
});

const styles = StyleSheet.create({
  zone: {
    flex: 1,
    minHeight: 0,
    margin: 8,
    borderWidth: 1,
    borderStyle: "dashed",
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    paddingVertical: 16,
    paddingHorizontal: 14,
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontSize: 13, fontWeight: "600", textAlign: "center" },
  subtitle: { fontSize: 11.5, lineHeight: 17, maxWidth: 240, textAlign: "center" },
  tag: {
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 0.5,
    borderWidth: 1,
    borderRadius: 9999,
    paddingVertical: 2,
    paddingHorizontal: 9,
    overflow: "hidden",
  },
});
