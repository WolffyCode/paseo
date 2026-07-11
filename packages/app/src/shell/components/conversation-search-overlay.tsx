import { observer } from "mobx-react-lite";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  type NativeSyntheticEvent,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  type TextInputKeyPressEventData,
} from "react-native";
import type { ConversationTreeStore } from "../conversation-tree/model/conversation-tree-store";
import {
  findConversationSearchCandidates,
  type ConversationSearchCandidate,
} from "../conversation-tree/model/search-candidates";
import type { SelectableConversationTreeNode } from "../conversation-tree/model/types";
import { themeModel } from "../theme/theme-model";

export interface ConversationSearchOverlayProps {
  readonly store: ConversationTreeStore;
  readonly visible: boolean;
  readonly onClose: () => void;
}

/**
 * The shell's own minimal search surface. The old command center hardcodes navigation to the
 * pre-shell workspace route on candidate select and exposes no seam to change that (see
 * left-region.tsx's interception for why this exists instead of reusing it) — every path here
 * stays inside the shell via store.activateNode, never expo-router navigation.
 */
export const ConversationSearchOverlay = observer(function ConversationSearchOverlay({
  store,
  visible,
  onClose,
}: ConversationSearchOverlayProps) {
  const tk = themeModel.tokens;
  const [query, setQuery] = useState("");
  const inputRef = useRef<TextInput>(null);

  const candidates = useMemo(
    () => findConversationSearchCandidates({ nodes: store.tree, query }),
    [store.tree, query],
  );

  const handleClose = useCallback(() => {
    setQuery("");
    onClose();
  }, [onClose]);

  const handleSelect = useCallback(
    (node: SelectableConversationTreeNode) => {
      store.activateNode(node);
      handleClose();
    },
    [store, handleClose],
  );

  const handleShow = useCallback(() => {
    inputRef.current?.focus();
  }, []);

  const handleKeyPress = useCallback(
    (event: NativeSyntheticEvent<TextInputKeyPressEventData>) => {
      if (event.nativeEvent.key === "Escape") {
        handleClose();
        return;
      }
      if (event.nativeEvent.key === "Enter" && candidates.length > 0) {
        const first = candidates[0];
        if (first !== undefined) {
          handleSelect(first.node);
        }
      }
    },
    [candidates, handleClose, handleSelect],
  );

  const panelStyle = useMemo(
    () => [styles.panel, { backgroundColor: tk.surfaceCard, borderColor: tk.border }],
    [tk.surfaceCard, tk.border],
  );
  const inputStyle = useMemo(
    () => [styles.input, { color: tk.foreground, borderColor: tk.border }],
    [tk.foreground, tk.border],
  );
  const emptyStyle = useMemo(
    () => [styles.empty, { color: tk.foregroundMuted }],
    [tk.foregroundMuted],
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
      onShow={handleShow}
    >
      <Pressable
        accessibilityLabel="关闭搜索"
        onPress={handleClose}
        style={styles.backdrop}
        testID="shell-search-backdrop"
      >
        <Pressable onPress={stopPropagation} style={panelStyle}>
          <TextInput
            ref={inputRef}
            value={query}
            onChangeText={setQuery}
            onKeyPress={handleKeyPress}
            placeholder="搜索对话..."
            placeholderTextColor={tk.foregroundMuted}
            style={inputStyle}
            testID="shell-search-input"
          />
          <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
            {candidates.length === 0 ? (
              <Text style={emptyStyle}>无匹配结果</Text>
            ) : (
              candidates.map((candidate) => (
                <SearchCandidateRow
                  key={candidate.node.id}
                  candidate={candidate}
                  onSelect={handleSelect}
                />
              ))
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
});

/** Render one selectable candidate row with its owning project breadcrumb and node kind. */
const SearchCandidateRow = observer(function SearchCandidateRow({
  candidate,
  onSelect,
}: {
  candidate: ConversationSearchCandidate;
  onSelect: (node: SelectableConversationTreeNode) => void;
}) {
  const tk = themeModel.tokens;
  const handlePress = useCallback(() => onSelect(candidate.node), [candidate.node, onSelect]);
  const kindLabel = candidate.node.kind === "subagent" ? "子代理" : "对话";
  const rowStyle = useCallback(
    ({ hovered, pressed }: { hovered?: boolean; pressed: boolean }) => [
      styles.row,
      hovered ? { backgroundColor: tk.tabHover } : null,
      pressed ? { backgroundColor: tk.toggleActive } : null,
    ],
    [tk.tabHover, tk.toggleActive],
  );
  const rowTitleStyle = useMemo(() => [styles.rowTitle, { color: tk.foreground }], [tk.foreground]);
  const rowMetaStyle = useMemo(
    () => [styles.rowMeta, { color: tk.foregroundMuted }],
    [tk.foregroundMuted],
  );
  return (
    <Pressable
      accessibilityRole="button"
      onPress={handlePress}
      style={rowStyle}
      testID={`shell-search-candidate-${candidate.node.id}`}
    >
      <Text numberOfLines={1} style={rowTitleStyle}>
        {candidate.node.title}
      </Text>
      <Text numberOfLines={1} style={rowMetaStyle}>
        {candidate.projectName === null ? kindLabel : `${candidate.projectName} · ${kindLabel}`}
      </Text>
    </Pressable>
  );
});

function stopPropagation(): void {
  // Swallow taps on the panel itself so they don't bubble to the backdrop's close handler.
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: "center",
    paddingTop: 96,
    backgroundColor: "rgba(0, 0, 0, 0.35)",
  },
  panel: {
    width: 480,
    maxWidth: "90%",
    maxHeight: 420,
    borderWidth: 1,
    borderRadius: 10,
    padding: 8,
    gap: 8,
  },
  input: {
    height: 38,
    borderWidth: 1,
    borderRadius: 7,
    paddingHorizontal: 10,
    fontSize: 14,
  },
  list: { flexGrow: 0 },
  empty: { paddingVertical: 16, textAlign: "center", fontSize: 13 },
  row: { borderRadius: 7, paddingHorizontal: 9, paddingVertical: 7, gap: 2 },
  rowTitle: { fontSize: 13.5 },
  rowMeta: { fontSize: 11.5 },
});
