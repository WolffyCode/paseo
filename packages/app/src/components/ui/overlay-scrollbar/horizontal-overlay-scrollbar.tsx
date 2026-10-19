import { useCallback, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Pressable, View, type PressableStateCallbackType, type ViewStyle } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { WEB_SCROLLBAR_RESTING_OPACITY, WEB_SCROLLBAR_SIZE_PX } from "@/styles/web-scrollbar";
import { inlineUnistylesStyle } from "@/styles/unistyles-inline-style";
import { computeOverlayScrollbarGeometry, scrollOffsetFromThumbDrag } from "./geometry";
import type { OverlayScrollbarMetrics } from "./overlay-scrollbar";

const THUMB_HEIGHT = WEB_SCROLLBAR_SIZE_PX - 4;
const TAB_STRIP_MIN_THUMB_SIZE = 48;

interface ScrollableNode extends EventTarget {
  scrollLeft: number;
  clientWidth: number;
  scrollWidth: number;
  firstElementChild: Element | null;
}

interface ScrollableRef {
  getScrollableNode?: () => ScrollableNode | null;
}

interface PointerLikeEvent {
  clientX?: number;
  nativeEvent?: { clientX?: number; preventDefault?: () => void };
  preventDefault?: () => void;
  stopPropagation?: () => void;
}

function readClientX(event: PointerLikeEvent): number | null {
  const value = event.nativeEvent?.clientX ?? event.clientX;
  return typeof value === "number" ? value : null;
}

function readMetrics(node: ScrollableNode): OverlayScrollbarMetrics {
  return {
    offset: Math.max(0, node.scrollLeft),
    viewportSize: Math.max(0, node.clientWidth),
    contentSize: Math.max(0, node.scrollWidth),
  };
}

/**
 * Floating horizontal thumb for a tab strip. The native indicator claims layout
 * height, and the tab row cannot spare it — chips get crushed. This paints over
 * the row instead, so overflow stays visible without shrinking the chips.
 */
export function HorizontalOverlayScrollbar({
  scrollRef,
}: {
  scrollRef: RefObject<ScrollableRef | null>;
}) {
  const [metrics, setMetrics] = useState<OverlayScrollbarMetrics>({
    offset: 0,
    viewportSize: 0,
    contentSize: 0,
  });
  const geometry = useMemo(
    () => computeOverlayScrollbarGeometry({ ...metrics, minThumbSize: TAB_STRIP_MIN_THUMB_SIZE }),
    [metrics],
  );
  const geometryRef = useRef(geometry);
  const dragStartClientXRef = useRef(0);
  const dragStartOffsetRef = useRef(0);
  const [isDragging, setIsDragging] = useState(false);

  useLayoutEffect(() => {
    geometryRef.current = geometry;
  }, [geometry]);

  const syncMetrics = useCallback(() => {
    const node = scrollRef.current?.getScrollableNode?.();
    if (!node) return;
    setMetrics(readMetrics(node));
  }, [scrollRef]);

  useLayoutEffect(() => {
    const node = scrollRef.current?.getScrollableNode?.();
    if (!node) return;
    syncMetrics();
    node.addEventListener("scroll", syncMetrics, { passive: true });
    const observer = new ResizeObserver(syncMetrics);
    observer.observe(node as unknown as Element);
    const content = node.firstElementChild;
    if (content) observer.observe(content);
    return () => {
      node.removeEventListener("scroll", syncMetrics);
      observer.disconnect();
    };
  }, [scrollRef, syncMetrics]);

  const scrollToOffset = useCallback(
    (offset: number) => {
      const node = scrollRef.current?.getScrollableNode?.();
      if (node) node.scrollLeft = offset;
    },
    [scrollRef],
  );

  const startDrag = useCallback(
    (event: PointerLikeEvent) => {
      const clientX = readClientX(event);
      if (clientX === null) return;
      event.preventDefault?.();
      event.stopPropagation?.();
      event.nativeEvent?.preventDefault?.();
      const node = scrollRef.current?.getScrollableNode?.();
      dragStartClientXRef.current = clientX;
      dragStartOffsetRef.current = node?.scrollLeft ?? metrics.offset;
      setIsDragging(true);
    },
    [metrics.offset, scrollRef],
  );

  useLayoutEffect(() => {
    if (!isDragging) return;
    const handlePointerMove = (event: PointerEvent) => {
      const current = geometryRef.current;
      const nextOffset = scrollOffsetFromThumbDrag({
        startOffset: dragStartOffsetRef.current,
        dragDelta: event.clientX - dragStartClientXRef.current,
        maxScrollOffset: current.maxScrollOffset,
        maxThumbOffset: current.maxThumbOffset,
      });
      scrollToOffset(nextOffset);
    };
    const stopDragging = () => setIsDragging(false);
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopDragging);
    window.addEventListener("pointercancel", stopDragging);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopDragging);
      window.removeEventListener("pointercancel", stopDragging);
    };
  }, [isDragging, scrollToOffset]);

  const thumbRegionStyle = useMemo(
    () => [
      styles.thumbRegion,
      inlineUnistylesStyle({
        width: geometry.thumbSize,
        transform: [{ translateX: geometry.thumbOffset }],
        cursor: isDragging ? "grabbing" : "grab",
      } as unknown as ViewStyle),
    ],
    [geometry.thumbOffset, geometry.thumbSize, isDragging],
  );

  if (!geometry.isVisible) return null;

  return (
    <View style={styles.overlay} pointerEvents="box-none" testID="workspace-tabs-overlay-scrollbar">
      <Pressable
        style={thumbRegionStyle}
        {...({ onPointerDown: startDrag } as object)}
        testID="workspace-tabs-overlay-scrollbar-grab"
      >
        {({ hovered = false }: PressableStateCallbackType & { hovered?: boolean }) => (
          <View
            style={[styles.thumb, hovered || isDragging ? styles.thumbHovered : null]}
            pointerEvents="none"
            testID="workspace-tabs-overlay-scrollbar-thumb"
          />
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  overlay: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: WEB_SCROLLBAR_SIZE_PX,
    zIndex: 10,
  },
  thumbRegion: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "flex-end",
    touchAction: "none",
    userSelect: "none",
  },
  thumb: {
    width: "100%",
    height: THUMB_HEIGHT,
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.foregroundExtraMuted,
    opacity: WEB_SCROLLBAR_RESTING_OPACITY,
  },
  thumbHovered: {
    backgroundColor: theme.colors.foregroundMuted,
    opacity: 1,
  },
}));
