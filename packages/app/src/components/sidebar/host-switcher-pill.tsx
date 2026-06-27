import { router } from "expo-router";
import { Check, ChevronDown, Plus } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, type PressableStateCallbackType, Text, View } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { AddHostMethodModal } from "@/components/add-host-method-modal";
import { AddHostModal } from "@/components/add-host-modal";
import { PairLinkModal } from "@/components/pair-link-modal";
import {
  type HostConnectionTone,
  selectHostConnectionTone,
} from "@/components/sidebar/host-switcher-model";
import { isWeb } from "@/constants/platform";
import { useHostRuntimeConnectionStatus, useHosts } from "@/runtime/host-runtime";
import type { Theme } from "@/styles/theme";
import { normalizeHostLabel } from "@/types/host-connection";
import { buildHostRootRoute } from "@/utils/host-routes";

// Icon color rides withUnistyles + uniProps (useUnistyles is banned); chevron/check/plus
// are theme-reactive leaves, not style-driven, so the color prop is theme-mapped.
const ThemedChevronDown = withUnistyles(ChevronDown);
const ThemedCheck = withUnistyles(Check);
const ThemedPlus = withUnistyles(Plus);

const mutedIconColor = (theme: Theme) => ({ color: theme.colors.foregroundMuted });

const PILL_ICON_SIZE = 16;
const ROW_ICON_SIZE = 14;

type HoverState = PressableStateCallbackType & { hovered?: boolean };

interface HostSwitcherPillProps {
  /** The host whose data the shell currently shows — drives the pill label + status dot. */
  activeServerId: string | null;
  /** Open the dropdown upward — the pill now sits in the bottom footer next to 设置 (反馈: 放设置右边). */
  dropUp?: boolean;
}

/**
 * Left-column host switcher (净新, Codex has no multi-host control). The pill shows the
 * active host name + a three-state connection dot; tapping it opens a dropdown of every
 * configured host anchored directly under the pill at exactly the pill's width (反馈 I —
 * never full-width / full-screen). Selecting a host navigates to its root route so the
 * whole shell reloads for that host; "add host" opens the existing add-host flow.
 */
