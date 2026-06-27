import { useCallback, useMemo, useRef, useState } from "react";
import { View, type PointerEvent as RNPointerEvent } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { isWeb } from "@/constants/platform";
import { useShellLayoutStore } from "@/stores/shell-layout-store";
import { resolveRegionWidthFromDrag, type ShellRegion } from "@/stores/shell-regions";

// cursor + touchAction are web CSS properties, not RN ViewStyle — applied as a cast
// on web only (the shell is desktop, drag is web).
const WEB_RESIZE_CURSOR = isWeb ? ({ cursor: "col-resize", touchAction: "none" } as object) : null;

// The 8px resize handle between two cards. Drags one side region's width in px and
// persists it via shell-layout-store (the px clamp lives in resolveRegionWidthFromDrag,
// a sibling of the existing normalized split handle — different contract on purpose).
// Pointer dragging is web-only since the shell is desktop; the faint center line is
// the affordance and brightens only while dragging (hover styling is deferred).
interface RegionGutterProps {
  region: ShellRegion;
  workspaceKey: string;
  currentWidth: number;
}

export function RegionGutter({ region, workspaceKey, currentWidth }: RegionGutterProps) {
  const setRegionWidth = useShellLayoutStore((state) => state.setRegionWidth);
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef({ x: 0, width: currentWidth });
  // The left card grows as the gutter moves right; right + fileTree grow as it moves
  // left, so their delta is mirrored.
  const sign = region === "left" ? 1 : -1;

  const handlePointerDown = useCallback(
    (event: RNPointerEvent) => {
      if (!isWeb) {
        return;
      }
      const handle = event.currentTarget as unknown as HTMLElement | null;
      dragStart.current = { x: event.nativeEvent.clientX, width: currentWidth };
      setDragging(true);
      handle?.setPointerCapture?.(event.nativeEvent.pointerId);
      document.body.style.cursor = "col-resize";

      const onMove = (moveEvent: PointerEvent) => {
        const deltaPx = (moveEvent.clientX - dragStart.current.x) * sign;
        setRegionWidth(
          workspaceKey,
          region,
          resolveRegionWidthFromDrag({ region, startWidth: dragStart.current.width, deltaPx }),
        );
      };
      const onUp = () => {
        setDragging(false);
        document.body.style.cursor = "";
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    },
    [currentWidth, region, sign, setRegionWidth, workspaceKey],
  );

  styles.useVariants({ dragging });
  const areaStyle = useMemo(() => [styles.area, WEB_RESIZE_CURSOR], []);
  return (
    <View style={areaStyle} onPointerDown={handlePointerDown}>
      <View style={styles.line} />
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  area: {
    width: 8,
    alignSelf: "stretch",
    alignItems: "center",
    justifyContent: "center",
  },
  line: {
    width: 3,
    borderRadius: theme.borderRadius.sm,
    backgroundColor: theme.colors.border,
    variants: {
      dragging: {
        true: { height: 120, backgroundColor: theme.colors.foregroundMuted },
        false: { height: 40 },
      },
    },
  },
}));
