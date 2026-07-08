import { observer } from "mobx-react-lite";
import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  ActivityIndicator,
  type NativeSyntheticEvent,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  type TextInputKeyPressEventData,
  View,
} from "react-native";
import { ChevronDown, ChevronRight, Folder, FolderOpen } from "lucide-react-native";
import { SvgXml } from "react-native-svg";
import { isWeb } from "@/constants/platform";
import { themeModel } from "../../theme/theme-model";
import { getFileIconSvg } from "../icons/material-file-icons";
import { ROW_HOVER_DATASET } from "../util/row-hover-css";
import type { FileTreeStore } from "../model/file-tree-store";
import type { Editing, TreeNodeView } from "../model/types";
import { resolveBlurExit } from "./inline-exit";
import {
  FT_BLUE,
  FT_DESTRUCTIVE,
  FT_FOLDER,
  INDENT_PER_DEPTH,
  INLINE_ERROR_LABEL,
  INLINE_NAME_PLACEHOLDER,
  isModifiedEditorKey,
  isRowHighlighted,
} from "./tokens";

// Web-only input style: kill the browser's default focus outline (it stacked on top of the component's
// own 1.5px border = the "double border") and force text-selectable so ⌘C/⌘V/select work inside the
// input despite the parent Pressable's user-select:none. Ignored on native (these are web style keys).
const WEB_INPUT_STYLE = (isWeb ? { outlineStyle: "none", userSelect: "text" } : null) as
  | object
  | null;

// One tree row (observer): chevron + colored file-type icon + name at depth indent, with hover /
// selected / per-node loading state, OR an inline editor when this row is the active inline new/rename
// target. Pure view — it renders the store's TreeNodeView projection + the editing state and dispatches
// store actions; no tree logic lives here. The inline editor's auto-focus + main-name selection are the
// one view side effect this component owns (the store only sets the editing state; §3.10).

// Whether this row is the rename target's row (the existing node turns into an input in place).
function isRenameRow(node: TreeNodeView, editing: Editing): boolean {
  return editing?.kind === "rename" && editing.targetPath === node.path;
}

export const TreeNode = observer(function TreeNode({
  node,
  store,
}: {
  node: TreeNodeView;
  store: FileTreeStore;
}) {
  const tk = themeModel.tokens;
  const editing = store.editing;
  const inlineEditing = node.isDraft || isRenameRow(node, editing);

  // This row is the open context menu's target (sFT8: the right-clicked row stays highlighted at the
  // selected color until the menu closes).
  const isContextTarget = store.contextMenu?.target.path === node.path;

  // Highlighted rows paint the selected fill inline; idle rows stay transparent and get their hover
  // wash from the CSS :hover rule alone (single hover path — see util/row-hover-css.ts).
  const highlighted = isRowHighlighted({ isSelected: node.isSelected, isContextTarget });
  const rowStyle = useMemo(() => {
    return [
      styles.row,
      {
        paddingLeft: 6 + node.depth * INDENT_PER_DEPTH,
        backgroundColor: highlighted ? tk.toggleActive : "transparent",
      },
    ];
  }, [node.depth, highlighted, tk]);

  const labelStyle = useMemo(() => [styles.label, { color: tk.foreground }], [tk.foreground]);

  // A directory toggles expand/collapse; a file activates (select + open in the right tab). Draft/rename
  // rows ignore the press (the inline input owns interaction). The store decides the transition; this only
  // dispatches — the click is the explicit open hook (联动2), distinct from a bare select.
  const onPress = useCallback(() => {
    if (inlineEditing) {
      return;
    }
    if (node.kind === "directory") {
      void store.toggleExpand(node.path);
    } else {
      store.activateFile(node.path);
    }
  }, [inlineEditing, node.kind, node.path, store]);

  const onContextMenu = useCallback(
    (event: {
      nativeEvent?: { pageX?: number; pageY?: number };
      preventDefault?: () => void;
      stopPropagation?: () => void;
    }) => {
      // Stop the row's right-click from bubbling to the panel's blank-area handler, which would
      // otherwise re-open the menu with kind:"blank" (last handler wins) — so a row always gets its
      // dir/file menu. preventDefault suppresses the browser's native menu on web.
      event.preventDefault?.();
      event.stopPropagation?.();
      const point = event.nativeEvent;
      store.openContextMenu(
        { kind: node.kind === "directory" ? "dir" : "file", path: node.path },
        { x: point?.pageX ?? 0, y: point?.pageY ?? 0 },
      );
    },
    [node.kind, node.path, store],
  );

  return (
    <Pressable
      onPress={onPress}
      // The web CSS :hover rule is the ONLY hover paint (util/row-hover-css.ts). Highlighted rows
      // drop the attribute so the wash never covers the selected/context fill — that also covers
      // the "keep the selected fill under the open menu" case with no JS hover bookkeeping.
      dataSet={highlighted ? undefined : ROW_HOVER_DATASET}
      // @ts-expect-error onContextMenu is web-only and absent from RN's Pressable types.
      onContextMenu={onContextMenu}
      style={rowStyle}
    >
      <NodeChevron node={node} color={tk.foregroundMuted} />
      <NodeIcon node={node} editing={editing} />
      {inlineEditing ? (
        <InlineEditor store={store} />
      ) : (
        <Text numberOfLines={1} style={labelStyle}>
          {node.name}
        </Text>
      )}
    </Pressable>
  );
});

