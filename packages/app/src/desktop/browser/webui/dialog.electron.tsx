import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Animated,
  Easing,
  Pressable,
  ScrollView,
  Text,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { createPortal } from "react-dom";
import { StyleSheet } from "react-native-unistyles";
import { CHROME_FONT_FAMILY } from "@/desktop/browser/chrome-theme";
import { useEscapeKey } from "@/desktop/browser/escape-key";
import { useBrowserDialogHost } from "@/desktop/browser/pane/dialog-host";
import { useElementBounds } from "@/desktop/browser/use-element-bounds";
import { getOverlayRoot, OverlayLayerProvider, useOverlayLayer } from "@/lib/overlay-root";

// cr-dialog: 512 wide unless a page sets --cr-dialog-width, at most 600 tall, radius 8.
const DEFAULT_DIALOG_WIDTH = 512;
const DIALOG_MAX_HEIGHT = 600;
const DIALOG_RADIUS = 8;
const DIALOG_SHADOW = "0 0 16px rgba(0,0,0,0.12), 0 16px 16px rgba(0,0,0,0.24)";
// ::backdrop is the same 60% black in both themes.
const DIALOG_BACKDROP = "rgba(0,0,0,0.6)";

/**
 * cr-dialog's slot variables (--cr-dialog-title-*, --cr-dialog-body-*, --cr-dialog-button-
 * container-*). A dialog sets the ones it changes.
 */
export interface CrDialogLayout {
  titlePadding: { top: number; horizontal: number; bottom: number };
  titleFontSize: number;
  titleFontWeight: "400" | "500";
  titleLineHeight: number;
  bodyPaddingHorizontal: number;
  bodyMaxHeight?: number;
  buttonPadding: { top: number; horizontal: number; bottom: number };
}

// cr_dialog.css defaults: a 15 px title on a single line height, 20 dip around the title and
// the body, 16 around the buttons.
const DEFAULT_LAYOUT: CrDialogLayout = {
  titlePadding: { top: 20, horizontal: 20, bottom: 16 },
  titleFontSize: 15,
  titleFontWeight: "400",
  titleLineHeight: 15,
  bodyPaddingHorizontal: 20,
  buttonPadding: { top: 16, horizontal: 16, bottom: 16 },
};
// onPointerdown_'s pulse when the backdrop is clicked: up to 102% and back over 180 ms, holding
// between 40% and 60% of it.
const PULSE_SCALE = 1.02;
const PULSE_DURATION_MS = 180;
const PULSE_RAMP_MS = PULSE_DURATION_MS * 0.4;
const PULSE_HOLD_MS = PULSE_DURATION_MS * 0.2;

/**
 * cr-dialog: a modal box over the page area with its title, an optional header, a scrolling body
 * and its buttons at the end. Esc cancels; a click on the backdrop only makes the box pulse, as
 * Chrome's does. It sits over the tab's page wherever the page renders it.
 */