export function HostSwitcherPill({ activeServerId, dropUp = false }: HostSwitcherPillProps) {
  const { t } = useTranslation();
  const hosts = useHosts();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<View | null>(null);

  const activeHost = activeServerId
    ? (hosts.find((host) => host.serverId === activeServerId) ?? null)
    : null;
  const activeStatus = useHostRuntimeConnectionStatus(activeServerId ?? "");
  const activeTone = selectHostConnectionTone(activeStatus);
  const activeLabel = activeHost
    ? normalizeHostLabel(activeHost.label, activeHost.serverId)
    : t("sidebar.host.noHost");

  // Desktop-only outside-press close: the dropdown is anchored absolutely (no full-screen
  // backdrop that would be clipped to the sidebar), so close on any pointer-down landing
  // outside the pill+dropdown subtree.
  useEffect(() => {
    if (!open || !isWeb) {
      return;
    }
    const handlePointerDown = (event: Event) => {
      const node = containerRef.current as unknown as HTMLElement | null;
      if (node && event.target instanceof Node && !node.contains(event.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  const togglePill = useCallback(() => setOpen((value) => !value), []);
  const handleSelectHost = useCallback((serverId: string) => {
    setOpen(false);
    router.navigate(buildHostRootRoute(serverId));
  }, []);

  const pillStyle = useCallback(
    ({ hovered }: HoverState) => [
      styles.pill,
      hovered && styles.pillHovered,
      open && styles.pillOpen,
    ],
    [open],
  );
  const addRowStyle = useCallback(
    ({ hovered }: HoverState) => [styles.hostRow, hovered && styles.hostRowHovered],
    [],
  );

  const [addMethodVisible, setAddMethodVisible] = useState(false);
  const [directVisible, setDirectVisible] = useState(false);
  const [pasteVisible, setPasteVisible] = useState(false);

  const closeAddFlow = useCallback(() => {
    setAddMethodVisible(false);
    setDirectVisible(false);
    setPasteVisible(false);
  }, []);
  const handleAddHost = useCallback(() => {
    setOpen(false);
    setAddMethodVisible(true);
  }, []);
  const handleSelectDirect = useCallback(() => {
    setAddMethodVisible(false);
    setDirectVisible(true);
  }, []);
  // Desktop has no camera, so "scan QR" falls back to the paste-link (offer URL) flow.
  const handleSelectPaste = useCallback(() => {
    setAddMethodVisible(false);
    setPasteVisible(true);
  }, []);
  const handleBackToMethods = useCallback(() => {
    setDirectVisible(false);
    setPasteVisible(false);
    setAddMethodVisible(true);
  }, []);
  const handleHostSaved = useCallback(
    ({ serverId }: { serverId: string }) => {
      closeAddFlow();
      router.navigate(buildHostRootRoute(serverId));
    },
    [closeAddFlow],
  );

  return (
    <View ref={containerRef} style={styles.container}>
      <Pressable
        style={pillStyle}
        onPress={togglePill}
        testID="host-switcher-pill"
        accessibilityRole="button"
        accessibilityLabel={t("sidebar.host.switchTitle")}
      >
        <View style={dotStyleForTone(activeTone)} />
        <Text style={styles.pillName} numberOfLines={1}>
          {activeLabel}
        </Text>
        <ThemedChevronDown size={PILL_ICON_SIZE} uniProps={mutedIconColor} />
      </Pressable>

      {open ? (
        <View style={dropUp ? styles.dropdownUp : styles.dropdown} testID="host-switcher-dropdown">
          <Text style={styles.dropdownHeader}>{t("sidebar.host.dropdownTitle")}</Text>
          {hosts.map((host) => (
            <HostSwitcherRow
              key={host.serverId}
              serverId={host.serverId}
              label={normalizeHostLabel(host.label, host.serverId)}
              isCurrent={host.serverId === activeServerId}
              onSelect={handleSelectHost}
            />
          ))}
          <View style={styles.separator} />
          <Pressable
            style={addRowStyle}
            onPress={handleAddHost}
            testID="host-switcher-add"
            accessibilityRole="button"
          >
            <ThemedPlus size={ROW_ICON_SIZE} uniProps={mutedIconColor} />
            <Text style={styles.hostRowName} numberOfLines={1}>
              {t("sidebar.host.addHost")}
            </Text>
          </Pressable>
        </View>
      ) : null}

      <AddHostMethodModal
        visible={addMethodVisible}
        onClose={closeAddFlow}
        onDirectConnection={handleSelectDirect}
        onPasteLink={handleSelectPaste}
        onScanQr={handleSelectPaste}
      />
      <AddHostModal
        visible={directVisible}
        onClose={closeAddFlow}
        onCancel={handleBackToMethods}
        onSaved={handleHostSaved}
      />
      <PairLinkModal
        visible={pasteVisible}
        onClose={closeAddFlow}
        onCancel={handleBackToMethods}
        onSaved={handleHostSaved}
      />
    </View>
  );
}

// One dropdown row per configured host. Each row owns its own connection subscription so
// the list reflects per-host online/connecting/offline tone without a shared status map.
function HostSwitcherRow({
  serverId,
  label,
  isCurrent,
  onSelect,
}: {
  serverId: string;
  label: string;
  isCurrent: boolean;
  onSelect: (serverId: string) => void;
}) {
  const { t } = useTranslation();
  const status = useHostRuntimeConnectionStatus(serverId);
  const tone = selectHostConnectionTone(status);

  const handlePress = useCallback(() => onSelect(serverId), [onSelect, serverId]);
  const rowStyle = useCallback(
    ({ hovered }: HoverState) => [
      styles.hostRow,
      isCurrent && styles.hostRowSelected,
      hovered && styles.hostRowHovered,
    ],
    [isCurrent],
  );
  const accessibilityState = useMemo(() => ({ selected: isCurrent }), [isCurrent]);

  return (
    <Pressable
      style={rowStyle}
      onPress={handlePress}
      testID={`host-switcher-row-${serverId}`}
      accessibilityRole="button"
      accessibilityState={accessibilityState}
    >
      <View style={dotStyleForTone(tone)} />
      <Text style={styles.hostRowName} numberOfLines={1}>
        {label}
      </Text>
      {isCurrent ? (
        <ThemedCheck size={ROW_ICON_SIZE} uniProps={mutedIconColor} />
      ) : (
        <Text style={statusTextStyleForTone(tone)}>{t(`common.connectionStatus.${tone}`)}</Text>
      )}
    </Pressable>
  );
}

// Tone → dot fill. Resolved at render time (after `styles` is initialized) and shared by
// the pill + every row so a tone always maps to one color.
function dotStyleForTone(tone: HostConnectionTone) {
  switch (tone) {
    case "online":
      return styles.dotOnline;
    case "connecting":
      return styles.dotConnecting;
    case "offline":
      return styles.dotOffline;
  }
}

// Tone → status label color, matching the dot fill for dropdown rows.
function statusTextStyleForTone(tone: HostConnectionTone) {
  switch (tone) {
    case "online":
      return styles.statusOnline;
    case "connecting":
      return styles.statusConnecting;
    case "offline":
      return styles.statusOffline;
  }
}

const styles = StyleSheet.create((theme) => ({
  container: {
    position: "relative",
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    paddingVertical: theme.spacing[2],
    paddingHorizontal: 10,
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.surface2,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  pillHovered: {
    backgroundColor: theme.colors.surface3,
  },
  pillOpen: {
    borderColor: theme.colors.accent,
  },
  pillName: {
    flex: 1,
    minWidth: 0,
    // 界面默认正文 14(反馈: 默认界面字体 14px)。
    fontSize: theme.fontSize.sm,
    color: theme.colors.foreground,
  },
  dotOnline: {
    width: 7,
    height: 7,
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.statusSuccess,
  },
  dotConnecting: {
    width: 7,
    height: 7,
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.statusWarning,
  },
  dotOffline: {
    width: 7,
    height: 7,
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.statusDanger,
  },
  dropdown: {
    position: "absolute",
    top: "100%",
    left: 0,
    right: 0,
    marginTop: theme.spacing[1.5],
    backgroundColor: theme.colors.surface0,
    borderWidth: 1,
    borderColor: theme.colors.borderAccent,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[1],
    zIndex: 30,
    shadowColor: "#000000",
    shadowOpacity: 0.16,
    shadowRadius: 40,
    shadowOffset: { width: 0, height: 16 },
    elevation: 12,
  },
  // Footer 形态: pill 在最底, 下拉向上展开 (bottom 锚定) 避免被裁出屏幕 (反馈: host 放设置右边)。
  dropdownUp: {
    position: "absolute",
    bottom: "100%",
    left: 0,
    right: 0,
    marginBottom: theme.spacing[1.5],
    backgroundColor: theme.colors.surface0,
    borderWidth: 1,
    borderColor: theme.colors.borderAccent,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[1],
    zIndex: 30,
    shadowColor: "#000000",
    shadowOpacity: 0.16,
    shadowRadius: 40,
    shadowOffset: { width: 0, height: 16 },
    elevation: 12,
  },
  dropdownHeader: {
    fontSize: 11,
    color: theme.colors.foregroundMuted,
    paddingHorizontal: 9,
    paddingTop: 6,
    paddingBottom: 3,
  },
  hostRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    paddingVertical: 7,
    paddingHorizontal: 9,
    borderRadius: theme.borderRadius.md,
  },
  hostRowHovered: {
    backgroundColor: theme.colors.surface2,
  },
  hostRowSelected: {
    backgroundColor: theme.colors.surface2,
  },
  hostRowName: {
    flex: 1,
    minWidth: 0,
    fontSize: theme.fontSize.sm,
    color: theme.colors.foreground,
  },
  statusOnline: {
    fontSize: 11,
    color: theme.colors.statusSuccess,
  },
  statusConnecting: {
    fontSize: 11,
    color: theme.colors.statusWarning,
  },
  statusOffline: {
    fontSize: 11,
    color: theme.colors.statusDanger,
  },
  separator: {
    height: 1,
    backgroundColor: theme.colors.border,
    marginVertical: theme.spacing[1],
  },
}));
