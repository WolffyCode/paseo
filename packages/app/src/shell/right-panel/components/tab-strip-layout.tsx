import { forwardRef, type ReactNode, useEffect, useMemo, useRef } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { isWeb } from "@/constants/platform";
import { resolveTabStripWheelDelta } from "./tab-strip-scroll";

const TAB_BAR_DATASET = { rptabbar: "1" } as const;
const TAB_STRIP_DATASET = { rptabstrip: "1" } as const;
const TAB_ACTIONS_DATASET = { rptabactions: "1" } as const;

// Own the tab bar's geometry: only tabs scroll, while actions and anchored overlays stay outside the viewport.
export const TabStripLayout = forwardRef<
  View,
  {
    focusedTabId: string | null;
    borderColor: string;
    backgroundColor: string;
    actions: ReactNode;
    overlay?: ReactNode;
    children: ReactNode;
  }
>(function TabStripLayout(
  { focusedTabId, borderColor, backgroundColor, actions, overlay, children },
  ref,
) {
  const tabStripRef = useRef<ScrollView>(null);

  // A desktop wheel over the horizontal viewport scrolls tabs on mouse-wheel and trackpad input.
  useEffect(() => {
    if (!isWeb) {
      return;
    }
    const strip = tabStripRef.current as unknown as HTMLElement | null;
    if (!strip) {
      return;
    }
    const onWheel = (event: WheelEvent): void => {
      if (strip.scrollWidth <= strip.clientWidth) {
        return;
      }
      const delta = resolveTabStripWheelDelta({
        deltaX: event.deltaX,
        deltaY: event.deltaY,
        deltaMode: event.deltaMode,
        viewportWidth: strip.clientWidth,
      });
      if (delta === 0) {
        return;
      }
      const previous = strip.scrollLeft;
      strip.scrollLeft += delta;
      if (strip.scrollLeft !== previous) {
        event.preventDefault();
      }
    };
    strip.addEventListener("wheel", onWheel, { passive: false });
    return () => strip.removeEventListener("wheel", onWheel);
  }, []);

  // A newly opened or focused tab is always brought into the visible portion of the scrolling strip.
  useEffect(() => {
    if (!isWeb || !focusedTabId) {
      return;
    }
    const strip = tabStripRef.current as unknown as HTMLElement | null;
    const focusedTab = Array.from(strip?.querySelectorAll<HTMLElement>("[data-tabid]") ?? []).find(
      (node) => node.dataset.tabid === focusedTabId,
    );
    focusedTab?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [focusedTabId]);

  const barStyle = useMemo(
    () => [styles.bar, { borderColor, backgroundColor }],
    [borderColor, backgroundColor],
  );
  return (
    <View ref={ref} style={barStyle} dataSet={TAB_BAR_DATASET}>
      <ScrollView
        ref={tabStripRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tabStrip}
        contentContainerStyle={styles.tabList}
        dataSet={TAB_STRIP_DATASET}
      >
        {children}
      </ScrollView>
      <View style={styles.actions} dataSet={TAB_ACTIONS_DATASET}>
        {actions}
      </View>
      {overlay}
    </View>
  );
});

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    height: 42,
    paddingHorizontal: 6,
    borderBottomWidth: 1,
    position: "relative",
    // Anchored menus overflow below the bar into the content region, above the editor and breadcrumb.
    zIndex: 30,
  },
  tabStrip: { flex: 1, minWidth: 0, alignSelf: "stretch" },
  tabList: { flexDirection: "row", alignItems: "center", gap: 2, paddingRight: 2 },
  actions: { flexDirection: "row", alignItems: "center", flexShrink: 0 },
});
