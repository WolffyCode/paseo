import { observer } from "mobx-react-lite";
import { PenLine, Search } from "lucide-react-native";
import { useCallback, useMemo } from "react";
import { Pressable, type PressableStateCallbackType, StyleSheet, Text, View } from "react-native";
import { themeModel } from "../../theme/theme-model";
import type { ConversationTreeStore } from "../model/conversation-tree-store";

type HoverState = PressableStateCallbackType & { hovered?: boolean };

/** Render the two permanent entry rows and dispatch their store-owned actions. */
export const TreeToolbar = observer(function TreeToolbar({
  store,
  disabled,
}: {
  store: ConversationTreeStore;
  disabled: boolean;
}) {
  const openNewConversation = useCallback(() => store.openNewConversation(), [store]);
  const openSearch = useCallback(() => store.openSearch(), [store]);
  return (
    <View style={styles.toolbar} testID="conv-tree-toolbar">
      <ToolbarRow
        icon={PenLine}
        label="新对话"
        disabled={disabled}
        onPress={openNewConversation}
        testID="conv-tree-new-conversation"
      />
      <ToolbarRow
        icon={Search}
        label="搜索"
        shortcut="⌘K"
        muted
        disabled={disabled}
        onPress={openSearch}
        testID="conv-tree-search"
      />
    </View>
  );
});

/** Render one pressable toolbar entry with hover/disabled styling and an optional shortcut hint. */
const ToolbarRow = observer(function ToolbarRow({
  icon: Icon,
  label,
  shortcut,
  muted = false,
  disabled,
  onPress,
  testID,
}: {
  icon: typeof Search;
  label: string;
  shortcut?: string;
  muted?: boolean;
  disabled: boolean;
  onPress: () => void;
  testID: string;
}) {
  const tk = themeModel.tokens;
  const rowStyle = useCallback(
    ({ hovered, pressed }: HoverState) => [
      styles.row,
      hovered && !disabled ? { backgroundColor: tk.tabHover } : null,
      pressed && !disabled ? { backgroundColor: tk.toggleActive } : null,
      disabled ? styles.disabled : null,
    ],
    [disabled, tk.tabHover, tk.toggleActive],
  );
  const labelStyle = useMemo(
    () => [styles.label, { color: muted ? tk.foregroundMuted : tk.foreground }],
    [muted, tk.foreground, tk.foregroundMuted],
  );
  const shortcutStyle = useMemo(
    () => [
      styles.shortcut,
      {
        color: tk.foregroundMuted,
        backgroundColor: tk.toggleActive,
        borderColor: tk.border,
      },
    ],
    [tk.border, tk.foregroundMuted, tk.toggleActive],
  );
  const accessibilityState = useMemo(() => ({ disabled }), [disabled]);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={accessibilityState}
      disabled={disabled}
      onPress={onPress}
      style={rowStyle}
      testID={testID}
    >
      <Icon size={16} color={tk.foregroundMuted} />
      <Text numberOfLines={1} style={labelStyle}>
        {label}
      </Text>
      {shortcut === undefined ? null : <Text style={shortcutStyle}>{shortcut}</Text>}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  toolbar: { flexDirection: "column", gap: 2, marginBottom: 6, paddingHorizontal: 8 },
  row: {
    height: 32,
    borderRadius: 7,
    paddingHorizontal: 9,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  disabled: { opacity: 0.45 },
  label: { flex: 1, minWidth: 0, fontSize: 13.5 },
  shortcut: {
    flexShrink: 0,
    borderWidth: 1,
    borderRadius: 5,
    paddingHorizontal: 6,
    paddingVertical: 1,
    fontFamily: "monospace",
    fontSize: 10.5,
  },
});
