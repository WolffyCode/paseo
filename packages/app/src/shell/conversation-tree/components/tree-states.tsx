import { observer } from "mobx-react-lite";
import { LoaderCircle, TriangleAlert, WifiOff } from "lucide-react-native";
import { useCallback, useMemo } from "react";
import { Pressable, type PressableStateCallbackType, StyleSheet, Text, View } from "react-native";
import { themeModel } from "../../theme/theme-model";
import type { ConversationTreeStore } from "../model/conversation-tree-store";

const SKELETON_WIDTHS = [92, 128, 76, 116, 104] as const;
type HoverState = PressableStateCallbackType & { hovered?: boolean };

/** Render stable row-shaped placeholders while the first snapshot is loading. */
export const ConversationTreeLoadingState = observer(function ConversationTreeLoadingState() {
  const tk = themeModel.tokens;
  const mutedStyle = useMemo(
    () => [styles.mutedText, { color: tk.foregroundMuted }],
    [tk.foregroundMuted],
  );
  return (
    <View style={styles.loading} testID="conv-tree-loading">
      {SKELETON_WIDTHS.map((width, index) => (
        <SkeletonRow key={width} width={width} indented={index === 2} color={tk.toggleActive} />
      ))}
      <View style={styles.loadingLabel}>
        <LoaderCircle size={14} color={tk.accent} />
        <Text style={mutedStyle}>加载对话树...</Text>
      </View>
    </View>
  );
});

function SkeletonRow({
  width,
  indented,
  color,
}: {
  width: number;
  indented: boolean;
  color: string;
}) {
  const rowStyle = useMemo(
    () => [styles.skeletonRow, indented ? styles.indented : null],
    [indented],
  );
  const iconStyle = useMemo(() => [styles.skeletonIcon, { backgroundColor: color }], [color]);
  const textStyle = useMemo(
    () => [styles.skeletonText, { width, backgroundColor: color }],
    [color, width],
  );
  return (
    <View style={rowStyle}>
      <View style={iconStyle} />
      <View style={textStyle} />
    </View>
  );
}

/** Keep the permanent toolbar alive while presenting a scoped load failure and retry. */
export const ConversationTreeErrorState = observer(function ConversationTreeErrorState({
  store,
}: {
  store: ConversationTreeStore;
}) {
  const tk = themeModel.tokens;
  const retry = useCallback(() => void store.load(), [store]);
  const buttonStyle = useCallback(
    ({ hovered, pressed }: HoverState) => [
      styles.retry,
      { borderColor: tk.accentSoft, backgroundColor: hovered ? tk.tabHover : "transparent" },
      pressed ? { backgroundColor: tk.toggleActive } : null,
    ],
    [tk.accentSoft, tk.tabHover, tk.toggleActive],
  );
  const iconStyle = useMemo(
    () => [styles.errorIcon, { backgroundColor: tk.statusDangerSoft }],
    [tk.statusDangerSoft],
  );
  const titleStyle = useMemo(() => [styles.title, { color: tk.foreground }], [tk.foreground]);
  const subtitleStyle = useMemo(
    () => [styles.subtitle, { color: tk.foregroundMuted }],
    [tk.foregroundMuted],
  );
  const retryTextStyle = useMemo(() => [styles.retryText, { color: tk.accent }], [tk.accent]);
  return (
    <View style={styles.error} testID="conv-tree-error">
      <View style={iconStyle}>
        <TriangleAlert size={21} color={tk.statusDanger} />
      </View>
      <Text style={titleStyle}>无法加载对话列表</Text>
      <Text style={subtitleStyle}>与主机通信异常</Text>
      <Pressable
        accessibilityRole="button"
        onPress={retry}
        style={buttonStyle}
        testID="conv-tree-error-retry"
      >
        <Text style={retryTextStyle}>重试</Text>
      </Pressable>
    </View>
  );
});

/** Present the live React-layer offline state above the frozen last-known tree. */
export const ConversationTreeOfflineBar = observer(function ConversationTreeOfflineBar({
  onReconnect,
}: {
  onReconnect: () => void;
}) {
  const tk = themeModel.tokens;
  const barStyle = useMemo(
    () => [
      styles.offlineBar,
      { backgroundColor: tk.statusWarningSoft, borderBottomColor: tk.statusWarning },
    ],
    [tk.statusWarning, tk.statusWarningSoft],
  );
  const offlineTextStyle = useMemo(
    () => [styles.offlineText, { color: tk.statusWarning }],
    [tk.statusWarning],
  );
  const reconnectTextStyle = useMemo(
    () => [styles.reconnectText, { color: tk.accent }],
    [tk.accent],
  );
  return (
    <View style={barStyle} testID="conv-tree-offline">
      <WifiOff size={14} color={tk.statusWarning} />
      <Text style={offlineTextStyle}>主机离线</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="重新连接主机"
        onPress={onReconnect}
        testID="conv-tree-offline-reconnect"
      >
        <Text style={reconnectTextStyle}>重连</Text>
      </Pressable>
    </View>
  );
});

/** Render the two distinct empty hints without turning them into a page takeover. */
export const ConversationTreeEmptyHint = observer(function ConversationTreeEmptyHint({
  indented,
  testID,
}: {
  indented: boolean;
  testID: string;
}) {
  const tk = themeModel.tokens;
  const hintStyle = useMemo(
    () => [styles.emptyHint, indented ? styles.emptyIndented : null],
    [indented],
  );
  const textStyle = useMemo(
    () => [styles.mutedText, { color: tk.foregroundMuted }],
    [tk.foregroundMuted],
  );
  return (
    <View style={hintStyle} testID={testID}>
      <Text style={textStyle}>暂无对话</Text>
    </View>
  );
});

const styles = StyleSheet.create({
  loading: { flex: 1, minHeight: 0, paddingHorizontal: 8, paddingTop: 4 },
  skeletonRow: {
    height: 24,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 9,
  },
  indented: { paddingLeft: 37 },
  skeletonIcon: { width: 14, height: 14, borderRadius: 4 },
  skeletonText: { height: 10, borderRadius: 4 },
  loadingLabel: {
    height: 30,
    paddingHorizontal: 9,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  error: {
    flex: 1,
    minHeight: 0,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 22,
  },
  errorIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontSize: 12.5, fontWeight: "600", textAlign: "center" },
  subtitle: { fontSize: 11.5, lineHeight: 17, textAlign: "center" },
  retry: {
    marginTop: 2,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  retryText: { fontSize: 11.5, fontWeight: "500" },
  offlineBar: {
    flexShrink: 0,
    height: 32,
    borderBottomWidth: 1,
    paddingHorizontal: 9,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  offlineText: { flex: 1, fontSize: 11 },
  reconnectText: { fontSize: 11, fontWeight: "500" },
  emptyHint: { height: 30, justifyContent: "center", paddingHorizontal: 9 },
  emptyIndented: { paddingLeft: 44 },
  mutedText: { fontSize: 12.5 },
});
