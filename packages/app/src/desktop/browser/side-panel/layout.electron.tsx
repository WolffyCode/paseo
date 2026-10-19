import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import {
  Pressable,
  Text,
  View,
  type LayoutChangeEvent,
  type PressableStateCallbackType,
} from "react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { PRIMARY_MOUSE_BUTTON } from "../chrome-controls";
import { ChromeIcon } from "../chrome-icons";
import { CHROME_FONT_FAMILY, chromeColorProps } from "../chrome-theme";
import {
  SIDE_PANEL_BORDER,
  sidePanelWidth,
  useSidePanelPositionStore,
  useSidePanelWidthStore,
} from "./store";

// side_panel_animations.cc: the panel slides in from the window's edge in 350 ms
// (ACCEL_45_DECEL_88). The page's shadow fades in over 150–250 ms of the opening and out over
// the first 100 ms of the closing.
const SLIDE_DURATION_MS = 350;
const SLIDE_EASING = "cubic-bezier(0.45, 0, 0.12, 1)";
const SHADOW_FADE = "100ms";
const SHADOW_FADE_IN_DELAY = "150ms";
// side_panel_header.cc and side_panel.cc.
const HEADER_HEIGHT = 40;
const HEADER_TITLE_INSET = 8;
const HEADER_BUTTON_SIZE = 28;
const HEADER_BUTTON_ICON_SIZE = 16;
const CONTENT_RADIUS = 8;
// While a panel is open the page is a box 8 dip from the window's edge and bottom, 1 below the
// toolbar (browser_view_tabbed_layout_impl.cc).
const PAGE_BOX_INSET = 8;
const PAGE_BOX_RADIUS = 8;
// side_panel_resize_area.cc: a 4 × 24 handle 2 dip into the border, ← and → move it by 50.
const RESIZE_HANDLE_WIDTH = 4;
const RESIZE_HANDLE_HEIGHT = 24;
const RESIZE_HANDLE_INSET = 2;
const KEYBOARD_RESIZE_STEP = 50;
const RESIZE_CURSOR = "ew-resize";
const HIDDEN_PAGE_SHADOW = "0 0 4px 0 rgba(0,0,0,0), 0 2px 6px 0 rgba(0,0,0,0)";

/**
 * Chrome's content-height side panel beside the page: the panel slides in at the window's right
 * edge, or its left one when settings put it there, below the toolbar, and the page becomes a
 * rounded box beside it. With no panel the page fills the area under the toolbar's separator line.
 */
export function BrowserSidePanelLayout({
  panel,
  onPageElement,
  children,
}: {
  /** The panel to show, or null when the tab has none. */
  panel: { title: string; isOpen: boolean; onClose: () => void; content: ReactNode } | null;
  /** The page box, where Chrome centers a page's dialogs. */
  onPageElement: (element: HTMLElement | null) => void;
  children: ReactNode;
}) {
  const isOpen = panel?.isOpen ?? false;
  const isRightAligned = useSidePanelPositionStore((state) => state.isRightAligned);
  const [isShown, setIsShown] = useState(isOpen);
  // The panel stays shown while it slides out.
  if (isOpen && !isShown) {
    setIsShown(true);
  }
  const handleSlidOut = useCallback(() => setIsShown(false), []);
  const [areaWidth, setAreaWidth] = useState(0);
  const handleAreaLayout = useCallback((event: LayoutChangeEvent) => {
    setAreaWidth(event.nativeEvent.layout.width);
  }, []);
  const setPageNode = useCallback(
    (node: unknown) => {
      onPageElement(node instanceof HTMLElement ? node : null);
    },
    [onPageElement],
  );
  const hasPanel = isShown && panel !== null;
  const pageBoxEdge = isRightAligned ? styles.pageBoxAtLeftEdge : styles.pageBoxAtRightEdge;
  let pageStyle;
  if (!hasPanel) {
    pageStyle = styles.page;
  } else if (isOpen) {
    pageStyle = [styles.page, styles.pageBox, pageBoxEdge, styles.pageBoxShadow];
  } else {
    pageStyle = [styles.page, styles.pageBox, pageBoxEdge, styles.pageBoxShadowHidden];
  }
  return (
    <View
      style={[styles.area, !isRightAligned && styles.areaPanelLeft]}
      onLayout={handleAreaLayout}
    >
      <View ref={setPageNode} style={pageStyle}>
        {children}
      </View>
      {hasPanel ? (
        <SlidingSidePanel
          title={panel.title}
          isOpen={isOpen}
          isRightAligned={isRightAligned}
          areaWidth={areaWidth}
          onClose={panel.onClose}
          onSlidOut={handleSlidOut}
        >
          {panel.content}
        </SlidingSidePanel>
      ) : null}
    </View>
  );
}

