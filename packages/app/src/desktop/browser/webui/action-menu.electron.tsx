import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Pressable, Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { CHROME_FONT_FAMILY } from "@/desktop/browser/chrome-theme";
import { getOverlayRoot, useOverlayLayer } from "@/lib/overlay-root";
import { WEBUI_LAYOUT } from "./theme";

// showAt's MENU_VERTICAL_OFFSET_PX, for a menu opened under its anchor.
const BELOW_ANCHOR_OFFSET = 5;
const MENU_MIN_WIDTH = 128;

export interface CrActionMenuItem<Id extends string> {
  id: Id;
  label: string;
}

/**
 * Where the menu opens: over its anchor with their top-right corners together (a ⋮ button's
 * menu), or 5 dip under it with their right edges lined up.
 */
export type CrActionMenuPlacement = "overAnchor" | "belowAnchor";

/**
 * cr-action-menu: a list of choices floating by its anchor, closed by Esc or a click elsewhere.
 * `isCompact` is the time picker's look, rounder and with tighter rows.
 */
export function CrActionMenu<Id extends string>({
  anchor,
  placement,
  isCompact = false,
  items,
  onChoose,
  onClose,
  testID,
}: {
  anchor: HTMLElement;
  placement: CrActionMenuPlacement;
  isCompact?: boolean;
  items: readonly CrActionMenuItem<Id>[];
  onChoose: (id: Id) => void;
  onClose: () => void;
  testID?: string;
}) {
  const layer = useOverlayLayer("floating");
  // showAt focuses the menu itself, so nothing is highlighted until the pointer or an arrow key
  // reaches an item.
  const [highlightedIndex, setHighlightedIndex] = useState<number | null>(null);
  useEffect(() => {
    // Listening while the event captures, the menu sees keys before a dialog under it does.
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
        return;
      }
      const step = { ArrowDown: 1, ArrowUp: -1 }[event.key];
      if (step) {
        event.preventDefault();
        setHighlightedIndex((index) => {
          if (index === null) return step > 0 ? 0 : items.length - 1;
          return (index + step + items.length) % items.length;
        });
        return;
      }
      const highlighted = highlightedIndex === null ? undefined : items[highlightedIndex];
      if (event.key === "Enter" && highlighted) {
        event.preventDefault();
        onChoose(highlighted.id);
      }
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [highlightedIndex, items, onChoose, onClose]);
  const bounds = anchor.getBoundingClientRect();
  const position = useMemo(
    () => ({
      top: placement === "overAnchor" ? bounds.top : bounds.bottom + BELOW_ANCHOR_OFFSET,
      right: window.innerWidth - bounds.right,
    }),
    [bounds.bottom, bounds.right, bounds.top, placement],
  );
  const layerStyle = useMemo(() => [styles.layer, { zIndex: layer }], [layer]);
  // The overlay root lets clicks through to the app; the menu and its backdrop take them back.
  return createPortal(
    <View style={layerStyle} pointerEvents="box-none">
      <Pressable accessible={false} style={styles.backdrop} onPress={onClose} />
      <View
        accessibilityRole="menu"
        style={[styles.menu, isCompact && styles.menuCompact, position]}
        testID={testID}
      >
        {items.map((item, index) => (
          <MenuItem
            key={item.id}
            item={item}
            index={index}
            isCompact={isCompact}
            isHighlighted={index === highlightedIndex}
            onHighlight={setHighlightedIndex}
            onChoose={onChoose}
            testID={testID ? `${testID}-${item.id}` : undefined}
          />
        ))}
      </View>
    </View>,
    getOverlayRoot(),
  );
}

function MenuItem<Id extends string>({
  item,
  index,
  isCompact,
  isHighlighted,
  onHighlight,
  onChoose,
  testID,
}: {
  item: CrActionMenuItem<Id>;
  index: number;
  isCompact: boolean;
  isHighlighted: boolean;
  onHighlight: (index: number) => void;
  onChoose: (id: Id) => void;
  testID?: string;
}) {
  const choose = useCallback(() => onChoose(item.id), [item.id, onChoose]);
  const highlight = useCallback(() => onHighlight(index), [index, onHighlight]);
  return (
    <Pressable
      accessibilityRole="menuitem"
      onHoverIn={highlight}
      onPress={choose}
      style={[
        styles.item,
        isCompact && styles.itemCompact,
        isHighlighted && styles.itemHighlighted,
      ]}
      testID={testID}
    >
      <Text style={styles.itemText}>{item.label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create((theme) => {
  const colors = theme.webui;
  return {
    layer: {
      position: "absolute",
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
    },
    backdrop: {
      position: "absolute",
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
    },
    // cr-action-menu: radius 4, rows 8 dip above and below their text and 24 in.
    menu: {
      position: "absolute",
      minWidth: MENU_MIN_WIDTH,
      paddingVertical: 8,
      borderRadius: 4,
      backgroundColor: colors.actionMenu,
      boxShadow: WEBUI_LAYOUT.cardShadow,
    },
    menuCompact: {
      borderRadius: 12,
    },
    item: {
      minHeight: 32,
      justifyContent: "center",
      paddingVertical: 8,
      paddingHorizontal: 24,
    },
    itemCompact: {
      paddingVertical: 4,
      paddingHorizontal: 16,
    },
    itemHighlighted: {
      backgroundColor: colors.hover,
    },
    itemText: {
      fontFamily: CHROME_FONT_FAMILY,
      fontSize: WEBUI_LAYOUT.fontSize,
      lineHeight: WEBUI_LAYOUT.lineHeight,
      color: colors.actionMenuText,
    },
  };
});
