import { Check, ChevronDown, Plus } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Pressable,
  type PressableStateCallbackType,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { isWeb } from "@/constants/platform";
import { useHostRuntimeConnectionStatus, useHosts } from "@/runtime/host-runtime";
import { themeModel, type ShellTokens } from "../../theme/theme-model";
import { selectHostConnectionTone, type HostConnectionTone } from "../model/connection-tone";

type HoverState = PressableStateCallbackType & { hovered?: boolean };

export interface HostSwitcherProps {
  readonly activeServerId: string | null;
  readonly onSwitchHost: (serverId: string) => void;
  readonly onReconnect: (serverId: string) => void;
  readonly onAddHost: () => void;
}

/** Render the active-host capsule and route each dropdown row by its live connection tone. */
export function HostSwitcher({
  activeServerId,
  onSwitchHost,
  onReconnect,
  onAddHost,
}: HostSwitcherProps) {
  const hosts = useHosts();
  const activeStatus = useHostRuntimeConnectionStatus(activeServerId ?? "");
  const activeTone = selectHostConnectionTone(activeStatus);
  const activeHost = hosts.find((host) => host.serverId === activeServerId);
  const activeLabel =
    activeHost === undefined
      ? "未选择主机"
      : normalizeHostLabel(activeHost.label, activeHost.serverId);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<View | null>(null);
  const tk = themeModel.tokens;

  useEffect(() => {
    if (!open || !isWeb) return;
    const handleMouseDown = (event: MouseEvent): void => {
      const element = containerRef.current as unknown as HTMLElement | null;
      if (element !== null && event.target instanceof Node && !element.contains(event.target)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const toggleOpen = useCallback(() => setOpen((value) => !value), []);
  const closeAndAddHost = useCallback(() => {
    setOpen(false);
    onAddHost();
  }, [onAddHost]);
  const handleSwitch = useCallback(
    (serverId: string) => {
      setOpen(false);
      onSwitchHost(serverId);
    },
    [onSwitchHost],
  );
  const pillStyle = useCallback(
    ({ hovered, pressed }: HoverState) => [
      styles.pill,
      {
        backgroundColor: hovered ? tk.tabHover : tk.surfaceCard,
        borderColor: open ? tk.accent : tk.border,
        shadowColor: open ? tk.accent : "transparent",
      },
      pressed ? { backgroundColor: tk.toggleActive } : null,
    ],
    [open, tk.accent, tk.border, tk.surfaceCard, tk.tabHover, tk.toggleActive],
  );
  const labelStyle = useMemo(() => [styles.pillLabel, { color: tk.foreground }], [tk.foreground]);
  const pillAccessibilityState = useMemo(() => ({ expanded: open }), [open]);
  const dropdownStyle = useMemo(
    () => [styles.dropdown, { backgroundColor: tk.surfaceCard, borderColor: tk.border }],
    [tk.border, tk.surfaceCard],
  );
  const headerStyle = useMemo(
    () => [styles.header, { color: tk.foregroundMuted }],
    [tk.foregroundMuted],
  );
  const separatorStyle = useMemo(
    () => [styles.separator, { backgroundColor: tk.border }],
    [tk.border],
  );
  const addRowStyle = useCallback(
    ({ hovered, pressed }: HoverState) => [
      styles.hostRow,
      hovered ? { backgroundColor: tk.tabHover } : null,
      pressed ? { backgroundColor: tk.toggleActive } : null,
    ],
    [tk.tabHover, tk.toggleActive],
  );
  const addTextStyle = useMemo(() => [styles.hostName, { color: tk.foreground }], [tk.foreground]);

  return (
    <View ref={containerRef} style={styles.container} testID="host-switcher">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="切换主机"
        accessibilityState={pillAccessibilityState}
        onPress={toggleOpen}
        style={pillStyle}
        testID="host-switcher-pill"
      >
        <ConnectionDot tone={activeTone} testID="host-switcher-pill-status" />
        <Text numberOfLines={1} style={labelStyle}>
          {activeLabel}
        </Text>
        <ChevronDown size={16} color={tk.foregroundMuted} />
      </Pressable>

      {open ? (
        <View style={dropdownStyle} testID="host-switcher-dropdown">
          <Text style={headerStyle}>主机 · Hosts</Text>
          <ScrollView style={styles.hostList} showsVerticalScrollIndicator>
            {hosts.map((host) => (
              <HostSwitcherRow
                key={host.serverId}
                serverId={host.serverId}
                label={normalizeHostLabel(host.label, host.serverId)}
                isCurrent={host.serverId === activeServerId}
                onSwitchHost={handleSwitch}
                onReconnect={onReconnect}
              />
            ))}
          </ScrollView>
          <View style={separatorStyle} />
          <Pressable
            accessibilityRole="button"
            onPress={closeAndAddHost}
            style={addRowStyle}
            testID="host-switcher-add"
          >
            <Plus size={14} color={tk.foregroundMuted} />
            <Text numberOfLines={1} style={addTextStyle}>
              添加主机...
            </Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

function HostSwitcherRow({
  serverId,
  label,
  isCurrent,
  onSwitchHost,
  onReconnect,
}: {
  serverId: string;
  label: string;
  isCurrent: boolean;
  onSwitchHost: (serverId: string) => void;
  onReconnect: (serverId: string) => void;
}) {
  const status = useHostRuntimeConnectionStatus(serverId);
  const tone = selectHostConnectionTone(status);
  const tk = themeModel.tokens;
  const handlePress = useCallback(() => {
    if (tone === "offline") {
      onReconnect(serverId);
      return;
    }
    onSwitchHost(serverId);
  }, [onReconnect, onSwitchHost, serverId, tone]);
  const rowStyle = useCallback(
    ({ hovered, pressed }: HoverState) => [
      styles.hostRow,
      isCurrent ? { backgroundColor: tk.toggleActive } : null,
      hovered && !isCurrent ? { backgroundColor: tk.tabHover } : null,
      pressed ? { backgroundColor: tk.toggleActive } : null,
      tone === "offline" ? styles.offline : null,
    ],
    [isCurrent, tk.tabHover, tk.toggleActive, tone],
  );
  const nameStyle = useMemo(() => [styles.hostName, { color: tk.foreground }], [tk.foreground]);
  const statusStyle = useMemo(
    () => [styles.statusText, { color: toneColor(tone, tk) }],
    [tk, tone],
  );
  const accessibilityState = useMemo(() => ({ selected: isCurrent }), [isCurrent]);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={accessibilityState}
      onPress={handlePress}
      style={rowStyle}
      testID={`host-switcher-row-${serverId}`}
    >
      <ConnectionDot tone={tone} testID={`host-switcher-status-${serverId}`} />
      <Text numberOfLines={1} style={nameStyle}>
        {label}
      </Text>
      {isCurrent ? (
        <Check size={14} color={tk.accent} />
      ) : (
        <Text style={statusStyle}>{TONE_LABEL[tone]}</Text>
      )}
    </Pressable>
  );
}

function ConnectionDot({ tone, testID }: { tone: HostConnectionTone; testID: string }) {
  const tk = themeModel.tokens;
  const dataSet = useMemo(() => ({ connectionTone: tone }), [tone]);
  const style = useMemo(() => [styles.dot, { backgroundColor: toneColor(tone, tk) }], [tk, tone]);
  return <View dataSet={dataSet} style={style} testID={testID} />;
}

function normalizeHostLabel(label: string | null | undefined, serverId: string): string {
  const normalized = label?.trim() ?? "";
  return normalized.length === 0 ? serverId : normalized;
}

function toneColor(tone: HostConnectionTone, tokens: ShellTokens): string {
  switch (tone) {
    case "online":
      return tokens.statusSuccess;
    case "connecting":
      return tokens.statusWarning;
    case "offline":
      return tokens.statusDanger;
  }
}

const TONE_LABEL: Record<HostConnectionTone, string> = {
  online: "在线",
  connecting: "连接中",
  offline: "离线",
};

const styles = StyleSheet.create({
  container: {
    position: "relative",
    zIndex: 40,
    marginHorizontal: 10,
    marginTop: 10,
    marginBottom: 8,
  },
  pill: {
    height: 36,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    shadowOpacity: 0.2,
    shadowRadius: 3,
  },
  pillLabel: { flex: 1, minWidth: 0, fontSize: 13 },
  dropdown: {
    position: "absolute",
    top: 42,
    left: 0,
    right: 0,
    zIndex: 50,
    borderWidth: 1,
    borderRadius: 8,
    padding: 5,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.22,
    shadowRadius: 18,
    elevation: 12,
  },
  header: { height: 26, paddingHorizontal: 9, paddingTop: 5, fontSize: 10.5, fontWeight: "700" },
  hostList: { maxHeight: 224 },
  hostRow: {
    height: 32,
    borderRadius: 6,
    paddingHorizontal: 9,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  offline: { opacity: 0.66 },
  hostName: { flex: 1, minWidth: 0, fontSize: 12.5 },
  statusText: { flexShrink: 0, fontSize: 11 },
  dot: { width: 7, height: 7, borderRadius: 9999, flexShrink: 0 },
  separator: { height: 1, marginHorizontal: 7, marginVertical: 5 },
});