function SlidingSidePanel({
  title,
  isOpen,
  isRightAligned,
  areaWidth,
  onClose,
  onSlidOut,
  children,
}: {
  title: string;
  isOpen: boolean;
  isRightAligned: boolean;
  areaWidth: number;
  onClose: () => void;
  onSlidOut: () => void;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const rememberedWidth = useSidePanelWidthStore((state) => state.customizeChromeWidth);
  const width = sidePanelWidth({ rememberedWidth, windowWidth: areaWidth });
  const wrapperRef = useRef<View | null>(null);

  // The wrapper's width runs from 0 to the panel's, so the panel enters from the window's edge.
  useLayoutEffect(() => {
    const node: unknown = wrapperRef.current;
    if (!(node instanceof HTMLElement)) {
      return;
    }
    const currentWidth = `${node.getBoundingClientRect().width}px`;
    const keyframes = isOpen
      ? [{ width: "0px" }, { width: currentWidth }]
      : [{ width: currentWidth }, { width: "0px" }];
    const animation = node.animate(keyframes, {
      duration: SLIDE_DURATION_MS,
      easing: SLIDE_EASING,
      fill: isOpen ? "none" : "forwards",
    });
    if (!isOpen) {
      animation.onfinish = onSlidOut;
    }
    return () => animation.cancel();
  }, [isOpen, onSlidOut]);

  return (
    <View
      ref={wrapperRef}
      style={[styles.panelWrapper, !isRightAligned && styles.panelWrapperLeft, { width }]}
    >
      <View style={[styles.panel, { width }]}>
        <View style={styles.header}>
          <Text numberOfLines={1} style={styles.headerTitle}>
            {title}
          </Text>
          <SidePanelHeaderButton
            label={t("workspace.browser.customizeChrome.closeSidePanel")}
            onPress={onClose}
          />
        </View>
        <View style={styles.content}>{children}</View>
        <SidePanelResizeArea width={width} areaWidth={areaWidth} isRightAligned={isRightAligned} />
      </View>
    </View>
  );
}

function SidePanelHeaderButton({ label, onPress }: { label: string; onPress: () => void }) {
  const buttonStyle = useCallback(
    ({ hovered, pressed }: PressableStateCallbackType & { hovered?: boolean }) => [
      styles.headerButton,
      hovered && styles.headerButtonHovered,
      pressed && styles.headerButtonPressed,
    ],
    [],
  );
  return (
    <Tooltip enabledOnDesktop enabledOnMobile={false}>
      <TooltipTrigger asChild>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={label}
          onPress={onPress}
          style={buttonStyle}
          testID="browser-side-panel-close"
        >
          <ThemedChromeIcon
            name="sidePanelClose"
            size={HEADER_BUTTON_ICON_SIZE}
            uniProps={headerIconMapping}
          />
        </Pressable>
      </TooltipTrigger>
      <TooltipContent side="bottom" align="center" offset={6}>
        <Text style={styles.tooltipText}>{label}</Text>
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * The panel's border next to the page: dragging it, or ← and → while it has focus, resizes the
 * panel. Chrome remembers the width while it changes.
 */
function SidePanelResizeArea({
  width,
  areaWidth,
  isRightAligned,
}: {
  width: number;
  areaWidth: number;
  isRightAligned: boolean;
}) {
  const { t } = useTranslation();
  const setRememberedWidth = useSidePanelWidthStore((state) => state.setCustomizeChromeWidth);
  const areaRef = useRef<View | null>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [drag, setDrag] = useState<{ pointerStartX: number; widthStart: number } | null>(null);

  const resizeTo = useCallback(
    (nextWidth: number) => {
      setRememberedWidth(sidePanelWidth({ rememberedWidth: nextWidth, windowWidth: areaWidth }));
    },
    [areaWidth, setRememberedWidth],
  );

  useEffect(() => {
    const node: unknown = areaRef.current;
    if (!(node instanceof HTMLElement)) {
      return;
    }
    const element = node;
    // The handle shows focus itself, as Chrome's does.
    element.style.cursor = RESIZE_CURSOR;
    element.style.outline = "none";
    function handlePointerDown(event: PointerEvent) {
      if (event.button !== PRIMARY_MOUSE_BUTTON) {
        return;
      }
      event.preventDefault();
      // Captured, the drag keeps its moves when the pointer passes over the page's guest.
      element.setPointerCapture(event.pointerId);
      setDrag({ pointerStartX: event.clientX, widthStart: width });
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
        return;
      }
      event.preventDefault();
      // Moving the edge toward the page widens the panel: left for a panel on the right.
      const widensKey = isRightAligned ? "ArrowLeft" : "ArrowRight";
      const step = event.key === widensKey ? KEYBOARD_RESIZE_STEP : -KEYBOARD_RESIZE_STEP;
      resizeTo(width + step);
    }
    const handlePointerEnter = () => setIsHovered(true);
    const handlePointerLeave = () => setIsHovered(false);
    const handleFocus = () => setIsFocused(true);
    const handleBlur = () => setIsFocused(false);
    element.addEventListener("pointerdown", handlePointerDown);
    element.addEventListener("keydown", handleKeyDown);
    element.addEventListener("pointerenter", handlePointerEnter);
    element.addEventListener("pointerleave", handlePointerLeave);
    element.addEventListener("focus", handleFocus);
    element.addEventListener("blur", handleBlur);
    return () => {
      element.removeEventListener("pointerdown", handlePointerDown);
      element.removeEventListener("keydown", handleKeyDown);
      element.removeEventListener("pointerenter", handlePointerEnter);
      element.removeEventListener("pointerleave", handlePointerLeave);
      element.removeEventListener("focus", handleFocus);
      element.removeEventListener("blur", handleBlur);
    };
  }, [isRightAligned, resizeTo, width]);

  useEffect(() => {
    if (!drag) {
      return;
    }
    const activeDrag = drag;
    const cursorBeforeDrag = document.body.style.cursor;
    document.body.style.cursor = RESIZE_CURSOR;
    function handlePointerMove(event: PointerEvent) {
      const movedTowardPage = isRightAligned
        ? activeDrag.pointerStartX - event.clientX
        : event.clientX - activeDrag.pointerStartX;
      resizeTo(activeDrag.widthStart + movedTowardPage);
    }
    function handlePointerUp() {
      setDrag(null);
    }
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
    return () => {
      document.body.style.cursor = cursorBeforeDrag;
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };
  }, [drag, isRightAligned, resizeTo]);

  const isHandleShown = isHovered || isFocused || drag !== null;
  return (
    <View
      ref={areaRef}
      role="slider"
      aria-label={t("workspace.browser.customizeChrome.resizeSidePanel")}
      aria-valuenow={width}
      focusable
      style={[styles.resizeArea, isRightAligned ? styles.resizeAreaLeft : styles.resizeAreaRight]}
    >
      {isHandleShown ? (
        <View
          style={[
            styles.resizeHandle,
            isRightAligned ? styles.resizeHandleLeft : styles.resizeHandleRight,
          ]}
        />
      ) : null}
    </View>
  );
}

const ThemedChromeIcon = withUnistyles(ChromeIcon);
const headerIconMapping = chromeColorProps("sidePanelHeaderIcon");

const styles = StyleSheet.create((theme) => {
  const { chrome } = theme;
  return {
    // Chrome paints the toolbar's color behind the page box and the panel.
    area: {
      flex: 1,
      minHeight: 0,
      flexDirection: "row",
      backgroundColor: chrome.toolbar,
    },
    areaPanelLeft: {
      flexDirection: "row-reverse",
    },
    page: {
      flex: 1,
      minWidth: 0,
      minHeight: 0,
      borderTopWidth: 1,
      borderTopColor: chrome.contentSeparator,
    },
    pageBox: {
      marginBottom: PAGE_BOX_INSET,
      marginTop: 1,
      borderTopWidth: 0,
      borderRadius: PAGE_BOX_RADIUS,
      overflow: "hidden",
    },
    pageBoxAtLeftEdge: {
      marginLeft: PAGE_BOX_INSET,
    },
    pageBoxAtRightEdge: {
      marginRight: PAGE_BOX_INSET,
    },
    pageBoxShadow: {
      boxShadow: chrome.sidePanelPageShadow,
      transitionProperty: "box-shadow",
      transitionDuration: SHADOW_FADE,
      transitionDelay: SHADOW_FADE_IN_DELAY,
    },
    pageBoxShadowHidden: {
      boxShadow: HIDDEN_PAGE_SHADOW,
      transitionProperty: "box-shadow",
      transitionDuration: SHADOW_FADE,
    },
    panelWrapper: {
      flexShrink: 0,
      overflow: "hidden",
    },
    // A panel on the left keeps its right edge on the page as the wrapper opens.
    panelWrapperLeft: {
      alignItems: "flex-end",
    },
    panel: {
      flex: 1,
      paddingHorizontal: SIDE_PANEL_BORDER,
      paddingBottom: SIDE_PANEL_BORDER,
    },
    header: {
      height: HEADER_HEIGHT,
      flexDirection: "row",
      alignItems: "center",
      paddingLeft: HEADER_TITLE_INSET,
    },
    headerTitle: {
      flex: 1,
      fontFamily: CHROME_FONT_FAMILY,
      fontSize: 14,
      lineHeight: 20,
      fontWeight: "500",
      color: chrome.sidePanelTitle,
    },
    headerButton: {
      width: HEADER_BUTTON_SIZE,
      height: HEADER_BUTTON_SIZE,
      borderRadius: HEADER_BUTTON_SIZE / 2,
      alignItems: "center",
      justifyContent: "center",
    },
    headerButtonHovered: {
      backgroundColor: chrome.sidePanelHeaderHover,
    },
    headerButtonPressed: {
      backgroundColor: chrome.sidePanelHeaderPressed,
    },
    tooltipText: {
      fontSize: theme.fontSize.sm,
      color: theme.colors.popoverForeground,
    },
    content: {
      flex: 1,
      minHeight: 0,
      borderRadius: CONTENT_RADIUS,
      overflow: "hidden",
      backgroundColor: chrome.sidePanelBackground,
    },
    resizeArea: {
      position: "absolute",
      top: 0,
      bottom: 0,
      width: SIDE_PANEL_BORDER,
      justifyContent: "center",
    },
    resizeAreaLeft: {
      left: 0,
    },
    resizeAreaRight: {
      right: 0,
    },
    resizeHandle: {
      width: RESIZE_HANDLE_WIDTH,
      height: RESIZE_HANDLE_HEIGHT,
      borderRadius: RESIZE_HANDLE_WIDTH / 2,
      backgroundColor: chrome.sidePanelResizeHandle,
    },
    resizeHandleLeft: {
      marginLeft: RESIZE_HANDLE_INSET,
    },
    resizeHandleRight: {
      marginLeft: SIDE_PANEL_BORDER - RESIZE_HANDLE_INSET - RESIZE_HANDLE_WIDTH,
    },
  };
});
