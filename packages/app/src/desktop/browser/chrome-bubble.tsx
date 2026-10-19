import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Pressable, Text, View, type PressableStateCallbackType } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { getOverlayRoot, useOverlayLayer } from "@/lib/overlay-root";
import { ChromeIcon } from "./chrome-icons";
import { CHROME_LAYOUT, chromeColorProps } from "./chrome-theme";
import { useElementBounds } from "./use-element-bounds";

// Chrome hangs a bubble just under its button, lined up with the button's outer edge.
const BUBBLE_ANCHOR_GAP = 4;
// The ✕ at a bubble's top right: a 20 dip glyph with a round hover fill.
const CLOSE_ICON_SIZE = 20;

type HoverState = PressableStateCallbackType & { hovered?: boolean };

/**
 * A Chrome bubble: a panel hanging from a toolbar button, closed by a click outside it or by
 * Escape. Chrome uses this shape for the extensions menu, downloads and the bookmark star.
 */
export function ChromeBubble({
  anchor,
  width,
  align = "end",
  isModal = true,
  onClose,
  testID,
  children,
}: {
  anchor: HTMLElement | null;
  width: number;
  /** Which edge of the anchor the bubble lines up with: toolbar bubbles end, tab strip ones start. */
  align?: "start" | "end";
  /**
   * A modal bubble takes the click that closes it. An inactive one, like the download bubble
   * that opens by itself, lets that click reach what is under it.
   */
  isModal?: boolean;
  onClose: () => void;
  testID?: string;
  children: ReactNode;
}) {
  const anchorBounds = useElementBounds(anchor);
  const layer = useOverlayLayer("floating");
  const bubbleRef = useRef<View | null>(null);

  useEffect(() => {
    if (isModal) {
      return;
    }
    const handlePointerDown = (event: PointerEvent) => {
      const bubble: unknown = bubbleRef.current;
      if (bubble instanceof HTMLElement && event.target instanceof Node) {
        if (!bubble.contains(event.target)) {
          onClose();
        }
      }
    };
    window.addEventListener("pointerdown", handlePointerDown, true);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown, true);
    };
  }, [isModal, onClose]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      onClose();
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [onClose]);

  if (!anchorBounds) {
    return null;
  }
  const anchorRight = anchorBounds.left + anchorBounds.width;
  const alignedLeft = align === "start" ? anchorBounds.left : anchorRight - width;
  const bubblePosition = {
    top: anchorBounds.top + anchorBounds.height + BUBBLE_ANCHOR_GAP,
    left: Math.max(BUBBLE_ANCHOR_GAP, alignedLeft),
    width,
  };
  return createPortal(
    <View style={[styles.layer, { zIndex: layer }]} pointerEvents="box-none">
      {isModal ? <Pressable style={styles.backdrop} onPress={onClose} /> : null}
      <View ref={bubbleRef} style={[styles.bubble, bubblePosition]} testID={testID}>
        {children}
      </View>
    </View>,
    getOverlayRoot(),
  );
}

/** The ✕ in a bubble's title row, with its name as a tooltip. */
export function ChromeBubbleCloseButton({
  label,
  onPress,
  testID,
}: {
  label: string;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <Tooltip enabledOnDesktop enabledOnMobile={false}>
      <TooltipTrigger asChild>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={label}
          onPress={onPress}
          style={closeButtonStyle}
          testID={testID}
        >
          <ThemedChromeIcon name="close" size={CLOSE_ICON_SIZE} uniProps={closeIconMapping} />
        </Pressable>
      </TooltipTrigger>
      <TooltipContent side="bottom" align="center" offset={6}>
        <Text style={styles.tooltipText}>{label}</Text>
      </TooltipContent>
    </Tooltip>
  );
}

function closeButtonStyle({ hovered }: HoverState) {
  return [styles.closeButton, hovered && styles.closeButtonHovered];
}

const ThemedChromeIcon = withUnistyles(ChromeIcon);
const closeIconMapping = chromeColorProps("bubbleTextSecondary");

const styles = StyleSheet.create((theme) => {
  const { chrome } = theme;
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
    closeButton: {
      width: CLOSE_ICON_SIZE,
      height: CLOSE_ICON_SIZE,
      borderRadius: CLOSE_ICON_SIZE / 2,
      alignItems: "center",
      justifyContent: "center",
    },
    closeButtonHovered: {
      backgroundColor: chrome.bubbleCloseHover,
    },
    tooltipText: {
      fontSize: theme.fontSize.sm,
      color: theme.colors.popoverForeground,
    },
    bubble: {
      position: "absolute",
      borderRadius: CHROME_LAYOUT.bubbleCornerRadius,
      backgroundColor: chrome.bubble,
      overflow: "hidden",
      boxShadow: `0 0 12px rgba(${chrome.dropdownShadowRgb},0.08), 0 12px 16px rgba(${chrome.dropdownShadowRgb},0.18)`,
    },
  };
});
