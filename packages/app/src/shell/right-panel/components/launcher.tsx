import { observer } from "mobx-react-lite";
import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { STATUS_TOKENS } from "../theme/status-tokens";
import { themeModel } from "../../theme/theme-model";
import { type PanelIcon, IconWifiOff } from "./icons";
import { LAUNCH_HINT, LAUNCH_ITEMS } from "./launcher-items";
import { PanelControls } from "./panel-controls";

// The launcher default state (ui.html sRS1) — the landing view when the panel is open with no tabs. Top
// is ONLY the maximize/collapse controls (no tab strip, no "+"). The body projects the four deferred
// kinds as disabled "后续" rows; file is deliberately absent because it opens only from tree/conversation.
// Offline keeps the same roadmap rows and adds the host-offline note.

export const Launcher = observer(function Launcher({ isOffline }: { isOffline: boolean }) {
  const tk = themeModel.tokens;
  const topBar = useMemo(() => [styles.top, { borderColor: tk.border }], [tk.border]);
  return (
    <View style={styles.root}>
      <View style={topBar}>
        <PanelControls />
      </View>
      <View style={styles.launch}>
        {isOffline ? <OfflineNote /> : null}
        <View style={styles.list}>
          {LAUNCH_ITEMS.map((item) => (
            <LaunchRow
              key={item.kind}
              icon={item.icon}
              label={item.label}
              enabled={item.policy.enabled}
              comingSoon={item.policy.comingSoon}
            />
          ))}
        </View>
        {isOffline ? null : <Hint />}
      </View>
    </View>
  );
});

// One policy-driven roadmap row: current items are disabled and carry "后续", with no command attached.
function LaunchRow({
  icon: Icon,
  label,
  enabled,
  comingSoon,
}: {
  icon: PanelIcon;
  label: string;
  enabled: boolean;
  comingSoon: boolean;
}) {
  const tk = themeModel.tokens;
  const rowStyle = useMemo(
    () => (enabled ? styles.row : [styles.row, styles.rowDisabled]),
    [enabled],
  );
  const labelStyle = useMemo(() => [styles.rowLabel, { color: tk.foreground }], [tk.foreground]);
  return (
    <Pressable style={rowStyle} disabled={!enabled} accessibilityRole="button">
      <Icon size={16} color={tk.foregroundMuted} />
      <Text style={labelStyle}>{label}</Text>
      {comingSoon ? <ComingSoonBadge /> : null}
    </Pressable>
  );
}

// The trailing "后续" roadmap badge shared by all four launcher rows.
const ComingSoonBadge = observer(function ComingSoonBadge() {
  const tk = themeModel.tokens;
  const chip = useMemo(
    () => [styles.badge, { backgroundColor: tk.toggleActive, borderColor: tk.border }],
    [tk.toggleActive, tk.border],
  );
  const soonText = useMemo(
    () => [styles.badgeText, { color: tk.foregroundMuted }],
    [tk.foregroundMuted],
  );
  return (
    <View style={chip}>
      <Text style={soonText}>后续</Text>
    </View>
  );
});

// The launcher's "pick one to start" hint line.
const Hint = observer(function Hint() {
  const tk = themeModel.tokens;
  const style = useMemo(() => [styles.hint, { color: tk.foregroundMuted }], [tk.foregroundMuted]);
  return <Text style={style}>{LAUNCH_HINT}</Text>;
});

// The host-offline note shown above the (all-disabled) list when the panel is offline.
const OfflineNote = observer(function OfflineNote() {
  const warn = STATUS_TOKENS[themeModel.scheme].warning;
  const style = useMemo(
    () => [
      styles.offNote,
      { backgroundColor: withAlpha(warn, 0.12), borderColor: withAlpha(warn, 0.3) },
    ],
    [warn],
  );
  const text = useMemo(() => [styles.offText, { color: warn }], [warn]);
  return (
    <View style={style}>
      <IconWifiOff size={14} color={warn} />
      <Text style={text}>主机离线 · 无法打开内容</Text>
    </View>
  );
});

// Overlay alpha on a #rrggbb token for the offline note wash.
function withAlpha(color: string, alpha: number): string {
  const r = Number.parseInt(color.slice(1, 3), 16);
  const g = Number.parseInt(color.slice(3, 5), 16);
  const b = Number.parseInt(color.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const styles = StyleSheet.create({
  root: { flex: 1, minHeight: 0 },
  top: {
    height: 42,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 6,
    borderBottomWidth: 1,
  },
  launch: {
    flex: 1,
    minHeight: 0,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    padding: 18,
  },
  list: { width: "100%", maxWidth: 300, gap: 3 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    height: 40,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  rowDisabled: { opacity: 0.5 },
  rowLabel: { fontSize: 14, flex: 1 },
  badge: { borderWidth: 1, borderRadius: 9999, paddingHorizontal: 8, paddingVertical: 1 },
  badgeText: { fontSize: 10, fontWeight: "700" },
  hint: { fontSize: 11.5, textAlign: "center", maxWidth: 280, lineHeight: 18 },
  offNote: {
    width: "100%",
    maxWidth: 300,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingVertical: 7,
    paddingHorizontal: 11,
    borderWidth: 1,
    borderRadius: 8,
  },
  offText: { fontSize: 12 },
});
