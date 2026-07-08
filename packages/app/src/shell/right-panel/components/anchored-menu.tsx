import { observer } from "mobx-react-lite";
import { type ReactNode, useEffect, useMemo, useRef } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { isWeb } from "@/constants/platform";
import { useWebDomClick } from "../../file-tree/components/use-web-dom-click";
import { themeModel } from "../../theme/theme-model";
import type { PanelIcon } from "./icons";

// A small anchored floating menu (the shared `.ctx` look) for the tab framework's new-tab dropdown + the
// tab right-click menu — NOT the old app context-menu primitive. It positions absolutely at the anchor
// (relative to its positioned parent), closes on an outside mousedown or Esc (web), and renders rows fed
// by the caller. The open/anchor is UI-local state; the domain models carry no menu position.

export const AnchoredMenu = observer(function AnchoredMenu({
  anchor,
  onClose,
  width,
  children,
}: {
  anchor: { x: number; y: number } | null;
  onClose: () => void;
  width: number;
  children: ReactNode;
}) {
  const menuRef = useRef<View>(null);
  const tk = themeModel.tokens;

  // Close on an outside mousedown (fires before a new click lands) or Esc; a mousedown inside the menu is
  // ignored so a row's own click still fires.
  useEffect(() => {
    if (!isWeb || !anchor) {
      return;
    }
    const node = menuRef.current as unknown as HTMLElement | null;
    const onDown = (event: MouseEvent): void => {
      if (!node || !node.contains(event.target as Node)) {
        onClose();
      }
    };
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [anchor, onClose]);

  const style = useMemo(
    () => [
      styles.menu,
      {
        left: anchor?.x ?? 0,
        top: anchor?.y ?? 0,
        width,
        backgroundColor: tk.surfaceCard,
        borderColor: tk.border,
      },
    ],
    [anchor?.x, anchor?.y, width, tk.surfaceCard, tk.border],
  );
  if (!anchor) {
    return null;
  }
  return (
    <View ref={menuRef} style={style}>
      {children}
    </View>
  );
});

// One menu row: label + optional leading icon + optional trailing chip (a ⌘-shortcut keycap or a "后续"
// roadmap badge, driven by data — no JSX prop), dispatched through the raw DOM click hook (RN-web press
// drops rapid clicks). Disabled rows grey out and don't fire.
export const MenuItemRow = observer(function MenuItemRow({
  label,
  icon: Icon,
  shortcut,
  soon,
  disabled,
  onPress,
}: {
  label: string;
  icon?: PanelIcon;
  shortcut?: string;
  soon?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const tk = themeModel.tokens;
  const hostRef = useWebDomClick({ onPress, disabled: disabled ?? false });
  const style = useMemo(
    () => (disabled ? [styles.row, styles.rowDisabled] : styles.row),
    [disabled],
  );
  const textStyle = useMemo(() => [styles.rowText, { color: tk.foreground }], [tk.foreground]);
  return (
    <Pressable
      ref={hostRef}
      style={style}
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      accessibilityRole="menuitem"
    >
      {Icon ? <Icon size={14} color={tk.foregroundMuted} /> : null}
      <Text style={textStyle}>{label}</Text>
      <TrailingChip shortcut={shortcut} soon={soon} />
    </Pressable>
  );
});

// A menu row's trailing chip: the "后续" roadmap badge, the shortcut keycap, or nothing (branched here so
// the row's JSX carries no nested ternary).
const TrailingChip = observer(function TrailingChip({
  shortcut,
  soon,
}: {
  shortcut?: string;
  soon?: boolean;
}) {
  const tk = themeModel.tokens;
  const chip = useMemo(
    () => [styles.chip, { backgroundColor: tk.toggleActive, borderColor: tk.border }],
    [tk.toggleActive, tk.border],
  );
  const soonText = useMemo(
    () => [styles.soonText, { color: tk.foregroundMuted }],
    [tk.foregroundMuted],
  );
  const kbdText = useMemo(
    () => [styles.kbdText, { color: tk.foregroundMuted }],
    [tk.foregroundMuted],
  );
  if (soon) {
    return (
      <View style={chip}>
        <Text style={soonText}>后续</Text>
      </View>
    );
  }
  if (shortcut) {
    return (
      <View style={chip}>
        <Text style={kbdText}>{shortcut}</Text>
      </View>
    );
  }
  return null;
});

const styles = StyleSheet.create({
  menu: {
    position: "absolute",
    zIndex: 20,
    borderWidth: 1,
    borderRadius: 10,
    padding: 5,
    shadowColor: "#1f2328",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 8,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    height: 30,
    paddingHorizontal: 11,
    borderRadius: 6,
  },
  rowDisabled: { opacity: 0.5 },
  rowText: { fontSize: 13, flex: 1 },
  chip: { borderWidth: 1, borderRadius: 5, paddingHorizontal: 6, paddingVertical: 1 },
  soonText: { fontSize: 10, fontWeight: "700" },
  kbdText: { fontFamily: "SFMono-Regular", fontSize: 11 },
});