export function CrDialog({
  title,
  header,
  layout: layoutOverrides,
  buttons,
  onCancel,
  testID,
  children,
}: {
  /** The title text, or the dialog's own title slot content. */
  title: ReactNode;
  header?: ReactNode;
  layout?: Partial<CrDialogLayout>;
  /** The button row, its buttons at the end. */
  buttons: ReactNode;
  onCancel: () => void;
  testID?: string;
  children: ReactNode;
}) {
  const host = useBrowserDialogHost();
  const hostBounds = useElementBounds(host);
  const layer = useOverlayLayer("modal");
  const scale = useRef(new Animated.Value(1)).current;
  const slotStyles = useMemo(() => {
    const layout = { ...DEFAULT_LAYOUT, ...layoutOverrides };
    return {
      title: {
        paddingTop: layout.titlePadding.top,
        paddingHorizontal: layout.titlePadding.horizontal,
        paddingBottom: layout.titlePadding.bottom,
      },
      titleText: {
        fontSize: layout.titleFontSize,
        fontWeight: layout.titleFontWeight,
        lineHeight: layout.titleLineHeight,
      },
      body: layout.bodyMaxHeight ? { maxHeight: layout.bodyMaxHeight } : null,
      bodyContent: { paddingHorizontal: layout.bodyPaddingHorizontal },
      buttons: {
        paddingTop: layout.buttonPadding.top,
        paddingHorizontal: layout.buttonPadding.horizontal,
        paddingBottom: layout.buttonPadding.bottom,
      },
    };
  }, [layoutOverrides]);
  const [scrollEdges, setScrollEdges] = useState({ isAtTop: true, isAtBottom: true });
  const viewportHeightRef = useRef(0);
  const contentHeightRef = useRef(0);
  const offsetRef = useRef(0);

  // As the key bubbles, so a menu open over the dialog takes Esc first.
  useEscapeKey(onCancel, "bubble");

  const pulse = useCallback(() => {
    const ramp = (toValue: number) =>
      Animated.timing(scale, {
        toValue,
        duration: PULSE_RAMP_MS,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: false,
      });
    Animated.sequence([ramp(PULSE_SCALE), Animated.delay(PULSE_HOLD_MS), ramp(1)]).start();
  }, [scale]);

  // .cr-scrollable: a line at the body's top once it scrolls, and at its bottom while more is
  // below.
  const updateScrollEdges = useCallback(() => {
    const scrollableHeight = contentHeightRef.current - viewportHeightRef.current;
    setScrollEdges({
      isAtTop: offsetRef.current <= 0,
      isAtBottom: offsetRef.current >= scrollableHeight - 1,
    });
  }, []);
  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      offsetRef.current = event.nativeEvent.contentOffset.y;
      updateScrollEdges();
    },
    [updateScrollEdges],
  );
  const handleViewportLayout = useCallback(
    (event: LayoutChangeEvent) => {
      viewportHeightRef.current = event.nativeEvent.layout.height;
      updateScrollEdges();
    },
    [updateScrollEdges],
  );
  const handleContentSizeChange = useCallback(
    (_width: number, height: number) => {
      contentHeightRef.current = height;
      updateScrollEdges();
    },
    [updateScrollEdges],
  );

  if (!hostBounds) {
    return null;
  }
  // The overlay root passes clicks through; the dialog's layer takes them, so the page under the
  // backdrop is blocked, and menus opened in the dialog stack above it.
  return createPortal(
    <OverlayLayerProvider layer={layer}>
      <View
        style={[styles.layer, hostBounds, { zIndex: layer }]}
        pointerEvents="auto"
        testID={testID}
      >
        <Pressable accessible={false} onPress={pulse} style={styles.backdrop} />
        <Animated.View
          accessibilityRole="none"
          aria-modal
          role="dialog"
          style={[styles.dialog, { transform: [{ scale }] }]}
        >
          <View style={slotStyles.title}>
            {typeof title === "string" ? (
              <Text style={[styles.titleText, slotStyles.titleText]}>{title}</Text>
            ) : (
              title
            )}
          </View>
          {header}
          <View style={[styles.body, slotStyles.body]}>
            <ScrollView
              contentContainerStyle={slotStyles.bodyContent}
              onScroll={handleScroll}
              scrollEventThrottle={16}
              onLayout={handleViewportLayout}
              onContentSizeChange={handleContentSizeChange}
            >
              {children}
            </ScrollView>
            {scrollEdges.isAtTop ? null : <View pointerEvents="none" style={styles.topLine} />}
            {scrollEdges.isAtBottom ? null : (
              <View pointerEvents="none" style={styles.bottomLine} />
            )}
          </View>
          <View style={[styles.buttons, slotStyles.buttons]}>{buttons}</View>
        </Animated.View>
      </View>
    </OverlayLayerProvider>,
    getOverlayRoot(),
  );
}

const styles = StyleSheet.create((theme) => {
  const colors = theme.webui;
  return {
    layer: {
      position: "absolute",
      alignItems: "center",
      justifyContent: "center",
    },
    backdrop: {
      position: "absolute",
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      backgroundColor: DIALOG_BACKDROP,
    },
    dialog: {
      width: DEFAULT_DIALOG_WIDTH,
      maxWidth: "100%",
      maxHeight: DIALOG_MAX_HEIGHT,
      borderRadius: DIALOG_RADIUS,
      overflow: "hidden",
      backgroundColor: colors.dialog,
      boxShadow: DIALOG_SHADOW,
    },
    titleText: {
      fontFamily: CHROME_FONT_FAMILY,
      color: colors.text,
    },
    body: {
      flexGrow: 0,
      flexShrink: 1,
      minHeight: 0,
    },
    topLine: {
      position: "absolute",
      top: 0,
      right: 0,
      left: 0,
      height: 1,
      backgroundColor: colors.scrollableBorder,
    },
    bottomLine: {
      position: "absolute",
      right: 0,
      bottom: 0,
      left: 0,
      height: 1,
      backgroundColor: colors.scrollableBorder,
    },
    buttons: {
      flexDirection: "row",
      justifyContent: "flex-end",
      alignItems: "center",
    },
  };
});
