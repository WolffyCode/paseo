import { observer } from "mobx-react-lite";
import { useCallback, useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { FolderX, type LucideIcon, TriangleAlert, WifiOff } from "lucide-react-native";
import { themeModel } from "../../theme/theme-model";
import type { FileTreeStore } from "../model/file-tree-store";
import { FT_BLUE, FT_DESTRUCTIVE } from "./tokens";

// The non-ready panel states (sFT6): loading skeleton, empty directory, listing error, host offline.
// Pure view — the store's panelState selects which one renders (the panel switches on it); each state's
// exit button dispatches a store action (retry, pick a new directory). Loading is a skeleton with no
// affordance; the rest are centered icon + title + subtitle + action(s).

const SKELETON_WIDTHS = [90, 130, 70, 110] as const;

export const LoadingState = observer(function LoadingState() {
  const tk = themeModel.tokens;
  return (
    <View style={styles.body}>
      {SKELETON_WIDTHS.map((width, index) => (
        <SkeletonRow key={width} width={width} color={tk.toggleActive} withChevron={index < 2} />
      ))}
    </View>
  );
});

// Empty directory: the root listed but has no entries. Exit = switch directory (sFT7).
export const EmptyState = observer(function EmptyState({ store }: { store: FileTreeStore }) {
  const tk = themeModel.tokens;
  const pickDir = useCallback(() => void store.pickAndShowDirectory(), [store]);
  return (
    <CenteredState
      icon={FolderX}
      iconColor={tk.foregroundMuted}
      iconBg={tk.toggleActive}
      title="此目录为空"
      subtitle="没有任何文件或子文件夹。"
      primaryLabel="切换目录"
      onPrimary={pickDir}
    />
  );
});

// Listing error: no permission / path gone. Exits = retry the listing, or pick a new directory.
export const ErrorState = observer(function ErrorState({ store }: { store: FileTreeStore }) {
  const retry = useCallback(() => store.retry(), [store]);
  const pickDir = useCallback(() => void store.pickAndShowDirectory(), [store]);
  return (
    <CenteredState
      icon={TriangleAlert}
      iconColor={FT_DESTRUCTIVE}
      iconBg="rgba(207, 34, 46, 0.1)"
      title="无法读取目录"
      subtitle="无权限访问，或路径已不存在。"
      primaryLabel="重试"
      onPrimary={retry}
      secondaryLabel="重选目录"
      onSecondary={pickDir}
    />
  );
});

// Host offline: the directory tree needs the host online. Exit = retry (re-list once reconnected).
export const OfflineState = observer(function OfflineState({ store }: { store: FileTreeStore }) {
  const retry = useCallback(() => store.retry(), [store]);
  return (
    <CenteredState
      icon={WifiOff}
      iconColor="#9a6700"
      iconBg="rgba(154, 103, 0, 0.12)"
      title="主机已离线"
      subtitle="目录树需主机在线。重连后自动恢复。"
      primaryLabel="重试连接"
      onPrimary={retry}
    />
  );
});

// Shared centered-state scaffold: icon chip + title + subtitle + one or two accent action buttons.
// observer in its own right: it reads themeModel.tokens, and its parents (Error/Offline states)
// track no tokens themselves — without this a scheme flip left these states un-retinted
// (review 2026-07-07).
const CenteredState = observer(function CenteredState({
  icon: Icon,
  iconColor,
  iconBg,
  title,
  subtitle,
  primaryLabel,
  onPrimary,
  secondaryLabel,
  onSecondary,
}: {
  icon: LucideIcon;
  iconColor: string;
  iconBg: string;
  title: string;
  subtitle: string;
  primaryLabel: string;
  onPrimary: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
}) {
  const tk = themeModel.tokens;
  const chipStyle = useMemo(() => [styles.iconChip, { backgroundColor: iconBg }], [iconBg]);
  const titleStyle = useMemo(() => [styles.title, { color: tk.foreground }], [tk.foreground]);
  const subtitleStyle = useMemo(
    () => [styles.subtitle, { color: tk.foregroundMuted }],
    [tk.foregroundMuted],
  );
  return (
    <View style={styles.state}>
      <View style={chipStyle}>
        <Icon size={22} color={iconColor} />
      </View>
      <Text style={titleStyle}>{title}</Text>
      <Text style={subtitleStyle}>{subtitle}</Text>
      <View style={styles.actions}>
        <Pressable onPress={onPrimary} style={styles.actionBtn}>
          <Text style={styles.actionText}>{primaryLabel}</Text>
        </Pressable>
        {secondaryLabel && onSecondary ? (
          <Pressable onPress={onSecondary} style={styles.actionBtn}>
            <Text style={styles.actionText}>{secondaryLabel}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
});

// One shimmer skeleton row: an optional chevron block + an icon block + a text bar of the given width.
function SkeletonRow({
  width,
  color,
  withChevron,
}: {
  width: number;
  color: string;
  withChevron: boolean;
}) {
  const chevStyle = useMemo(
    () => [styles.skChev, { backgroundColor: color, opacity: withChevron ? 1 : 0 }],
    [color, withChevron],
  );
  const iconStyle = useMemo(() => [styles.skIcon, { backgroundColor: color }], [color]);
  const textStyle = useMemo(
    () => [styles.skText, { width, backgroundColor: color }],
    [width, color],
  );
  return (
    <View style={styles.skRow}>
      <View style={chevStyle} />
      <View style={iconStyle} />
      <View style={textStyle} />
    </View>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, minHeight: 0, padding: 4 },
  state: {
    flex: 1,
    minHeight: 0,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingHorizontal: 18,
    paddingVertical: 22,
  },
  iconChip: {
    width: 40,
    height: 40,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontSize: 13, fontWeight: "600", textAlign: "center" },
  subtitle: { fontSize: 11.5, lineHeight: 17, maxWidth: 200, textAlign: "center" },
  actions: { flexDirection: "row", gap: 8 },
  actionBtn: {
    marginTop: 2,
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderRadius: 6,
    borderColor: "rgba(9, 105, 218, 0.35)",
    backgroundColor: "rgba(9, 105, 218, 0.05)",
  },
  actionText: { fontSize: 12, fontWeight: "500", color: FT_BLUE },
  skRow: { flexDirection: "row", alignItems: "center", gap: 8, height: 28, paddingHorizontal: 8 },
  skChev: { width: 12, height: 12, borderRadius: 4 },
  skIcon: { width: 14, height: 14, borderRadius: 4 },
  skText: { height: 9, borderRadius: 4 },
});