// The expand/collapse caret for directories (down when expanded, right when collapsed); files render a
// blank spacer so their labels align under their siblings' carets.
function NodeChevron({ node, color }: { node: TreeNodeView; color: string }) {
  if (node.kind !== "directory" || node.isDraft) {
    return <View style={styles.chevron} />;
  }
  const Icon = node.isExpanded ? ChevronDown : ChevronRight;
  return (
    <View style={styles.chevron}>
      <Icon size={14} color={color} />
    </View>
  );
}

// The file-type icon: a colored folder (open/closed) for directories, else the material file-type SVG
// (driven live by the draft name's extension while typing). Per-node loading shows a spinner instead.
function NodeIcon({ node, editing }: { node: TreeNodeView; editing: Editing }) {
  if (node.isLoading) {
    return (
      <View style={styles.icon}>
        <ActivityIndicator size={14} color={FT_BLUE} />
      </View>
    );
  }
  if (node.kind === "directory") {
    const Icon = node.isExpanded ? FolderOpen : Folder;
    return (
      <View style={styles.icon}>
        <Icon size={16} color={FT_FOLDER} />
      </View>
    );
  }
  const name = node.isDraft && editing && "draftName" in editing ? editing.draftName : node.name;
  return (
    <View style={styles.icon}>
      <SvgXml xml={getFileIconSvg(name)} width={16} height={16} />
    </View>
  );
}

// The inline new/rename input rendered in place of the label. Owns the auto-focus + (rename) main-name
// selection view side effect; maps Enter→commit, Esc→cancel, blur→the §3.10 commit/cancel decision.
const InlineEditor = observer(function InlineEditor({ store }: { store: FileTreeStore }) {
  const tk = themeModel.tokens;
  const editing = store.editing;
  const inputRef = useRef<TextInput | null>(null);
  const draftName = editing && "draftName" in editing ? editing.draftName : "";
  const error = editing && "error" in editing ? editing.error : null;
  const isRename = editing?.kind === "rename";

  // Focus on mount; for rename, select the base name (extension preserved) so the user can retype it.
  // Runs once when the editor opens for this row — later keystrokes update the store, not the focus.
  useEffect(() => {
    const input = inputRef.current;
    if (!input) {
      return;
    }
    input.focus();
    if (isRename) {
      input.setSelection?.(0, baseNameEnd(draftName));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onChangeText = useCallback((text: string) => store.setDraftName(text), [store]);
  const onSubmitEditing = useCallback(() => void store.commitEdit(), [store]);
  const onKeyPress = useCallback(
    (event: NativeSyntheticEvent<TextInputKeyPressEventData>) => {
      // Leave ⌘/Ctrl combos (copy/paste/select-all/word-nav) entirely to the browser; only ever act on
      // a bare Escape. Otherwise the editor would intercept clipboard shortcuts.
      if (isModifiedEditorKey(event.nativeEvent as { metaKey?: boolean; ctrlKey?: boolean })) {
        return;
      }
      if (event.nativeEvent.key === "Escape") {
        store.cancelEdit();
      }
    },
    [store],
  );

  // Blur maps to commit or cancel per §3.10; guard against a null editing (a commit/cancel already ran).
  const onBlur = useCallback(() => {
    if (!store.editing) {
      return;
    }
    if (resolveBlurExit(store.editing) === "commit") {
      void store.commitEdit();
    } else {
      store.cancelEdit();
    }
  }, [store]);

  // Only a real rejection (duplicate / illegal / reserved) paints the red border + message row; an empty
  // name is the normal start state, surfaced by the in-field placeholder, not a red error.
  const showError = error !== null && error !== "empty";
  const inputStyle = useMemo(
    () => [
      styles.inlineInput,
      { borderColor: showError ? FT_DESTRUCTIVE : FT_BLUE, color: tk.foreground },
      WEB_INPUT_STYLE,
    ],
    [showError, tk.foreground],
  );

  return (
    <View style={styles.inlineWrap}>
      <TextInput
        ref={inputRef}
        value={draftName}
        onChangeText={onChangeText}
        onSubmitEditing={onSubmitEditing}
        onKeyPress={onKeyPress}
        onBlur={onBlur}
        blurOnSubmit={false}
        autoCapitalize="none"
        autoCorrect={false}
        spellCheck={false}
        placeholder={INLINE_NAME_PLACEHOLDER}
        placeholderTextColor={tk.foregroundMuted}
        style={inputStyle}
      />
      {showError ? <Text style={inlineErrorStyle}>{INLINE_ERROR_LABEL[error]}</Text> : null}
    </View>
  );
});

// The index just past the base name (before the extension dot) for rename selection; whole string when
// there is no extension. Mirrors the icon mapping's extension split so the selection matches the icon.
function baseNameEnd(name: string): number {
  const dot = name.lastIndexOf(".");
  return dot <= 0 ? name.length : dot;
}

// The inline error text floats just below the input (absolute) so showing it never grows the 28px row
// or shoves the tree up. Static const = a stable reference the perf lint accepts as a style prop.
const inlineErrorStyle = {
  position: "absolute",
  top: 23,
  left: 2,
  fontSize: 11,
  color: FT_DESTRUCTIVE,
} as const;

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 28,
    paddingRight: 6,
    borderRadius: 6,
  },
  chevron: { width: 14, height: 14, alignItems: "center", justifyContent: "center" },
  icon: { width: 16, height: 16, alignItems: "center", justifyContent: "center" },
  label: { flexShrink: 1, fontSize: 13 },
  inlineWrap: { flex: 1, minWidth: 0, position: "relative" },
  inlineInput: {
    height: 22,
    paddingHorizontal: 5,
    borderWidth: 1.5,
    borderRadius: 4,
    fontSize: 13,
  },
});
