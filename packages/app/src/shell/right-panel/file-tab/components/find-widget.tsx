import { observer } from "mobx-react-lite";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { isWeb } from "@/constants/platform";
import {
  IconArrowUp,
  IconChevronDown,
  IconChevronRight,
  type PanelIcon,
  IconX,
} from "../../components/icons";
import { STATUS_TOKENS } from "../../theme/status-tokens";
import { themeModel } from "../../../theme/theme-model";
import type { FindSessionState } from "../model/find-state";
import type { FileDocumentModel } from "../model/file-document-model";

// The VSCode-style find/replace overlay (ui.html sRS4) — an absolute card floating at the edit body's
// top-right. Pure presentation over the model's find session: it renders doc.find + the UI-local replace
// text and dispatches find intents (query/options/expand/close) to the model; match navigation + replace
// are CM operations handed down as callbacks from the editor surface. Colors FOLLOW the chrome theme (v7).

// The count label: empty query = blank, no matches = "无结果" (red), else "current/total".
function findCountLabel(find: FindSessionState): string {
  if (find.query.length === 0) {
    return "";
  }
  if (find.total === 0) {
    return "无结果";
  }
  return `${find.current}/${find.total}`;
}

export const FindWidget = observer(function FindWidget({
  doc,
  replaceText,
  onReplaceText,
  onNext,
  onPrev,
  onReplaceOne,
  onReplaceAll,
}: {
  doc: FileDocumentModel;
  replaceText: string;
  onReplaceText: (text: string) => void;
  onNext: () => void;
  onPrev: () => void;
  onReplaceOne: () => void;
  onReplaceAll: () => void;
}) {
  const tk = themeModel.tokens;
  const status = STATUS_TOKENS[themeModel.scheme];
  const find = doc.find;
  const queryRef = useRef<TextInput>(null);

  // Focus the query field when the overlay opens, and wire Enter/⇧Enter/Esc on it (web only). Enter =
  // next match, ⇧Enter = previous, Esc = close.
  useEffect(() => {
    const node = queryRef.current as unknown as HTMLElement | null;
    node?.focus?.();
    if (!isWeb || !node) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Enter") {
        event.preventDefault();
        if (event.shiftKey) {
          onPrev();
        } else {
          onNext();
        }
      } else if (event.key === "Escape") {
        event.preventDefault();
        doc.closeFind();
      }
    };
    node.addEventListener("keydown", onKeyDown);
    return () => node.removeEventListener("keydown", onKeyDown);
  }, [doc, onNext, onPrev]);

  const hasMatches = find.total > 0;
  const noResult = find.query.length > 0 && find.total === 0;
  const navColor = hasMatches ? tk.foreground : tk.foregroundMuted;

  const onQueryChange = useCallback((text: string) => doc.setFindQuery(text), [doc]);
  const onClose = useCallback(() => doc.closeFind(), [doc]);
  const onExpandToggle = useCallback(() => {
    if (doc.find.replaceExpanded) {
      doc.openFind();
    } else {
      doc.openReplace();
    }
  }, [doc]);

  const s = useMemo(
    () => ({
      card: [styles.card, { backgroundColor: tk.surfaceCard, borderColor: tk.border }],
      field: [styles.field, { backgroundColor: tk.surfaceCard, borderColor: tk.border }],
      input: [styles.input, { color: tk.foreground }],
      count: [styles.count, { color: noResult ? status.danger : tk.foregroundMuted }],
      rbtnText: [styles.rbtnText, { color: tk.foreground }],
    }),
    [tk, status.danger, noResult],
  );

  return (
    <View style={s.card}>
      <Pressable style={styles.expand} onPress={onExpandToggle} accessibilityRole="button">
        {find.replaceExpanded ? (
          <IconChevronDown size={12} color={tk.foregroundMuted} />
        ) : (
          <IconChevronRight size={12} color={tk.foregroundMuted} />
        )}
      </Pressable>

      <View style={styles.col}>
        <View style={styles.row}>
          <View style={s.field}>
            <TextInput
              ref={queryRef}
              value={find.query}
              onChangeText={onQueryChange}
              placeholder="查找"
              placeholderTextColor={tk.foregroundMuted}
              style={s.input}
            />
            <FindToggle doc={doc} option="matchCase" label="Aa" />
            <FindToggle doc={doc} option="wholeWord" label="ab|" />
            <FindToggle doc={doc} option="regex" label=".*" />
          </View>
          <Text style={s.count}>{findCountLabel(find)}</Text>
          <NavButton Icon={IconArrowUp} color={navColor} onPress={onPrev} disabled={!hasMatches} />
          <NavButton
            Icon={IconChevronDown}
            color={navColor}
            onPress={onNext}
            disabled={!hasMatches}
          />
          <NavButton Icon={IconX} color={tk.foreground} onPress={onClose} />
        </View>

        {find.replaceExpanded ? (
          <View style={styles.row}>
            <View style={s.field}>
              <TextInput
                value={replaceText}
                onChangeText={onReplaceText}
                placeholder="替换"
                placeholderTextColor={tk.foregroundMuted}
                style={s.input}
              />
            </View>
            <Pressable style={styles.rbtn} onPress={onReplaceOne} accessibilityRole="button">
              <Text style={s.rbtnText}>替换</Text>
            </Pressable>
            <Pressable style={styles.rbtn} onPress={onReplaceAll} accessibilityRole="button">
              <Text style={s.rbtnText}>全部</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    </View>
  );
});

