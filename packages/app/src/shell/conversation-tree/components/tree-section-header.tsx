import { observer } from "mobx-react-lite";
import { FolderPlus } from "lucide-react-native";
import { useCallback, useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { isNative } from "@/constants/platform";
import { themeModel } from "../../theme/theme-model";
import { CONVERSATION_SECTION_ACTION_DATASET, CONVERSATION_SECTION_DATASET } from "./row-hover-css";

export type ConversationTreeSectionId = "pinned" | "projects" | "conversations";

/** Render one structural group label and the project-picker affordance when applicable. */
export const TreeSectionHeader = observer(function TreeSectionHeader({
  section,
  showAction,
  actionAlwaysVisible,
  actionDisabled,
  onAction,
}: {
  section: ConversationTreeSectionId;
  showAction: boolean;
  actionAlwaysVisible: boolean;
  actionDisabled: boolean;
  onAction: () => void;
}) {
  const tk = themeModel.tokens;
  const label = SECTION_LABEL[section];
  const labelStyle = useMemo(
    () => [styles.label, { color: tk.foregroundMuted }],
    [tk.foregroundMuted],
  );
  const actionStyle = useMemo(
    () => [
      styles.action,
      { opacity: isNative || actionAlwaysVisible ? 1 : 0 },
      actionDisabled ? styles.disabled : null,
    ],
    [actionAlwaysVisible, actionDisabled],
  );
  const handleAction = useCallback(
    (event: { stopPropagation?: () => void }) => {
      event.stopPropagation?.();
      onAction();
    },
    [onAction],
  );
  const accessibilityState = useMemo(() => ({ disabled: actionDisabled }), [actionDisabled]);
  return (
    <View
      dataSet={CONVERSATION_SECTION_DATASET}
      style={styles.header}
      testID={`conv-tree-section-${section}`}
    >
      <Text style={labelStyle}>{label}</Text>
      {showAction ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="添加项目"
          accessibilityState={accessibilityState}
          dataSet={CONVERSATION_SECTION_ACTION_DATASET}
          disabled={actionDisabled}
          onPress={handleAction}
          style={actionStyle}
          testID="conv-tree-add-project"
        >
          <FolderPlus size={13} color={tk.foregroundMuted} />
        </Pressable>
      ) : null}
    </View>
  );
});

const SECTION_LABEL: Record<ConversationTreeSectionId, string> = {
  pinned: "置顶",
  projects: "项目",
  conversations: "对话",
};

const styles = StyleSheet.create({
  header: {
    height: 30,
    paddingHorizontal: 9,
    paddingTop: 7,
    paddingBottom: 3,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  label: { flex: 1, fontSize: 12.5, fontWeight: "500" },
  action: {
    width: 20,
    height: 20,
    borderRadius: 5,
    alignItems: "center",
    justifyContent: "center",
  },
  disabled: { opacity: 0.45 },
});
