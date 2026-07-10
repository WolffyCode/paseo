import { observer } from "mobx-react-lite";
import { type ReactNode, useEffect, useMemo, useRef } from "react";
import { Pressable, StyleSheet, type StyleProp, Text, View, type ViewStyle } from "react-native";
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

// One executable menu row: label + optional icon, dispatched through the raw DOM click hook because
// RN-web's synthetic press path drops rapid clicks when the surrounding menu re-renders.
export const MenuItemRow = observer(function MenuItemRow({
  label,
  icon: Icon,
  onPress,
}: {
  label: string;
  icon?: PanelIcon;
  onPress: () => void;
}) {
  const tk = themeModel.tokens;
  const hostRef = useWebDomClick({ onPress, disabled: false });
  const textStyle = useMemo(() => [styles.rowText, { color: tk.foreground }], [tk.foreground]);
  return (
    <Pressable ref={hostRef} style={styles.row} onPress={onPress} accessibilityRole="menuitem">
      {Icon ? <Icon size={14} color={tk.foregroundMuted} /> : null}
      <Text style={textStyle}>{label}</Text>
    </Pressable>
  );
});

// One commandless deferred row for the new-tab roadmap: icon + label + "后续", always disabled.
export const DeferredMenuItemRow = observer(function DeferredMenuItemRow({
  label,
  icon: Icon,
}: {
  label: string;
  icon: PanelIcon;
}) {
  const tk = themeModel.tokens;
  const textStyle = useMemo(() => [styles.rowText, { color: tk.foreground }], [tk.foreground]);
  const chip = useMemo(
    () => [styles.chip, { backgroundColor: tk.toggleActive, borderColor: tk.border }],
    [tk.toggleActive, tk.border],
  );
  const soonText = useMemo(
    () => [styles.soonText, { color: tk.foregroundMuted }],
    [tk.foregroundMuted],
  );
  return (
    <Pressable style={deferredRowStyle} disabled accessibilityRole="menuitem">
      <Icon size={14} color={tk.foregroundMuted} />
      <Text style={textStyle}>{label}</Text>
      <View style={chip}>
        <Text style={soonText}>后续</Text>
      </View>
    </Pressable>
  );
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
});

const deferredRowStyle: StyleProp<ViewStyle> = [styles.row, styles.rowDisabled];