// One search option toggle (Aa / ab| / .*). Owns its own dispatch + styles so the parent passes only
// primitives (per the perf-lint pattern); "on" reads the accent over a filled chip (ui.html .fw-toggle.on).
const FindToggle = observer(function FindToggle({
  doc,
  option,
  label,
}: {
  doc: FileDocumentModel;
  option: "matchCase" | "wholeWord" | "regex";
  label: string;
}) {
  const tk = themeModel.tokens;
  const on = doc.find[option];
  const onPress = useCallback(() => doc.toggleFindOption(option), [doc, option]);
  const style = useMemo(
    () => [styles.toggle, on ? { backgroundColor: tk.toggleActive } : null],
    [on, tk.toggleActive],
  );
  const textStyle = useMemo(
    () => [styles.toggleText, { color: on ? tk.accent : tk.foregroundMuted }],
    [on, tk.accent, tk.foregroundMuted],
  );
  return (
    <Pressable style={style} onPress={onPress} accessibilityRole="button">
      <Text style={textStyle}>{label}</Text>
    </Pressable>
  );
});

// A small nav/close button rendering its own icon, dimmed + inert when disabled.
function NavButton({
  Icon,
  color,
  onPress,
  disabled,
}: {
  Icon: PanelIcon;
  color: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const style = useMemo(
    () => [styles.iconBtn, disabled ? styles.iconBtnDisabled : null],
    [disabled],
  );
  return (
    <Pressable
      style={style}
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      accessibilityRole="button"
    >
      <Icon size={12} color={color} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    position: "absolute",
    top: 8,
    right: 16,
    zIndex: 8,
    width: 344,
    borderWidth: 1,
    borderRadius: 6,
    paddingVertical: 5,
    paddingRight: 6,
    paddingLeft: 2,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 2,
  },
  expand: { width: 16, alignSelf: "stretch", alignItems: "center", justifyContent: "center" },
  col: { flex: 1, minWidth: 0, gap: 4 },
  row: { flexDirection: "row", alignItems: "center", gap: 4 },
  field: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    height: 26,
    paddingLeft: 8,
    paddingRight: 4,
    borderWidth: 1,
    borderRadius: 3,
  },
  input: { flex: 1, minWidth: 0, fontFamily: "SFMono-Regular", fontSize: 12, padding: 0 },
  toggle: {
    width: 22,
    height: 20,
    borderRadius: 3,
    alignItems: "center",
    justifyContent: "center",
  },
  toggleText: { fontFamily: "SFMono-Regular", fontSize: 11, fontWeight: "700" },
  count: { fontFamily: "SFMono-Regular", fontSize: 11, paddingHorizontal: 4 },
  iconBtn: {
    width: 22,
    height: 22,
    borderRadius: 3,
    alignItems: "center",
    justifyContent: "center",
  },
  iconBtnDisabled: { opacity: 0.35 },
  rbtn: { height: 22, paddingHorizontal: 7, borderRadius: 3, justifyContent: "center" },
  rbtnText: { fontSize: 11 },
});
