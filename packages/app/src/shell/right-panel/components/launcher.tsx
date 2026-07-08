import { observer } from "mobx-react-lite";
import { useCallback, useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { RightPanelController } from "../model/right-panel-controller";
import type { TabKind } from "../model/tab-content";
import { TAB_KIND_POLICY, type TabKindPolicy } from "../model/tab-kind-policy";
import { STATUS_TOKENS } from "../theme/status-tokens";
import { themeModel } from "../../theme/theme-model";
import { type PanelIcon, IconWifiOff } from "./icons";
import { LAUNCH_ITEMS } from "./launcher-items";
import { PanelControls } from "./panel-controls";

// The launcher default state (ui.html sRS1) — the landing view when the panel is open with no tabs. Top
// is ONLY the maximize/collapse controls (no tab strip, no "+"). The body is a vertical projection of
// TAB_KIND_POLICY: all five kinds, only `file` usable (⌘P), the other four disabled + "后续". Clicking
// file dispatches openLauncherType("file"). Offline greys all five + shows a host-offline note.

export const Launcher = observer(function Launcher({
  controller,
  isOffline,
}: {
  controller: RightPanelController;
  isOffline: boolean;
}) {
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
              kind={item.kind}
              icon={item.icon}
              label={item.label}
              controller={controller}
              isOffline={isOffline}
            />
          ))}
        </View>
        {isOffline ? null : <Hint />}
      </View>
    </View>
  );
});

// One launcher row: the enabled `file` row opens a file tab; the disabled kinds are greyed with a "后续"
// badge (or their shortcut hint). Offline disables the enabled row too (nothing can open).
function LaunchRow({
  kind,
  icon: Icon,
  label,
  controller,
  isOffline,
}: {
  kind: TabKind;
  icon: PanelIcon;
  label: string;
  controller: RightPanelController;
  isOffline: boolean;
}) {
  const tk = themeModel.tokens;
  const policy = TAB_KIND_POLICY[kind];
  const active = policy.enabled && !isOffline;
  const onPress = useCallback(() => controller.openLauncherType(kind), [controller, kind]);
  const rowStyle = useMemo(
    () => (active ? styles.row : [styles.row, styles.rowDisabled]),
    [active],
  );
  const labelStyle = useMemo(() => [styles.rowLabel, { color: tk.foreground }], [tk.foreground]);
  return (
    <Pressable
      style={rowStyle}
      onPress={active ? onPress : undefined}
      disabled={!active}
      accessibilityRole="button"
    >
      <Icon size={16} color={tk.foregroundMuted} />
      <Text style={labelStyle}>{label}</Text>
      <LaunchTrailing policy={policy} />
    </Pressable>
  );
}

// A row's trailing chip: the "后续" roadmap badge for a deferred kind, or the ⌘P keycap for the usable
// one (branched here so the row's JSX carries no nested ternary).
const LaunchTrailing = observer(function LaunchTrailing({ policy }: { policy: TabKindPolicy }) {
  const tk = themeModel.tokens;
  const chip = useMemo(
    () => [styles.badge, { backgroundColor: tk.toggleActive, borderColor: tk.border }],
    [tk.toggleActive, tk.border],
  );
  const soonText = useMemo(
    () => [styles.badgeText, { color: tk.foregroundMuted }],
    [tk.foregroundMuted],
  );
  const kbdText = useMemo(
    () => [styles.badgeText, styles.badgeMono, { color: tk.foregroundMuted }],
    [tk.foregroundMuted],
  );
  if (policy.comingSoon) {
    return (
      <View style={chip}>
        <Text style={soonText}>后续</Text>
      </View>
    );
  }
  if (policy.shortcutHint) {
    return (
      <View style={chip}>
        <Text style={kbdText}>{policy.shortcutHint}</Text>
      </View>
    );
  }
  return null;
});

// The launcher's "pick one to start" hint line.
const Hint = observer(function Hint() {
  const tk = themeModel.tokens;
  const style = useMemo(() => [styles.hint, { color: tk.foregroundMuted }], [tk.foregroundMuted]);
  return <Text style={style}>选一个开始 · 本轮可用「文件」，其余四类后续开放</Text>;
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
  badgeMono: { fontFamily: "SFMono-Regular", fontWeight: "400", fontSize: 11 },
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
